import { describe, it, expect } from "vitest";
import { minutesToHours, parseMonthKey, summarizeByUser } from "@/lib/attendance";

describe("稼働時間の集計", () => {
  it("人ごとに時間を足し、同じ日の複数の日報は1日と数える", () => {
    const m = summarizeByUser([
      { userId: "a", dateKey: "2026-09-01", startTime: "08:00", endTime: "12:00" },
      { userId: "a", dateKey: "2026-09-01", startTime: "13:00", endTime: "17:30" },
      { userId: "a", dateKey: "2026-09-02", startTime: "09:00", endTime: "17:00" },
      { userId: "b", dateKey: "2026-09-01", startTime: "09:00", endTime: "10:10" },
    ]);
    expect(m.get("a")).toEqual({ minutes: 240 + 270 + 480, days: 2 });
    expect(m.get("b")).toEqual({ minutes: 70, days: 1 });
  });
  it("時刻がおかしい日報は0分", () => {
    expect(summarizeByUser([{ userId: "a", dateKey: "2026-09-01", startTime: "17:00", endTime: "09:00" }]).get("a")).toEqual({ minutes: 0, days: 1 });
  });
  it("月キー", () => {
    expect(parseMonthKey("2026-09", "x")).toBe("2026-09");
    expect(parseMonthKey("2026-13", "x")).toBe("x");
    expect(parseMonthKey(undefined, "x")).toBe("x");
  });
  it("時間表示（小数）", () => {
    expect(minutesToHours(510)).toBe("8.5");
    expect(minutesToHours(70)).toBe("1.17");
  });
});
