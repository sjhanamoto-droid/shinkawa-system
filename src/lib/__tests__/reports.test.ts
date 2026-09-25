import { describe, it, expect } from "vitest";
import {
  occurrenceWorkDays,
  lastWorkDay,
  isReportDue,
  shouldAutoComplete,
  workMinutes,
  fmtWorkHours,
  isTimeOnStep,
  roundTimeToStep,
  canWriteReportFor,
  canViewReport,
  canEditReport,
  canSeeReportExpenses,
  canViewAllReports,
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
  it("1人でも未提出なら完了しない", () => {
    expect(shouldAutoComplete({ status: "CONFIRMED", assigneeIds: ["a", "b"], submittedOnLastDay: ["a"] })).toBe(false);
  });
  it("担当者なし・完了済み・中止は対象外", () => {
    expect(shouldAutoComplete({ status: "TENTATIVE", assigneeIds: [], submittedOnLastDay: [] })).toBe(false);
    expect(shouldAutoComplete({ status: "DONE", assigneeIds: ["a"], submittedOnLastDay: ["a"] })).toBe(false);
    expect(shouldAutoComplete({ status: "CANCELLED", assigneeIds: ["a"], submittedOnLastDay: ["a"] })).toBe(false);
  });
});

describe("reports: 作業時間", () => {
  it("分で計算し表示する", () => {
    expect(workMinutes("09:00", "17:30")).toBe(510);
    expect(fmtWorkHours(510)).toBe("8時間30分");
    expect(fmtWorkHours(480)).toBe("8時間");
    expect(workMinutes("17:00", "09:00")).toBe(0);
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
  it("見られるのは本人・入力者・予定を扱う役割", () => {
    expect(canViewReport(staff, mine)).toBe(true);
    expect(canViewReport(other, mine)).toBe(false);
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
