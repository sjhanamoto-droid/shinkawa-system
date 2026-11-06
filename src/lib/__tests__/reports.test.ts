import { describe, it, expect } from "vitest";
import {
  isExpenseDate,
  fmtExpenseDate,
  occurrenceWorkDays,
  lastWorkDay,
  isReportDue,
  shouldAutoComplete,
  workMinutes,
  crossesMidnight,
  fmtTimeRange,
  fmtWorkHours,
  isTimeOnStep,
  roundTimeToStep,
  canWriteReportFor,
  canViewReport,
  canEditReport,
  canSeeReportExpenses,
  canViewAllReports,
  reportEntryFlags,
  needsEntryCheck,
} from "@/lib/reports";
import type { Actor } from "@/lib/permissions";

const owner: Actor = { id: "u-owner", role: "OWNER", department: null };
const office: Actor = { id: "u-office", role: "OFFICE", department: null };
const sched: Actor = { id: "u-sched", role: "SCHEDULER", department: "CLEANING" };
const staff: Actor = { id: "u-staff", role: "STAFF", department: "CLEANING" };
const other: Actor = { id: "u-other", role: "STAFF", department: "CLEANING" };

describe("reports: 作業日", () => {
  it("単日はその日だけ", () => {
    expect(occurrenceWorkDays("2026-09-25", null)).toEqual(["2026-09-25"]);
    expect(lastWorkDay("2026-09-25", null)).toBe("2026-09-25");
  });
  it("複数日は開始〜終了（月またぎ含む）", () => {
    expect(occurrenceWorkDays("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(lastWorkDay("2026-09-29", "2026-10-02")).toBe("2026-10-02");
  });
  it("終了日が開始日以前なら単日扱い", () => {
    expect(occurrenceWorkDays("2026-09-25", "2026-09-20")).toEqual(["2026-09-25"]);
  });
});

describe("reports: 日報が必要か", () => {
  it("日付なし・中止・休みは不要", () => {
    expect(isReportDue({ date: null, status: "UNASSIGNED", category: "REGULAR_CLEANING" })).toBe(false);
    expect(isReportDue({ date: "2026-09-25", status: "CANCELLED", category: "REGULAR_CLEANING" })).toBe(false);
    expect(isReportDue({ date: "2026-09-25", status: "CONFIRMED", category: "OFF" })).toBe(false);
    expect(isReportDue({ date: "2026-09-25", status: "TENTATIVE", category: "INTERIOR" })).toBe(true);
  });
});

describe("reports: 自動完了", () => {
  it("全員提出で完了", () => {
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: ["b", "a"] })).toBe(true);
  });
  it("担当者のうち1人だけの提出では完了しない（全員が書く）", () => {
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: ["a"] })).toBe(false);
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: ["a", "c"] })).toBe(false);
  });
  it("担当者以外の提出だけでは完了しない", () => {
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: ["c"] })).toBe(false);
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: [] })).toBe(false);
  });
  it("担当者なし・完了済み・中止は対象外", () => {
    expect(shouldAutoComplete({ status: "TENTATIVE", assigneeIds: [], submittedOnLastDay: [] })).toBe(false);
    expect(shouldAutoComplete({ status: "DONE", assigneeIds: ["a"], submittedOnLastDay: ["a"] })).toBe(false);
    expect(shouldAutoComplete({ status: "CANCELLED", assigneeIds: ["a"], submittedOnLastDay: ["a"] })).toBe(false);
  });
});

describe("reports: 日付をまたぐ作業", () => {
  it("終了が開始より前なら翌日の時刻として数える", () => {
    expect(workMinutes("22:00", "05:00")).toBe(420);
    expect(crossesMidnight("22:00", "05:00")).toBe(true);
    expect(crossesMidnight("09:00", "17:00")).toBe(false);
    expect(fmtTimeRange("22:00", "05:00")).toBe("22:00〜翌05:00");
    expect(fmtTimeRange("09:00", "17:00")).toBe("09:00〜17:00");
  });
});

describe("reports: 作業時間", () => {
  it("分で計算し表示する", () => {
    expect(workMinutes("09:00", "17:30")).toBe(510);
    expect(fmtWorkHours(510)).toBe("8時間30分");
    expect(fmtWorkHours(480)).toBe("8時間");
    expect(workMinutes("17:00", "09:00")).toBe(960);
    expect(workMinutes("09:00", "09:00")).toBe(0);
    expect(workMinutes("9:00", "17:00")).toBe(0);
  });
});

