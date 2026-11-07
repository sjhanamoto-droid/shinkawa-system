import "server-only";
import { createHmac } from "node:crypto";

// NAVITIME の IC検索（/ic）とルート検索(車)（/route_car）。次のどちらかの設定で使う。
//
// ① RapidAPI（Rakuten RapidAPI の「NAVITIME Route(car)」。Basic プランは月500回まで無料）
//   NAVITIME_RAPIDAPI_KEY   RapidAPI のキー（ヘッダー x-rapidapi-key で送る）
//   NAVITIME_RAPIDAPI_HOST  省略時 navitime-route-car.p.rapidapi.com
// ② ナビタイムと直接契約
//   NAVITIME_HOST  契約で案内されるホスト
//   NAVITIME_CID   契約のクライアントID（URL の一部になる）
//   NAVITIME_SIGNATURE_KEY（署名が必要な契約のみ）… request_code と signature をクエリに付ける
// どちらも無ければ使わない（画面は前回の金額・手入力で動く）。

export type IcHit = { id: string; name: string; roadName: string | null };
export type TollFares = { KEI: number | null; NORMAL: number | null; MEDIUM: number | null; LARGE: number | null };

const RAPID_DEFAULT_HOST = "navitime-route-car.p.rapidapi.com";

function rapidKey(): string | null {
  return process.env.NAVITIME_RAPIDAPI_KEY || null;
}

export function isNavitimeConfigured(): boolean {
  return !!rapidKey() || (!!process.env.NAVITIME_HOST && !!process.env.NAVITIME_CID);
}

/** 回数の上限（RapidAPI の無料枠など）に達したら、しばらく呼ばない（この間は前回の金額・手入力になる） */
let pausedUntil = 0;
const PAUSE_MS = 6 * 60 * 60 * 1000;
export function isNavitimePaused(): boolean {
  return Date.now() < pausedUntil;
}

