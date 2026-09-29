// 稼働時間（勤怠）の集計。提出済みの日報の「開始〜終了」を足し上げる（純関数）。
import { workMinutes } from "@/lib/reports";

export type AttendanceEntry = { userId: string; dateKey: string; startTime: string; endTime: string };

/** 人ごとの合計（分）と稼働日数（同じ日に複数の日報があっても1日と数える） */
export function summarizeByUser(entries: AttendanceEntry[]): Map<string, { minutes: number; days: number }> {
  const out = new Map<string, { minutes: number; dayKeys: Set<string> }>();
  for (const e of entries) {
    const row = out.get(e.userId) ?? { minutes: 0, dayKeys: new Set<string>() };
    row.minutes += workMinutes(e.startTime, e.endTime);
    row.dayKeys.add(e.dateKey);
    out.set(e.userId, row);
  }
  return new Map([...out].map(([id, r]) => [id, { minutes: r.minutes, days: r.dayKeys.size }]));
}

/** 'YYYY-MM' として正しければそのまま、そうでなければ fallback */
export function parseMonthKey(s: string | undefined, fallback: string): string {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) return s;
  }
  return fallback;
}

/** 分 → 「8.5」のような時間（小数1桁）。CSV・給与計算向け */
export function minutesToHours(minutes: number): string {
  return (Math.round((minutes / 60) * 100) / 100).toString();
}
