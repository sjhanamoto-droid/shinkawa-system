import type { StaffingEntry } from "./types";

// 日ごとの「作業可能◯人・残り◯人」（純関数。テストあり）
// - 作業可能＝数える人（社員・アルバイト）のうち、その日「休み」に入っていない人
// - 残り＝作業可能のうち、その日どの現場にも入っていない人（1日に2現場でも1人と数える）

/** 作業可能の人数に数える雇用区分（協力会社・下請は数えない） */
export const STAFFING_KINDS = ["EMPLOYEE", "PARTTIME"];

/** freeIds＝残り（空いている人）、offIds＝休みの人。並びは staffIds の順 */
export type DayStaff = { available: number; remaining: number; freeIds: string[]; offIds: string[] };

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function dayStaffing(entries: StaffingEntry[], staffIds: string[], dayKeys: string[]): Map<string, DayStaff> {
  const staff = new Set(staffIds);
  const off = new Map<string, Set<string>>();
  const busy = new Map<string, Set<string>>();
  const wanted = new Set(dayKeys);
  for (const e of entries) {
    const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    for (let k = e.date, n = 0; k <= last && n < 366; k = shiftKey(k, 1), n++) {
      if (!wanted.has(k)) continue;
      const target = e.off ? off : busy;
      const set = target.get(k) ?? new Set<string>();
      for (const u of e.userIds) if (staff.has(u)) set.add(u);
      target.set(k, set);
    }
  }
  const out = new Map<string, DayStaff>();
  for (const k of dayKeys) {
    const offSet = off.get(k) ?? new Set<string>();
    const busySet = busy.get(k) ?? new Set<string>();
    const freeIds = staffIds.filter((u) => !offSet.has(u) && !busySet.has(u));
    const offIds = staffIds.filter((u) => offSet.has(u));
    out.set(k, { available: staff.size - offSet.size, remaining: freeIds.length, freeIds, offIds });
  }
  return out;
}
