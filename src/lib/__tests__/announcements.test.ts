import { describe, it, expect } from "vitest";
import { audienceLabel, isInAudience, normalizeAudience } from "@/lib/announcements";
import { can } from "@/lib/permissions";

describe("全体連絡の宛先", () => {
  it("全員が入っていれば全員だけにする", () => {
    expect(normalizeAudience(["STAFF", "ALL"])).toEqual(["ALL"]);
  });
  it("知らない値と重複を外し、決まった順に並べる", () => {
    expect(normalizeAudience(["OFFICE", "STAFF", "HACK", "STAFF"])).toEqual(["STAFF", "OFFICE"]);
    expect(normalizeAudience([])).toEqual([]);
  });
  it("表示名", () => {
    expect(audienceLabel(["ALL"])).toBe("全員");
    expect(audienceLabel(["STAFF", "OFFICE"])).toBe("スタッフ・事務・経理");
  });
  it("役割が宛先に含まれるか", () => {
    expect(isInAudience("STAFF", ["ALL"])).toBe(true);
    expect(isInAudience("STAFF", ["OFFICE"])).toBe(false);
    expect(isInAudience("OFFICE", ["STAFF", "OFFICE"])).toBe(true);
  });
  it("送れるのは最高管理者と事務・経理だけ", () => {
    const u = (role: string) => ({ id: "u", role, department: null });
    expect(can(u("OWNER"), "announcement.send")).toBe(true);
    expect(can(u("OFFICE"), "announcement.send")).toBe(true);
    expect(can(u("SCHEDULER"), "announcement.send")).toBe(false);
    expect(can(u("STAFF"), "announcement.send")).toBe(false);
  });
});