export function buildNavitimeRequest(path: string, params: Record<string, string>): { url: string; headers: Record<string, string> } {
  const q = new URLSearchParams(params);
  const key = rapidKey();
  if (key) {
    const host = (process.env.NAVITIME_RAPIDAPI_HOST || RAPID_DEFAULT_HOST).replace(/^https?:\/\//, "").replace(/\/$/, "");
    return { url: `https://${host}/${path}?${q.toString()}`, headers: { "x-rapidapi-key": key, "x-rapidapi-host": host } };
  }
  const host = process.env.NAVITIME_HOST!.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cid = process.env.NAVITIME_CID!;
  const sig = process.env.NAVITIME_SIGNATURE_KEY;
  if (sig) {
    const requestCode = `${Date.now()}`;
    q.set("request_code", requestCode);
    q.set("signature", createHmac("sha256", sig).update(requestCode).digest("hex"));
  }
  return { url: `https://${host}/${cid}/v1/${path}?${q.toString()}`, headers: {} };
}

async function getJson(path: string, params: Record<string, string>): Promise<unknown> {
  if (isNavitimePaused()) throw new Error("navitime paused");
  const { url, headers } = buildNavitimeRequest(path, params);
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (res.status === 429 || res.status === 403) {
    // 429＝回数の上限、403＝プラン外。しばらく止めて、手入力に切り替える
    pausedUntil = Date.now() + PAUSE_MS;
  }
  if (!res.ok) throw new Error(`navitime ${res.status}`);
  return res.json();
}

/** インターを名前で探す */
export async function navitimeSearchIc(word: string): Promise<IcHit[]> {
  const json = (await getJson("ic", { word, limit: "20" })) as { items?: unknown[] };
  return parseIcItems(json);
}

export function parseIcItems(json: { items?: unknown[] }): IcHit[] {
  const out: IcHit[] = [];
  const seen = new Set<string>();
  for (const raw of json.items ?? []) {
    const it = raw as Record<string, unknown>;
    const id = typeof it.id === "string" || typeof it.id === "number" ? String(it.id) : "";
    const name = typeof it.name === "string" ? it.name : "";
    if (!id || !name) continue;
    // 同じ名前・同じ道路のインターが複数返ることがある（上り・下りなど）。最初の1つだけ出す
    const key = `${name}|${typeof it.road_name === "string" ? it.road_name : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, name, roadName: typeof it.road_name === "string" ? it.road_name : null });
  }
  return out;
}

/** 料金の種類（運賃区分）ごとの、車種別の片道料金 */
export type TollFareOption = { code: string; fares: TollFares };

/** 乗ったインター → 降りたインターの片道の高速料金。ETC・現金・各種割引ごとの車種別料金 */
export async function navitimeTollOptions(fromIcId: string, toIcId: string): Promise<TollFareOption[]> {
  const json = await getJson("route_car", {
    start: JSON.stringify({ ic: fromIcId, "ic-passing-type": "entrance" }),
    goal: JSON.stringify({ ic: toIcId, "ic-passing-type": "exit" }),
    condition: "toll_time",
    limit: "1",
  });
  return parseTollOptions(json);
}

const CAR_NO: Record<keyof TollFares, number> = { KEI: 1, NORMAL: 2, MEDIUM: 3, LARGE: 4 };
const CASH = "1024";
const ETC = "1025";

/**
 * route_car の応答から、料金の種類ごとの車種別料金を出す。
 * 料金は区間（items[0].fares の move）ごとに unit_{運賃区分}_{車種} で入る（1024＝通常(現金)、1025＝ETC、ほかは割引。
 * 車種 1=軽・二輪 2=普通 3=中型 4=大型）。割引が一部の区間だけのときは、ほかの区間は ETC 料金で足す。
 * その車種に割引がどの区間にも無ければ null（その割引はその車種には出さない）。
 * 区間の内訳が無い応答は summary.move.fare を1区間として扱う。
 */
export function parseTollOptions(json: unknown): TollFareOption[] {
  const item = ((json as { items?: unknown[] })?.items ?? [])[0] as
    | { fares?: { type?: string; detail?: { fare?: Record<string, unknown> } }[]; summary?: { move?: { fare?: Record<string, unknown> } } }
    | undefined;
  if (!item) return [];
  let sections = (item.fares ?? []).filter((f) => f?.type === "move" && f.detail?.fare).map((f) => f.detail!.fare!);
  if (sections.length === 0 && item.summary?.move?.fare) sections = [item.summary.move.fare];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const codes = new Set<string>();
  for (const f of sections) for (const k of Object.keys(f)) {
    const m = /^unit_(\d+)_\d+$/.exec(k);
    if (m) codes.add(m[1]);
  }
  const order = [ETC, CASH, ...[...codes].filter((c) => c !== ETC && c !== CASH).sort((a, b) => Number(a) - Number(b))];
  const out: TollFareOption[] = [];
  for (const code of order) {
    if (!codes.has(code)) continue;
    const fares = { KEI: null, NORMAL: null, MEDIUM: null, LARGE: null } as TollFares;
    for (const car of Object.keys(CAR_NO) as (keyof TollFares)[]) {
      const n = CAR_NO[car];
      if (!sections.some((f) => num(f[`unit_${code}_${n}`]) !== null)) continue;
      let sum = 0;
      let ok = true;
      for (const f of sections) {
        const v = num(f[`unit_${code}_${n}`]) ?? (code === CASH ? null : num(f[`unit_${ETC}_${n}`])) ?? num(f[`unit_${CASH}_${n}`]);
        if (v === null) {
          ok = false;
          break;
        }
        sum += v;
      }
      if (ok) fares[car] = Math.round(sum);
    }
    if (Object.values(fares).some((v) => v !== null)) out.push({ code, fares });
  }
  return out;
}

/** 料金の種類の一覧（運賃区分。名前・道路・適用時間） */
export async function navitimeFareTable(): Promise<{ id: number; caption: string; roadGroup: string | null; payment: string | null; applyTimes: string | null; applyDays: string | null }[]> {
  const json = (await getJson("fare_table", {})) as { items?: unknown[] };
  const out = [];
  for (const raw of json.items ?? []) {
    const it = raw as Record<string, unknown>;
    if (typeof it.id !== "number" || typeof it.caption !== "string") continue;
    const rg = it.road_group as { name?: unknown } | undefined;
    out.push({
      id: it.id,
      caption: it.caption,
      roadGroup: typeof rg?.name === "string" ? rg.name : null,
      payment: typeof it.payment === "string" ? it.payment : null,
      applyTimes: Array.isArray(it.apply_times) ? it.apply_times.join(" ") : null,
      applyDays: Array.isArray(it.apply_days) ? it.apply_days.join(",") : null,
    });
  }
  return out;
}

/** 料金の種類の表示名。例）「ETC料金」「現金」「深夜割引（首都高速道路・0:00-4:00）」 */
export function fareOptionLabel(code: string, t: { caption: string; roadGroup: string | null; applyTimes: string | null } | null | undefined): string {
  if (code === CASH) return "現金";
  if (code === ETC) return "ETC料金";
  if (!t) return `割引（区分${code}）`;
  const extra = [t.roadGroup && !/共通$/.test(t.roadGroup) && !t.caption.includes(t.roadGroup) ? t.roadGroup : null, t.applyTimes && t.applyTimes !== "終日" && !/\d/.test(t.caption) ? t.applyTimes : null].filter(Boolean);
  return extra.length ? `${t.caption}（${extra.join("・")}）` : t.caption;
}

/** 古い形（ETC料金だけ）：車種別の片道料金 */
export function parseTollFares(json: unknown): TollFares {
  const opts = parseTollOptions(json);
  const etc = opts.find((o) => o.code === ETC)?.fares;
  const cash = opts.find((o) => o.code === CASH)?.fares;
  const pick = (k: keyof TollFares) => etc?.[k] ?? cash?.[k] ?? null;
  return { KEI: pick("KEI"), NORMAL: pick("NORMAL"), MEDIUM: pick("MEDIUM"), LARGE: pick("LARGE") };
}
