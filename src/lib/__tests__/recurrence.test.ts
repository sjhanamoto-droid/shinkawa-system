import { describe, it, expect } from "vitest";
import {
  slotsForMonth,
  ruleFromDate,
  describeRule,
  nthWeekdayOfMonth,
  daysInMonth,
  addMonths,
  validateRule,
} from "@/lib/recurrence";

describe("recurrence: helpers", () => {
  it("daysInMonth handles leap years", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2026-09")).toBe(30);
  });
  it("addMonths rolls over years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("nthWeekdayOfMonth finds 2nd Tuesday and last Friday", () => {
    // 2026-09: 1日=火曜
    expect(nthWeekdayOfMonth("2026-09", 2, 2)).toBe("2026-09-08");
    expect(nthWeekdayOfMonth("2026-09", 5, -1)).toBe("2026-09-25");
    // 第5月曜が無い月は null
    expect(nthWeekdayOfMonth("2026-09", 1, 5)).toBeNull();
  });
});

describe("recurrence: slotsForMonth", () => {
  it("MONTHLY clamps day to month end", () => {
    const s = slotsForMonth("MONTHLY", { dayOfMonth: 31 }, "2026-09");
    expect(s).toHaveLength(1);
    expect(s[0].date).toBe("2026-09-30");
    expect(s[0].windowStart).toBe("2026-09-01");
    expect(s[0].windowEnd).toBe("2026-09-30");
  });
  it("MONTHLY without day yields undated slot (lane)", () => {
    const s = slotsForMonth("MONTHLY", {}, "2026-09");
    expect(s[0].date).toBeNull();
  });
  it("TWICE_MONTHLY yields first/second half", () => {
    const s = slotsForMonth("TWICE_MONTHLY", { firstDay: 5, secondDay: 20 }, "2026-10");
    expect(s.map((x) => x.date)).toEqual(["2026-10-05", "2026-10-20"]);
    expect(s.map((x) => x.label)).toEqual(["前半", "後半"]);
    expect(s[1].windowStart).toBe("2026-10-16");
  });
  it("WEEKLY yields every Wednesday", () => {
    const s = slotsForMonth("WEEKLY", { weekday: 3 }, "2026-09");
    expect(s.map((x) => x.date)).toEqual(["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"]);
  });
  it("NTH_WEEKDAY yields the 2nd Saturday", () => {
    const s = slotsForMonth("NTH_WEEKDAY", { weekday: 6, nth: 2 }, "2026-09");
    expect(s[0].date).toBe("2026-09-12");
    expect(s[0].label).toBe("第2土曜");
  });
  it("EVERY_N_MONTHS respects interval and anchor", () => {
    const p = { interval: 3, anchorMonth: "2026-01", dayOfMonth: 10 };
    expect(slotsForMonth("EVERY_N_MONTHS", p, "2026-04")).toHaveLength(1);
    expect(slotsForMonth("EVERY_N_MONTHS", p, "2026-05")).toHaveLength(0);
    expect(slotsForMonth("EVERY_N_MONTHS", p, "2027-01")).toHaveLength(1);
    expect(slotsForMonth("EVERY_N_MONTHS", p, "2025-10")).toHaveLength(1);
  });
  it("SEASONAL only in listed months", () => {
    const p = { months: [12, 7] };
    expect(slotsForMonth("SEASONAL", p, "2026-12")[0].label).toBe("12月");
    expect(slotsForMonth("SEASONAL", p, "2026-09")).toHaveLength(0);
  });
});

describe("recurrence: ruleFromDate round trip", () => {
  it("MONTHLY moves dayOfMonth", () => {
    const next = ruleFromDate("MONTHLY", { dayOfMonth: 10 }, "2026-09-14");
    expect(next.dayOfMonth).toBe(14);
    expect(slotsForMonth("MONTHLY", next, "2026-10")[0].date).toBe("2026-10-14");
  });
  it("NTH_WEEKDAY re-derives weekday and nth", () => {
    const next = ruleFromDate("NTH_WEEKDAY", { weekday: 6, nth: 2 }, "2026-09-16"); // 水曜・第3
    expect(next.weekday).toBe(3);
    expect(next.nth).toBe(3);
    expect(slotsForMonth("NTH_WEEKDAY", next, "2026-10")[0].date).toBe("2026-10-21");
  });
  it("TWICE_MONTHLY updates only the moved slot", () => {
    const next = ruleFromDate("TWICE_MONTHLY", { firstDay: 5, secondDay: 20 }, "2026-09-25", 1);
    expect(next.firstDay).toBe(5);
    expect(next.secondDay).toBe(25);
  });
  it("WEEKLY changes weekday", () => {
    const next = ruleFromDate("WEEKLY", { weekday: 3 }, "2026-09-17"); // 木曜
    expect(next.weekday).toBe(4);
  });
});

describe("recurrence: describe/validate", () => {
  it("describes rules in Japanese", () => {
    expect(describeRule("MONTHLY", { dayOfMonth: 15 })).toBe("毎月 15日");
    expect(describeRule("NTH_WEEKDAY", { weekday: 2, nth: 2 })).toBe("第2火曜");
    expect(describeRule("WEEKLY", { weekday: 3 })).toBe("毎週 水曜");
    expect(describeRule(null, null)).toBe("単発");
  });
  it("validates params", () => {
    expect(validateRule("MONTHLY", { dayOfMonth: 40 })).not.toBeNull();
    expect(validateRule("TWICE_MONTHLY", { firstDay: 20 })).not.toBeNull();
    expect(validateRule("EVERY_N_MONTHS", { interval: 3, anchorMonth: "2026-01" })).toBeNull();
    expect(validateRule("SEASONAL", { months: [] })).not.toBeNull();
  });
});
