import "server-only";
import type { Prisma } from "@prisma/client";
import { dateFromKey, storedDateKey } from "@/lib/date";
import { lastWorkDay, shouldAutoComplete } from "@/lib/reports";

/**
 * 担当者全員が最終日の日報を提出済みなら、実施回を完了にする（トランザクションの中で呼ぶ）。
 * 日報を初めて提出したときと、担当者を外したとき（残った全員が提出済みになることがある）に呼ぶ。
 * 同時に提出されても取りこぼさないよう、予定の行をロックしてから数える。完了にしたら true。
 */
export async function completeIfAllSubmitted(tx: Prisma.TransactionClient, occurrenceId: string, actorId: string, reason: string): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "Occurrence" WHERE id = ${occurrenceId} FOR UPDATE`;
  const current = await tx.occurrence.findUnique({
    where: { id: occurrenceId },
    select: { version: true, status: true, date: true, endDate: true, assignments: { select: { userId: true } } },
  });
  if (!current?.date) return false;
  const last = lastWorkDay(storedDateKey(current.date), current.endDate ? storedDateKey(current.endDate) : null);
  const submitted = await tx.dailyReport.findMany({
    where: { occurrenceId, workDate: dateFromKey(last), status: "SUBMITTED" },
    select: { userId: true },
  });
  if (!shouldAutoComplete({ status: current.status, assigneeIds: current.assignments.map((a) => a.userId), submittedOnLastDay: submitted.map((s) => s.userId) })) {
    return false;
  }
  const upd = await tx.occurrence.updateMany({
    where: { id: occurrenceId, version: current.version },
    data: { status: "DONE", version: { increment: 1 } },
  });
  if (upd.count === 0) return false;
  await tx.occurrenceChangeLog.create({
    data: { occurrenceId, actorId, action: "STATUS", field: "status", fromValue: current.status, toValue: "DONE", reason },
  });
  return true;
}
