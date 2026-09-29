import "server-only";
import { db } from "@/lib/db";
import { avatarUrlFor } from "@/lib/session";
import { monthRangeForKey, storedDateKey } from "@/lib/date";
import { summarizeByUser } from "@/lib/attendance";
import { workMinutes } from "@/lib/reports";
import { occurrenceTitle } from "@/features/schedule/query";

// 稼働時間は「提出済みの日報」の開始〜終了で数える（下書きは入れない）。

export async function monthlyAttendance(ym: string) {
  const reports = await db.dailyReport.findMany({
    where: { workDate: monthRangeForKey(ym), status: "SUBMITTED" },
    select: {
      userId: true,
      workDate: true,
      startTime: true,
      endTime: true,
      user: { select: { id: true, name: true, kind: true, avatarColor: true, avatarImage: true, updatedAt: true, sortOrder: true } },
    },
  });
  const sums = summarizeByUser(reports.map((r) => ({ userId: r.userId, dateKey: storedDateKey(r.workDate), startTime: r.startTime, endTime: r.endTime })));
  const users = new Map(reports.map((r) => [r.userId, r.user]));
  const rows = [...sums].map(([userId, s]) => {
    const u = users.get(userId)!;
    return { userId, name: u.name, kind: u.kind, avatarColor: u.avatarColor, avatarUrl: avatarUrlFor(u), sortOrder: u.sortOrder, ...s };
  });
  rows.sort((a, b) => b.minutes - a.minutes || a.sortOrder - b.sortOrder);
  return {
    rows,
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    totalDays: rows.reduce((s, r) => s + r.days, 0),
  };
}

export async function userMonthAttendance(userId: string, ym: string) {
  const [user, reports] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, kind: true, avatarColor: true, avatarImage: true, updatedAt: true } }),
    db.dailyReport.findMany({
      where: { userId, workDate: monthRangeForKey(ym), status: "SUBMITTED" },
      select: {
        id: true,
        workDate: true,
        startTime: true,
        endTime: true,
        property: { select: { name: true } },
        occurrence: { select: { title: true, category: true, customerNameRaw: true, customer: { select: { name: true, shortName: true } }, property: { select: { name: true } } } },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    }),
  ]);
  if (!user) return null;
  const days = new Map<string, { minutes: number; rows: { id: string; title: string; category: string | null; start: string; end: string; minutes: number }[] }>();
  for (const r of reports) {
    const key = storedDateKey(r.workDate);
    const minutes = workMinutes(r.startTime, r.endTime);
    const d = days.get(key) ?? { minutes: 0, rows: [] };
    d.minutes += minutes;
    d.rows.push({
      id: r.id,
      title: r.occurrence ? occurrenceTitle(r.occurrence) : (r.property?.name ?? "予定"),
      category: r.occurrence?.category ?? null,
      start: r.startTime,
      end: r.endTime,
      minutes,
    });
    days.set(key, d);
  }
  const list = [...days].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    user: { id: user.id, name: user.name, kind: user.kind, avatarColor: user.avatarColor, avatarUrl: avatarUrlFor(user) },
    days: list,
    totalMinutes: list.reduce((s, [, d]) => s + d.minutes, 0),
  };
}
