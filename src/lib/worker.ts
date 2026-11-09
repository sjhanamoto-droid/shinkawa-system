// スタッフ画面のルール（純関数）。画面の決まりはデザイン資料 01_spec/rules.md。

import { REPORT_TIME_STEP } from "./reports";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** 'YYYY-MM-DD' → 「10月5日（月）」 */
export function fmtDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEKDAY[dow]}）`;
}

/** 'HH:mm' → 分。不正なら null */
export function toMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** 分 → 'HH:mm'（24時以降は翌日の時刻として 0〜23 時に戻す） */
export function fromMinutes(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** 表示：8:00、24時以降は「翌1:00」 */
export function fmtClock(min: number): string {
  const next = min >= 1440;
  const v = next ? min - 1440 : min;
  return `${next ? "翌" : ""}${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

/** 'HH:mm' を「8:00」に（先頭の0を外す） */
export function fmtHm(t: string | null | undefined): string {
  const m = toMinutes(t);
  return m === null ? "" : fmtClock(m);
}

export const TIME_STEP = REPORT_TIME_STEP;
/** 終わった時間の上限（翌日の23:50まで） */
export const MAX_END_MIN = 1440 + 1440 - TIME_STEP;

/** ＋−で動かす（刻みに合わせる）。開始は 0〜23:50、終了は開始より後〜翌日まで */
export function stepTime(min: number, dir: 1 | -1, lo: number, hi: number): number {
  const snapped = dir > 0 ? Math.floor(min / TIME_STEP) * TIME_STEP + TIME_STEP : Math.ceil(min / TIME_STEP) * TIME_STEP - TIME_STEP;
  return Math.min(hi, Math.max(lo, snapped));
}

/** 開始・終了（分。終了は翌日なら 1440 以上）→ 保存する 'HH:mm' の組 */
export function toSavedTimes(startMin: number, endMin: number): { startTime: string; endTime: string } {
  return { startTime: fromMinutes(startMin), endTime: fromMinutes(endMin) };
}

/** 保存されている 'HH:mm' の組 → 分（終了が開始より前なら翌日） */
export function fromSavedTimes(startTime: string, endTime: string): { startMin: number; endMin: number } {
  const s = toMinutes(startTime) ?? 9 * 60;
  let e = toMinutes(endTime) ?? 17 * 60;
  if (e <= s) e += 1440;
  return { startMin: s, endMin: e };
}

/** 合計の表示：「9時間」「8時間30分」 */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** 進み具合のマスの表示：「9h」「8.5h」 */
export function fmtHoursShort(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return `${h}h`;
}

export function fmtYenShort(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

// ── 現場（予定）の状態 ──

export type VisitState = "before" | "due" | "sent";

/** 主ボタンを「日報を書く」に切り替える、終了予定の何分前か */
export const DUE_BEFORE_END_MIN = 30;

/**
 * 今日の現場の状態。提出済み → sent。過去の日、または今日で終了予定の30分前を過ぎたら due（日報送付前）。
 * 終了予定が無ければ開始予定を過ぎたら due。どちらも無ければ due（いつでも書ける）。
 */
export function visitState(v: { dateKey: string; startTime: string | null; endTime: string | null; submitted: boolean }, todayKey: string, nowMin: number): VisitState {
  if (v.submitted) return "sent";
  if (v.dateKey < todayKey) return "due";
  if (v.dateKey > todayKey) return "before";
  const start = toMinutes(v.startTime);
  let end = toMinutes(v.endTime);
  if (end !== null && start !== null && end <= start) end += 1440;
  if (end !== null) return nowMin >= end - DUE_BEFORE_END_MIN ? "due" : "before";
  if (start !== null) return nowMin >= start ? "due" : "before";
  return "due";
}

/** ホームの札に出す現場：日報送付前を優先、無ければ提出していない次の現場。すべて提出済みなら null */
export function pickFocus<T extends { state: VisitState }>(visits: T[]): T | null {
  return visits.find((v) => v.state === "due") ?? visits.find((v) => v.state !== "sent") ?? null;
}
