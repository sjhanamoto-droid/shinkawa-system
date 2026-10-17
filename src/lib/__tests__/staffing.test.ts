import { describe, it, expect } from "vitest";
import { dayStaffing } from "@/features/schedule/staffing";

describe("カレンダー：作業可能・残り人数", () => {
  const staff = ["a", "b", "c", "d"];
  it("休みは作業可能から引き、現場に入っている人は残りから引く（2現場でも1人）", () => {
    const m = dayStaffing(
      [
        { id: "1", date: "2026-10-16", endDate: null, off: true, userIds: ["a"] },
        { id: "2", date: "2026-10-16", endDate: null, off: false, userIds: ["b", "c"] },
        { id: "3", date: "2026-10-16", endDate: null, off: false, userIds: ["b"] },
      ],
      staff,
      ["2026-10-16", "2026-10-17"],
    );
    expect(m.get("2026-10-16")).toEqual({ available: 3, remaining: 1, freeIds: ["d"], offIds: ["a"] });
    expect(m.get("2026-10-17")).toEqual({ available: 4, remaining: 4, freeIds: staff, offIds: [] });
  });
  it("数えない人（協力会社など）は無視し、複数日の予定は期間中の毎日に数える", () => {
    const m = dayStaffing([{ id: "1", date: "2026-10-16", endDate: "2026-10-18", off: false, userIds: ["a", "x"] }], staff, ["2026-10-17"]);
    expect(m.get("2026-10-17")).toEqual({ available: 4, remaining: 3, freeIds: ["b", "c", "d"], offIds: [] });
  });
});
