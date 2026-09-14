// 定期契約の周期ルール → 月ごとの実施回スロット（純関数・DB非依存）
//
// 日付はすべて "YYYY-MM-DD" / "YYYY-MM" の文字列で扱う（タイムゾーンに依存しない）。
// 「何月にやるかは決まっているが日付は未定」というシンカワの運用に合わせ、
// スロットは date（確定候補）を持たない場合もある（そのときは window だけを持ち、未割当レーンに出る）。

import type { RuleKind } from "./constants";
import { WEEKDAY_LABEL } from "./constants";

export type RuleParams = {
  /** MONTHLY / EVERY_N_MONTHS / SEASONAL: 実施日（1〜31。月末を超えたらクランプ）。省略時は日付未定 */
  dayOfMonth?: number | null;
  /** TWICE_MONTHLY: 前半・後半それぞれの実施日。省略時は window のみ */
  firstDay?: number | null;
  secondDay?: number | null;
  /** WEEKLY / NTH_WEEKDAY: 曜日（0=日〜6=土） */
  weekday?: number | null;
  /** NTH_WEEKDAY: 第n（1〜5、-1=最終） */
  nth?: number | null;
  /** EVERY_N_MONTHS: 間隔と起点月 */
  interval?: number | null;
  anchorMonth?: string | null; // "YYYY-MM"
  /** SEASONAL: 実施月（1〜12） */
  months?: number[] | null;
};

export type RuleSlot = {
  index: number; // 月内の通し番号（seriesKey に使う）
  date: string | null; // "YYYY-MM-DD"。null = 日付未定（未割当レーン）
  windowStart: string; // 候補期間
  windowEnd: string;
  label: string | null; // "前半" / "後半" / "第2火曜" など
};

// ── 日付ユーティリティ（UTC 固定で計算し、TZ の影響を受けない） ──

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseYm(ym: string): { y: number; m: number } {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function ymOf(key: string): string {
  return key.slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const { y, m } = parseYm(ym);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthsBetween(fromYm: string, toYm: string): number {
  const a = parseYm(fromYm);
  const b = parseYm(toYm);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

export function weekdayOf(key: string): number {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 月内の第n曜日（nth=-1 は最終）。存在しなければ null */
export function nthWeekdayOfMonth(ym: string, weekday: number, nth: number): string | null {
  const { y, m } = parseYm(ym);
  const dim = daysInMonth(ym);
  if (nth === -1) {
    for (let d = dim; d >= 1; d--) {
      if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) return keyOf(y, m, d);
    }
    return null;
  }
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) {
      count++;
      if (count === nth) return keyOf(y, m, d);
    }
  }
  return null;
}

/** 月内で指定曜日に当たる日をすべて返す */
export function weekdaysOfMonth(ym: string, weekday: number): string[] {
  const { y, m } = parseYm(ym);
  const dim = daysInMonth(ym);
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) out.push(keyOf(y, m, d));
  }
  return out;
}

/** 月内の第何週目か（その日が月内で何回目の同曜日か。1始まり） */
export function nthOfWeekdayInMonth(key: string): number {
  const { d } = parseKey(key);
  return Math.floor((d - 1) / 7) + 1;
}

function clampDay(ym: string, day: number | null | undefined): string | null {
  if (!day || day < 1) return null;
  const { y, m } = parseYm(ym);
  return keyOf(y, m, Math.min(day, daysInMonth(ym)));
}

// ── ルール → スロット ──

export function slotsForMonth(kind: RuleKind, params: RuleParams, ym: string): RuleSlot[] {
  const { y, m } = parseYm(ym);
  const dim = daysInMonth(ym);
  const first = keyOf(y, m, 1);
  const last = keyOf(y, m, dim);

  switch (kind) {
    case "MONTHLY":
      return [
        {
          index: 0,
          date: clampDay(ym, params.dayOfMonth),
          windowStart: first,
          windowEnd: last,
          label: null,
        },
      ];

    case "TWICE_MONTHLY": {
      const mid = keyOf(y, m, 15);
      const secondStart = keyOf(y, m, 16);
      const firstDate = params.firstDay ? clampDay(ym, Math.min(params.firstDay, 15)) : null;
      const secondDate = params.secondDay ? clampDay(ym, Math.max(params.secondDay, 16)) : null;
      return [
        { index: 0, date: firstDate, windowStart: first, windowEnd: mid, label: "前半" },
        { index: 1, date: secondDate, windowStart: secondStart, windowEnd: last, label: "後半" },
      ];
    }

    case "WEEKLY": {
      const wd = params.weekday ?? 0;
      return weekdaysOfMonth(ym, wd).map((date, i) => ({
        index: i,
        date,
        windowStart: date,
        windowEnd: date,
        label: `${WEEKDAY_LABEL[wd]}曜`,
      }));
    }

    case "NTH_WEEKDAY": {
      const wd = params.weekday ?? 0;
      const nth = params.nth ?? 1;
      const date = nthWeekdayOfMonth(ym, wd, nth);
      if (!date) return [];
      return [
        {
          index: 0,
          date,
          windowStart: date,
          windowEnd: date,
          label: `${nth === -1 ? "最終" : `第${nth}`}${WEEKDAY_LABEL[wd]}曜`,
        },
      ];
    }

    case "EVERY_N_MONTHS": {
      const interval = Math.max(1, params.interval ?? 1);
      const anchor = params.anchorMonth ?? ym;
      const diff = monthsBetween(anchor, ym);
      if (diff < 0 && Math.abs(diff) % interval !== 0) return [];
      if (diff >= 0 && diff % interval !== 0) return [];
      return [
        {
          index: 0,
          date: clampDay(ym, params.dayOfMonth),
          windowStart: first,
          windowEnd: last,
          label: null,
        },
      ];
    }

    case "SEASONAL": {
      const months = params.months ?? [];
      if (!months.includes(m)) return [];
      return [
        {
          index: 0,
          date: clampDay(ym, params.dayOfMonth),
          windowStart: first,
          windowEnd: last,
          label: `${m}月`,
        },
      ];
    }

    default:
      return [];
  }
}