describe("reports: 権限", () => {
  const mine = { userId: "u-staff", createdById: "u-staff" };
  const proxied = { userId: "u-partner", createdById: "u-office" };
  it("書けるのは本人と最高管理者・事務（代理）", () => {
    expect(canWriteReportFor(staff, "u-staff")).toBe(true);
    expect(canWriteReportFor(staff, "u-other")).toBe(false);
    expect(canWriteReportFor(sched, "u-staff")).toBe(false);
    expect(canWriteReportFor(office, "u-partner")).toBe(true);
    expect(canWriteReportFor(owner, "u-partner")).toBe(true);
  });
  it("日報はログインしている全員が見られる（経費は別）", () => {
    expect(canViewReport(staff, mine)).toBe(true);
    expect(canViewReport(other, mine)).toBe(true);
    expect(canViewReport(null, mine)).toBe(false);
    expect(canViewReport(sched, mine)).toBe(true);
    expect(canViewReport(office, proxied)).toBe(true);
    expect(canViewAllReports(sched)).toBe(true);
    expect(canViewAllReports(staff)).toBe(false);
  });
  it("直せるのは本人・入力者・最高管理者・事務", () => {
    expect(canEditReport(staff, mine)).toBe(true);
    expect(canEditReport(sched, mine)).toBe(false);
    expect(canEditReport(office, mine)).toBe(true);
  });
  it("経費は手配担当に見せない", () => {
    expect(canSeeReportExpenses(staff, mine)).toBe(true);
    expect(canSeeReportExpenses(sched, mine)).toBe(false);
    expect(canSeeReportExpenses(owner, mine)).toBe(true);
    expect(canSeeReportExpenses(other, mine)).toBe(false);
  });
});

describe("reports: 10分刻み", () => {
  it("10分単位かを判定する", () => {
    expect(isTimeOnStep("08:30")).toBe(true);
    expect(isTimeOnStep("08:45")).toBe(false);
    expect(isTimeOnStep("8:30")).toBe(false);
  });
  it("近い10分に丸める", () => {
    expect(roundTimeToStep("08:45", "09:00")).toBe("08:50");
    expect(roundTimeToStep("08:44", "09:00")).toBe("08:40");
    expect(roundTimeToStep("8:15", "09:00")).toBe("08:20");
    expect(roundTimeToStep("23:59", "09:00")).toBe("23:50");
    expect(roundTimeToStep(null, "09:00")).toBe("09:00");
  });
});

describe("経費の利用日", () => {
  it("正しい日付だけを受け付ける", () => {
    expect(isExpenseDate("2026-09-26")).toBe(true);
    expect(isExpenseDate("2028-02-29")).toBe(true);
    expect(isExpenseDate("2026-02-29")).toBe(false);
    expect(isExpenseDate("2026-13-01")).toBe(false);
    expect(isExpenseDate("2026/09/26")).toBe(false);
    expect(isExpenseDate("")).toBe(false);
  });
  it("月/日で表示する", () => {
    expect(fmtExpenseDate("2026-09-06")).toBe("9/6");
    expect(fmtExpenseDate(null)).toBe("");
    expect(fmtExpenseDate("bad")).toBe("");
  });
});

describe("reports: 入力の記録", () => {
  // 日本時間で指定する
  const at = (s: string) => new Date(`${s}+09:00`);
  const base = { workDateKey: "2026-11-02", startTime: "09:00", endTime: "17:00", timeEdits: 0 };
  it("当日の終了後・翌日の提出は問題なし", () => {
    const same = reportEntryFlags({ ...base, submittedAt: at("2026-11-02T17:30:00") });
    expect(same).toEqual({ delayDays: 0, late: false, beforeEnd: false, timeEdits: 0 });
    expect(needsEntryCheck(same)).toBe(false);
    expect(reportEntryFlags({ ...base, submittedAt: at("2026-11-03T08:00:00") }).late).toBe(false);
  });
  it("2日以上あとの提出は後から入力", () => {
    const f = reportEntryFlags({ ...base, submittedAt: at("2026-11-04T10:00:00") });
    expect(f.delayDays).toBe(2);
    expect(f.late).toBe(true);
    expect(needsEntryCheck(f)).toBe(true);
  });
  it("当日、終了時刻より前の提出は印を付ける（日付をまたぐ作業は除く）", () => {
    expect(reportEntryFlags({ ...base, submittedAt: at("2026-11-02T15:00:00") }).beforeEnd).toBe(true);
    expect(reportEntryFlags({ ...base, startTime: "22:00", endTime: "05:00", submittedAt: at("2026-11-02T23:00:00") }).beforeEnd).toBe(false);
    // 日本時間の深夜0時台（UTCでは前日）でも、日付は日本時間で数える
    expect(reportEntryFlags({ ...base, submittedAt: at("2026-11-03T00:30:00") }).delayDays).toBe(1);
  });
  it("提出後に終了時刻を早めても、提出したときの時刻で判定する", () => {
    const f = reportEntryFlags({ ...base, endTime: "14:50", submittedAt: at("2026-11-02T15:00:00"), timeEdits: 1, firstEdit: { fromStart: "09:00", fromEnd: "17:00" } });
    expect(f.beforeEnd).toBe(true);
  });
  it("未提出は印なし、時刻の修正は回数で出す", () => {
    expect(reportEntryFlags({ ...base, submittedAt: null }).delayDays).toBeNull();
    expect(needsEntryCheck(reportEntryFlags({ ...base, submittedAt: at("2026-11-02T18:00:00"), timeEdits: 1 }))).toBe(true);
  });
});
