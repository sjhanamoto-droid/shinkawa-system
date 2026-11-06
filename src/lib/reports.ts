// 日報のルール（純関数。サーバー／クライアント両方から使う）
//
// - 日報の単位は「作業者 × 実施回 × 作業日」。複数日の工事は日ごとに1通。
// - 書くのは担当者本人。ログインしない作業者の分などは最高管理者・事務が代理で書ける。
// - 日報（と写真）はログインしている全員が見られる（現場の詳細に、その現場の日報と写真が全員分たまる）。
//   経費は本人・入力者・最高管理者・事務だけ（手配担当・ほかのスタッフには見せない）。
// - 担当者全員が「最終日」の日報を提出したら、実施回を自動で完了にする（完了ボタンは置かない）。

import { isManager, isPlanner, type Actor } from "./permissions";
import { NON_WORK_CATEGORIES } from "./constants";

export type ReportStatus = "DRAFT" | "SUBMITTED";
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  DRAFT: "下書き",
  SUBMITTED: "提出済",
};
export function isReportStatus(v: string | null | undefined): v is ReportStatus {
  return v === "DRAFT" || v === "SUBMITTED";
}

// ── 経費の科目（領収書OCRの判別先にもなる） ──
export type ExpenseCategory = "TRAVEL" | "PARKING" | "HIGHWAY" | "FUEL" | "SUPPLIES" | "OTHER";
export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRAVEL: "旅費交通費",
  PARKING: "駐車場代",
  HIGHWAY: "高速代",
  FUEL: "ガソリン代",
  SUPPLIES: "材料・消耗品費",
  OTHER: "その他",
};
export const EXPENSE_CATEGORY_OPTIONS = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];
/** 経費の利用日（YYYY-MM-DD）として正しい日付か */
export function isExpenseDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** 利用日の表示（例：9/26） */
export function fmtExpenseDate(v: string | null | undefined): string {
  if (!v || !isExpenseDate(v)) return "";
  return `${+v.slice(5, 7)}/${+v.slice(8, 10)}`;
}

export function isExpenseCategory(v: string | null | undefined): v is ExpenseCategory {
  return !!v && v in EXPENSE_CATEGORY_LABEL;
}

/** 未提出を探しにいく日数（今日を含まない過去分） */
export const MISSING_LOOKBACK_DAYS = 14;

// ── 日付キー（'YYYY-MM-DD'）の計算。UTC 固定でタイムゾーンの影響を受けない ──
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** 実施回の作業日を並べる（複数日なら開始日〜終了日、単日ならその日だけ） */
export function occurrenceWorkDays(dateKey: string, endDateKey: string | null | undefined): string[] {
  const end = endDateKey && endDateKey > dateKey ? endDateKey : dateKey;
  const out: string[] = [];
  let k = dateKey;
  // 念のため上限（1年）を設けて無限ループを防ぐ
  while (k <= end && out.length < 366) {
    out.push(k);
    k = shiftKey(k, 1);
  }
  return out;
}

/** 実施回の最終日（自動完了の判定に使う日） */
export function lastWorkDay(dateKey: string, endDateKey: string | null | undefined): string {
  return endDateKey && endDateKey > dateKey ? endDateKey : dateKey;
}

/** その実施回に日報が必要か（日付があり、中止でなく、「休み」でない） */
export function isReportDue(o: { date: string | null; status: string; category: string }): boolean {
  if (!o.date) return false;
  if (o.status === "CANCELLED") return false;
  return !(NON_WORK_CATEGORIES as string[]).includes(o.category);
}

/**
 * 自動で完了にするか。担当者が1人以上いて、担当者全員が最終日の日報を提出済みで、
 * まだ完了・中止になっていないとき true（日報は担当者それぞれが書く。勤怠を兼ねるため）。
 */
export function shouldAutoComplete(input: {
  status: string;
  assigneeIds: string[];
  submittedOnLastDay: string[];
}): boolean {
  if (input.status === "DONE" || input.status === "CANCELLED") return false;
  if (input.assigneeIds.length === 0) return false;
  const submitted = new Set(input.submittedOnLastDay);
  return input.assigneeIds.every((id) => submitted.has(id));
}

// ─────────────────────────── 入力の記録（稼働時間の確認用） ───────────────────────────

/** 作業日からこの日数以上たって提出された日報を「後から入力」とする（翌日の提出は夜間作業・帰宅後もあるので普通） */
export const LATE_ENTRY_DAYS = 2;

/** 'HH:mm'（日本時間） */
function jstTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

function jstKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function keyDiffDays(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export type ReportEntryFlags = {
  /** 提出したのが作業日の何日後か（未提出は null） */
  delayDays: number | null;
  /** 作業日から LATE_ENTRY_DAYS 日以上たって提出 */
  late: boolean;
  /** 作業日の当日、日報の終了時刻より前に提出（日付をまたぐ作業は除く） */
  beforeEnd: boolean;
  /** 提出後に開始・終了時刻を直した回数 */
  timeEdits: number;
};

/**
 * 日報の入力日時から、管理者が確認したほうがよい点を出す。
 * 「終了前に提出」は提出したときの時刻で見る（提出後に時刻を直していれば、最初の修正の「直す前」が提出時の時刻）
 */
export function reportEntryFlags(r: {
  workDateKey: string;
  startTime: string;
  endTime: string;
  submittedAt: Date | null;
  timeEdits: number;
  firstEdit?: { fromStart: string; fromEnd: string } | null;
}): ReportEntryFlags {
  if (!r.submittedAt) return { delayDays: null, late: false, beforeEnd: false, timeEdits: r.timeEdits };
  const submittedKey = jstKey(r.submittedAt);
  const delayDays = keyDiffDays(r.workDateKey, submittedKey);
  const start = r.firstEdit?.fromStart ?? r.startTime;
  const end = r.firstEdit?.fromEnd ?? r.endTime;
  const beforeEnd = delayDays <= 0 && !crossesMidnight(start, end) && jstTime(r.submittedAt) < end;
  return { delayDays, late: delayDays >= LATE_ENTRY_DAYS, beforeEnd, timeEdits: r.timeEdits };
}

/** 確認したほうがよい点があるか */
export function needsEntryCheck(f: ReportEntryFlags): boolean {
  return f.late || f.beforeEnd || f.timeEdits > 0;
}

/** 終了が開始より前＝日付をまたぐ夜間作業（終了は翌日の時刻） */
export function crossesMidnight(start: string, end: string): boolean {
  return /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && end < start;
}

/** 'HH:mm' 同士の差（分）。終了が開始より前なら翌日の時刻とみなす（22:00〜5:00＝7時間）。同じ時刻は 0 */
export function workMinutes(start: string, end: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const diff = toMin(end) - toMin(start);
  return diff < 0 ? diff + 24 * 60 : diff;
}

/** 「9:00〜17:00」「22:00〜翌5:00」 */
export function fmtTimeRange(start: string, end: string): string {
  return `${start}〜${crossesMidnight(start, end) ? "翌" : ""}${end}`;
}

/** 日報の時刻の刻み（分） */
export const REPORT_TIME_STEP = 10;

/** 'HH:mm' が10分単位か */
export function isTimeOnStep(t: string, step = REPORT_TIME_STEP): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  return !!m && Number(m[2]) % step === 0;
}

/** 'HH:mm' を近い10分に丸める（23:55 以降は 23:50）。形式が違えば fallback を返す */
export function roundTimeToStep(t: string | null | undefined, fallback: string, step = REPORT_TIME_STEP): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return fallback;
  let total = Math.round((Number(m[1]) * 60 + Number(m[2])) / step) * step;
  total = Math.min(total, 23 * 60 + 60 - step);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function fmtWorkHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

// ── 権限 ──

type ReportOwner = { userId: string; createdById: string | null };

/** targetUserId の日報を書けるか（本人、または最高管理者・事務の代理入力） */
export function canWriteReportFor(actor: Actor | null | undefined, targetUserId: string): boolean {
  if (!actor) return false;
  return actor.id === targetUserId || isManager(actor);
}

/** 代理入力になるか（自分以外の分を書く） */
export function isProxyWrite(actor: Actor, targetUserId: string): boolean {
  return actor.id !== targetUserId;
}

/** 日報を見られるか。前回の作業の様子を確認できるよう、ログインしている全員が見られる（経費は canSeeReportExpenses） */
export function canViewReport(actor: Actor | null | undefined, _r: ReportOwner): boolean {
  void _r;
  return !!actor;
}

export function canEditReport(actor: Actor | null | undefined, r: ReportOwner): boolean {
  if (!actor) return false;
  return actor.id === r.userId || actor.id === r.createdById || isManager(actor);
}

/** 経費（駐車場代・電車賃・その他）を見られるか。手配担当には見せない */
export function canSeeReportExpenses(actor: Actor | null | undefined, r: ReportOwner): boolean {
  if (!actor) return false;
  return actor.id === r.userId || actor.id === r.createdById || isManager(actor);
}

/** 全員分の日報一覧を見られるか */
export function canViewAllReports(actor: Actor | null | undefined): boolean {
  return isPlanner(actor);
}
