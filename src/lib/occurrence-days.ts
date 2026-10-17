import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { dateFromKey } from "@/lib/date";
import { occurrenceWorkDays } from "@/lib/reports";

// 連続工事（開始日〜終了日）を「1日ずつの予定」に分けて作る。同じ工事の日どうしは groupId でつなぐ。
// 日ごとに担当・車両・削除・日報（＝完了）を扱えるようにするため、endDate は使わない。

/** 1回に分けて作れる日数の上限 */
export const MAX_GROUP_DAYS = 120;

/** 開始日〜終了日の各日（終了日が無い・開始日以前なら開始日だけ） */
export function daysOf(dateKey: string, endDateKey: string | null | undefined): string[] {
  const days = occurrenceWorkDays(dateKey, endDateKey);
  if (days.length > MAX_GROUP_DAYS) throw new Error(`一度に入れられるのは${MAX_GROUP_DAYS}日までです`);
  return days;
}

type Tx = Prisma.TransactionClient;

/**
 * 日ごとに予定を作る（担当・車両・変更履歴も各日に）。作った予定の id を日付順で返す。
 * base は date / endDate / targetMonth / groupId 以外の共通の値。
 */
export async function createOccurrenceDays(
  tx: Tx,
  base: Omit<Prisma.OccurrenceCreateManyInput, "id" | "date" | "endDate" | "targetMonth" | "groupId">,
  days: string[],
  opts: { workerIds?: string[]; vehicleIds?: string[]; actorId: string; reason?: string },
): Promise<string[]> {
  const groupId = days.length > 1 ? randomUUID() : null;
  const rows = days.map((d) => ({
    ...base,
    id: randomUUID(),
    date: dateFromKey(d),
    endDate: null,
    targetMonth: d.slice(0, 7),
    groupId,
  }));
  await tx.occurrence.createMany({ data: rows });
  const ids = rows.map((r) => r.id);
  const workerIds = opts.workerIds ?? [];
  const vehicleIds = opts.vehicleIds ?? [];
  if (workerIds.length) {
    await tx.assignment.createMany({ data: ids.flatMap((occurrenceId) => workerIds.map((userId) => ({ occurrenceId, userId, createdById: opts.actorId }))), skipDuplicates: true });
  }
  if (vehicleIds.length) {
    await tx.occurrenceVehicle.createMany({ data: ids.flatMap((occurrenceId) => vehicleIds.map((vehicleId) => ({ occurrenceId, vehicleId, createdById: opts.actorId }))), skipDuplicates: true });
  }
  const note = days.length > 1 ? `${days[0]}〜${days[days.length - 1]}（${days.length}日）の連続工事` : undefined;
  await tx.occurrenceChangeLog.createMany({
    data: rows.flatMap((r, i) => [
      { occurrenceId: r.id, actorId: opts.actorId, action: "CREATE", toValue: days[i], reason: opts.reason ?? note ?? null },
      ...workerIds.map((userId) => ({ occurrenceId: r.id, actorId: opts.actorId, action: "ASSIGN", field: "assignee", toValue: userId })),
    ]),
  });
  return ids;
}
