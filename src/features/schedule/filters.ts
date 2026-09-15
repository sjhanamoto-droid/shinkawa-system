// searchParams ⇄ FilterState と、表示範囲・URL生成（純関数。サーバー／クライアント共用）
import type { FilterState, ViewMode } from "./types";
import { isCategory, isOccurrenceStatus } from "@/lib/constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isViewMode(v: string | undefined): v is ViewMode {
  return v === "month" || v === "week" || v === "day" || v === "board";
}

// ── 日付キーの純粋な計算（UTC 固定でタイムゾーンの影響を受けない） ──
export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + days);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function weekStartOf(key: string): string {
  return shiftKey(key, -weekdayOfKey(key));
}
export function monthStartOf(key: string): string {
  return `${key.slice(0, 7)}-01`;
}
export function monthEndExclusive(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}
export function shiftMonthKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}
export function ymOf(key: string): string {
  return key.slice(0, 7);
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
  opts: { today: string; defaultMine: boolean },
): FilterState {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const viewRaw = get("view");
  const view: ViewMode = isViewMode(viewRaw) ? viewRaw : "week";
  const dRaw = get("d");
  const date = dRaw && DATE_RE.test(dRaw) ? dRaw : opts.today;
  const deptRaw = get("dept");
  const dept = deptRaw === "CLEANING" || deptRaw === "CONSTRUCTION" ? deptRaw : "ALL";
  const cat = get("cat");
  const status = get("status");
  const mineRaw = get("mine");
  const mine = mineRaw === "1" ? true : mineRaw === "0" ? false : opts.defaultMine;
  return {
    view,
    date,
    dept,
    worker: get("worker") || null,
    category: cat && isCategory(cat) ? cat : null,
    customer: get("customer") || null,
    status: status && isOccurrenceStatus(status) ? status : null,
    mine,
    q: (get("q") ?? "").trim(),
  };
}

/** 表示範囲（end は排他）。board は week と同じ。 */
export function rangeFor(f: FilterState): { start: string; end: string } {
  if (f.view === "month") return { start: monthStartOf(f.date), end: monthEndExclusive(f.date) };
  if (f.view === "day") return { start: f.date, end: shiftKey(f.date, 1) };
  const start = weekStartOf(f.date);
  return { start, end: shiftKey(start, 7) };
}

/** 範囲に含まれる月（未割当レーンの対象月） */
export function monthsInRange(range: { start: string; end: string }): string[] {
  const out: string[] = [];
  let cur = monthStartOf(range.start);
  const lastKey = shiftKey(range.end, -1);
  while (cur <= lastKey) {
    out.push(ymOf(cur));
    cur = monthEndExclusive(cur);
  }
  return out;
}

export function scheduleHref(f: FilterState, patch: Partial<FilterState> = {}, opts?: { defaultMine?: boolean }): string {
  const n = { ...f, ...patch };
  const p = new URLSearchParams();
  p.set("view", n.view);
  p.set("d", n.date);
  if (n.dept !== "ALL") p.set("dept", n.dept);
  if (n.worker) p.set("worker", n.worker);
  if (n.category) p.set("cat", n.category);
  if (n.customer) p.set("customer", n.customer);
  if (n.status) p.set("status", n.status);
  const defaultMine = opts?.defaultMine ?? false;
  if (n.mine !== defaultMine) p.set("mine", n.mine ? "1" : "0");
  if (n.q) p.set("q", n.q);
  return `/schedule?${p.toString()}`;
}

/** 前後移動の基準日 */
export function stepDate(f: FilterState, dir: -1 | 1): string {
  if (f.view === "month") return shiftMonthKey(monthStartOf(f.date), dir);
  if (f.view === "day") return shiftKey(f.date, dir);
  return shiftKey(f.date, 7 * dir);
}

export const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function fmtKeyLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${y}年${m}月${d}日（${WEEKDAY_JA[weekdayOfKey(key)]}）`;
}
export function fmtKeyShort(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}/${d}（${WEEKDAY_JA[weekdayOfKey(key)]}）`;
}
export function fmtYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}
