"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { Prisma } from "@prisma/client";
import {
  fareOptionLabel,
  isNavitimeConfigured,
  isNavitimePaused,
  navitimeFareTable,
  navitimeSearchIc,
  navitimeTollOptions,
  type IcHit,
  type TollFareOption,
  type TollFares,
} from "./navitime";

// スタッフ画面の高速料金。NAVITIME が使えれば IC 検索と料金を出し、結果は DB に残して使い回す。
// 一度調べた区間は期限なしで保存し、次からは API を使わない（「調べ直す」を押したときだけ使う）。
// 使えないときは、過去に入力されたインター名と、同じ区間・車種の前回の金額を出す（無ければ手入力）。

export type IcOption = { id: string | null; name: string; roadName: string | null };

/** よく使うインター（会社で過去に入力された高速代の区間から、多い順） */
export async function frequentInterchanges(): Promise<{ items: IcOption[]; apiEnabled: boolean }> {
  await requireUser();
  const rows = await db.reportExpense.findMany({
    where: { category: "HIGHWAY", tollFrom: { not: null } },
    select: { tollFrom: true, tollTo: true, tollFromIcId: true, tollToIcId: true },
    orderBy: { id: "desc" },
    take: 500,
  });
  const count = new Map<string, { opt: IcOption; n: number }>();
  const add = (name: string | null, id: string | null) => {
    if (!name) return;
    const cur = count.get(name);
    if (cur) cur.n += 1;
    else count.set(name, { opt: { id, name, roadName: null }, n: 1 });
  };
  for (const r of rows) {
    add(r.tollFrom, r.tollFromIcId);
    add(r.tollTo, r.tollToIcId);
  }
  const items = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((x) => x.opt);
  return { items, apiEnabled: isNavitimeConfigured() && !isNavitimePaused() };
}

export type IcSearchResult = {
  items: IcOption[];
  apiEnabled: boolean;
  /** 保存済みのインターから見つかった（「全国から探す」で NAVITIME に聞ける） */
  canSearchRemote: boolean;
};

/**
 * インターを名前で探す。NAVITIME の回数（RapidAPI の無料枠は月500回）を節約するため、
 * まず保存済みのインターと過去の入力から探し、見つからないとき（または「全国から探す」）だけ NAVITIME に聞く。
 */
export async function searchInterchanges(word: string, opts: { remote?: boolean } = {}): Promise<IcSearchResult> {
  await requireUser();
  const q = (typeof word === "string" ? word : "").trim().slice(0, 30);
  const apiEnabled = isNavitimeConfigured() && !isNavitimePaused();
  if (!q) return { items: [], apiEnabled, canSearchRemote: false };

  const [saved, past] = await Promise.all([
    db.interchange.findMany({ where: { name: { contains: q } }, take: 20, orderBy: { name: "asc" } }),
    db.reportExpense.findMany({
      where: { category: "HIGHWAY", OR: [{ tollFrom: { contains: q } }, { tollTo: { contains: q } }] },
      select: { tollFrom: true, tollTo: true, tollFromIcId: true, tollToIcId: true },
      take: 100,
    }),
  ]);
  const map = new Map<string, IcOption>();
  for (const s of saved) map.set(`${s.id}`, { id: s.id, name: s.name, roadName: s.roadName });
  for (const p of past) {
    for (const [name, id] of [[p.tollFrom, p.tollFromIcId], [p.tollTo, p.tollToIcId]] as const) {
      if (!name?.includes(q)) continue;
      const k = id ?? `name:${name}`;
      if (!map.has(k) && ![...map.values()].some((o) => o.name === name)) map.set(k, { id, name, roadName: null });
    }
  }
  // 打った名前とぴったり合うもの → 名前の始まりが合うもの → そのほか の順（「本牧ふ頭」で「南本牧ふ頭」が先に出ないように）
  const rank = (o: IcOption) => (o.name === q ? 0 : o.name.startsWith(q) ? 1 : 2);
  const local = [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, 20);
  const localHasIds = local.some((o) => o.id);

  // 2文字以上で、保存済みに無いとき（または頼まれたとき）だけ NAVITIME に聞く
  if (apiEnabled && q.length >= 2 && (opts.remote || !localHasIds)) {
    try {
      const hits: IcHit[] = await navitimeSearchIc(q);
      await Promise.all(
        hits.map((h) => db.interchange.upsert({ where: { id: h.id }, create: { id: h.id, name: h.name, roadName: h.roadName }, update: { name: h.name, roadName: h.roadName } })),
      );
      const items = hits.map((h) => ({ id: h.id, name: h.name, roadName: h.roadName }));
      items.sort((a, b) => rank(a) - rank(b));
      return { items, apiEnabled: true, canSearchRemote: false };
    } catch (e) {
      console.error("[tolls] ic search failed", e);
    }
  }
  return { items: local, apiEnabled, canSearchRemote: apiEnabled && q.length >= 2 && localHasIds && !opts.remote };
}

/** よく使う区間（会社で過去に入力された高速代から、多い順） */
export type FrequentRoute = { from: IcOption; to: IcOption; count: number };