/**
 * 実施回を新しい日付へ動かして「以降の定期も」を選んだとき、ルールを新日付に合わせて更新する。
 * 返り値は更新後の params（元の params は変更しない）。
 */
export function ruleFromDate(
  kind: RuleKind,
  params: RuleParams,
  dateKey: string,
  slotIndex = 0,
): RuleParams {
  const { d } = parseKey(dateKey);
  const next: RuleParams = { ...params };
  switch (kind) {
    case "MONTHLY":
    case "EVERY_N_MONTHS":
    case "SEASONAL":
      next.dayOfMonth = d;
      return next;
    case "TWICE_MONTHLY":
      if (slotIndex === 0) next.firstDay = Math.min(d, 15);
      else next.secondDay = Math.max(d, 16);
      return next;
    case "WEEKLY":
      next.weekday = weekdayOf(dateKey);
      return next;
    case "NTH_WEEKDAY":
      next.weekday = weekdayOf(dateKey);
      next.nth = nthOfWeekdayInMonth(dateKey);
      return next;
    default:
      return next;
  }
}

export function describeRule(kind: RuleKind | null | undefined, params: RuleParams | null | undefined): string {
  if (!kind) return "単発";
  const p = params ?? {};
  const day = p.dayOfMonth ? `${p.dayOfMonth}日` : "日付未定";
  switch (kind) {
    case "MONTHLY":
      return `毎月 ${day}`;
    case "TWICE_MONTHLY": {
      const a = p.firstDay ? `${p.firstDay}日` : "前半";
      const b = p.secondDay ? `${p.secondDay}日` : "後半";
      return `月2回（${a}・${b}）`;
    }
    case "WEEKLY":
      return `毎週 ${WEEKDAY_LABEL[p.weekday ?? 0]}曜`;
    case "NTH_WEEKDAY":
      return `${p.nth === -1 ? "最終" : `第${p.nth ?? 1}`}${WEEKDAY_LABEL[p.weekday ?? 0]}曜`;
    case "EVERY_N_MONTHS": {
      const n = p.interval ?? 1;
      const anchor = p.anchorMonth ? `（${p.anchorMonth.slice(5)}月起点）` : "";
      return `${n}か月ごと ${day}${anchor}`;
    }
    case "SEASONAL": {
      const ms = (p.months ?? []).slice().sort((a, b) => a - b);
      return `${ms.length ? ms.map((x) => `${x}月`).join("・") : "月未設定"} ${day}`;
    }
    default:
      return String(kind);
  }
}

export function seriesKey(jobId: string, ym: string, index: number): string {
  return `${jobId}:${ym}:${index}`;
}

/** ルールの妥当性チェック。問題なければ null、あればメッセージ */
export function validateRule(kind: RuleKind, params: RuleParams): string | null {
  const dayOk = (v: number | null | undefined) => v == null || (Number.isInteger(v) && v >= 1 && v <= 31);
  switch (kind) {
    case "MONTHLY":
      return dayOk(params.dayOfMonth) ? null : "実施日は1〜31で指定してください";
    case "TWICE_MONTHLY":
      if (!dayOk(params.firstDay) || !dayOk(params.secondDay)) return "実施日は1〜31で指定してください";
      if (params.firstDay && params.firstDay > 15) return "前半の実施日は15日以前にしてください";
      if (params.secondDay && params.secondDay < 16) return "後半の実施日は16日以降にしてください";
      return null;
    case "WEEKLY":
      return params.weekday != null && params.weekday >= 0 && params.weekday <= 6
        ? null
        : "曜日を指定してください";
    case "NTH_WEEKDAY":
      if (params.weekday == null || params.weekday < 0 || params.weekday > 6) return "曜日を指定してください";
      if (params.nth == null || !(params.nth === -1 || (params.nth >= 1 && params.nth <= 5)))
        return "第n（1〜5、または最終）を指定してください";
      return null;
    case "EVERY_N_MONTHS":
      if (!params.interval || params.interval < 2 || params.interval > 12) return "間隔は2〜12か月で指定してください";
      if (!params.anchorMonth || !/^\d{4}-\d{2}$/.test(params.anchorMonth)) return "起点月（YYYY-MM）を指定してください";
      return dayOk(params.dayOfMonth) ? null : "実施日は1〜31で指定してください";
    case "SEASONAL":
      if (!params.months || params.months.length === 0) return "実施月を1つ以上指定してください";
      if (params.months.some((m) => m < 1 || m > 12)) return "実施月は1〜12で指定してください";
      return dayOk(params.dayOfMonth) ? null : "実施日は1〜31で指定してください";
    default:
      return "不明な周期です";
  }
}