export async function frequentRoutes(): Promise<FrequentRoute[]> {
  await requireUser();
  const rows = await db.reportExpense.findMany({
    where: { category: "HIGHWAY", tollFrom: { not: null }, tollTo: { not: null } },
    select: { tollFrom: true, tollTo: true, tollFromIcId: true, tollToIcId: true },
    orderBy: { report: { workDate: "desc" } },
    take: 1000,
  });
  const map = new Map<string, FrequentRoute>();
  for (const r of rows) {
    const k = `${r.tollFrom}→${r.tollTo}`;
    const cur = map.get(k);
    if (cur) cur.count += 1;
    else map.set(k, { from: { id: r.tollFromIcId, name: r.tollFrom!, roadName: null }, to: { id: r.tollToIcId, name: r.tollTo!, roadName: null }, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
}

export type TollQuoteOption = {
  /** 運賃区分（1025＝ETC、1024＝現金、ほかは割引）。前回の入力から出したものは "last:{表示名}" */
  code: string;
  label: string;
  /** 片道の料金（車種別）。その車種に無い種類は null */
  fares: TollFares;
};

export type TollQuote = {
  options: TollQuoteOption[];
  /** 料金がどこから来たか：saved＝保存済み（APIを使っていない）、api＝今 NAVITIME で調べた、last＝前回の入力、none＝不明（手入力） */
  source: "saved" | "api" | "last" | "none";
  /** NAVITIME で調べ直せるか */
  canRefresh: boolean;
};

/** 料金の種類の名前（運賃区分）。知らない区分が出てきたときだけ NAVITIME から一覧を取って保存する */
async function labelOptions(opts: TollFareOption[]): Promise<TollQuoteOption[]> {
  const ids = opts.map((o) => Number(o.code)).filter((n) => Number.isInteger(n));
  let types = await db.tollFareType.findMany({ where: { id: { in: ids } } });
  const known = new Set(types.map((t) => String(t.id)));
  const missing = opts.some((o) => o.code !== "1024" && o.code !== "1025" && !known.has(o.code));
  if (missing && isNavitimeConfigured() && !isNavitimePaused()) {
    try {
      const table = await navitimeFareTable();
      await db.$transaction(table.map((t) => db.tollFareType.upsert({ where: { id: t.id }, create: t, update: t })));
      types = await db.tollFareType.findMany({ where: { id: { in: ids } } });
    } catch (e) {
      console.error("[tolls] fare table failed", e);
    }
  }
  const byId = new Map(types.map((t) => [String(t.id), t]));
  return opts.map((o) => ({ code: o.code, label: fareOptionLabel(o.code, byId.get(o.code)), fares: o.fares }));
}

function isFareOptions(v: unknown): v is TollFareOption[] {
  return Array.isArray(v) && v.every((o) => o && typeof o === "object" && typeof (o as { code?: unknown }).code === "string" && typeof (o as { fares?: unknown }).fares === "object");
}

/**
 * 区間の料金（片道。料金の種類ごと・車種別）。
 * 保存済み → （無ければ・調べ直すときは）NAVITIME → 前回の入力 の順。保存済みなら API は使わない。
 */
export async function quoteToll(raw: { from: string; to: string; fromIcId: string | null; toIcId: string | null; refresh?: boolean }): Promise<TollQuote> {
  await requireUser();
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const from = str(raw?.from, 60);
  const to = str(raw?.to, 60);
  if (!from || !to) return { options: [], source: "none", canRefresh: false };
  let fromIcId = str(raw?.fromIcId, 40);
  let toIcId = str(raw?.toIcId, 40);
  // NAVITIME（回数に上限あり）を呼ぶのは、IC 検索で見つかって保存済みのインターどうしだけ
  if (fromIcId && toIcId) {
    const known = await db.interchange.count({ where: { id: { in: [fromIcId, toIcId] } } });
    if (known < (fromIcId === toIcId ? 1 : 2)) fromIcId = toIcId = null;
  }
  const apiOk = isNavitimeConfigured() && !isNavitimePaused();

  if (fromIcId && toIcId) {
    const key = { fromIcId_toIcId: { fromIcId, toIcId } };
    const saved = await db.tollFare.findUnique({ where: key });
    if (saved && isFareOptions(saved.options) && !raw?.refresh) {
      return { options: await labelOptions(saved.options), source: "saved", canRefresh: apiOk };
    }
    if (apiOk) {
      try {
        const opts = await navitimeTollOptions(fromIcId, toIcId);
        if (opts.length > 0) {
          const etc = opts.find((o) => o.code === "1025")?.fares ?? opts[0].fares;
          const data = {
            fareKei: etc.KEI,
            fareNormal: etc.NORMAL,
            fareMedium: etc.MEDIUM,
            fareLarge: etc.LARGE,
            options: opts as unknown as Prisma.InputJsonValue,
            fetchedAt: new Date(),
          };
          await db.tollFare.upsert({ where: key, create: { fromIcId, toIcId, ...data }, update: data });
          return { options: await labelOptions(opts), source: "api", canRefresh: false };
        }
      } catch (e) {
        console.error("[tolls] fare failed", e);
      }
    }
    if (saved && isFareOptions(saved.options)) return { options: await labelOptions(saved.options), source: "saved", canRefresh: false };
  }

  // 前回、同じ区間で入力された金額（料金の種類ごと・片道に直す）
  const past = await db.reportExpense.findMany({
    where: { category: "HIGHWAY", tollFrom: from, tollTo: to, tollCar: { not: null } },
    select: { tollCar: true, tollRound: true, amount: true, tollFareLabel: true },
    orderBy: { report: { workDate: "desc" } },
    take: 100,
  });
  const byLabel = new Map<string, TollFares>();
  for (const p of past) {
    const label = p.tollFareLabel || "前回の金額";
    const fares = byLabel.get(label) ?? { KEI: null, NORMAL: null, MEDIUM: null, LARGE: null };
    const car = p.tollCar as keyof TollFares;
    if (car in fares && fares[car] === null) fares[car] = p.tollRound ? Math.round(p.amount / 2) : p.amount;
    byLabel.set(label, fares);
  }
  const options = [...byLabel].map(([label, fares]) => ({ code: `last:${label}`, label, fares }));
  return { options, source: options.length ? "last" : "none", canRefresh: false };
}
