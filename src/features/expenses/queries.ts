import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { monthRangeForKey, storedDateKey } from "@/lib/date";
import { toExpenseItems, type ExpenseItem } from "@/lib/expenses";
import { assertCan, type Actor } from "@/lib/permissions";

/** その現場の日報（propertyId が空の古い日報は、予定経由で現場を判定） */
function propertyReportWhere(propertyId: string, ym?: string | null): Prisma.DailyReportWhereInput {
  return {
    status: "SUBMITTED",
    OR: [{ propertyId }, { propertyId: null, occurrence: { propertyId } }],
    ...(ym ? { workDate: monthRangeForKey(ym) } : {}),
  };
}

/** 現場の経費行（提出済みの日報のみ・作業日順）。最高管理者・事務のみ */
export async function loadPropertyExpenseItems(actor: Actor, propertyId: string, ym?: string | null): Promise<ExpenseItem[]> {
  assertCan(actor, "expense.view");
  const reports = await db.dailyReport.findMany({
    where: propertyReportWhere(propertyId, ym),
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      workDate: true,
      parkingFee: true,
      trainFare: true,
      user: { select: { name: true } },
      expenses: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, category: true, label: true, amount: true, paidOn: true, receiptPhotoId: true },
      },
    },
  });
  return toExpenseItems(
    reports.map((r) => ({
      id: r.id,
      workDateKey: storedDateKey(r.workDate),
      userName: r.user.name,
      parkingFee: r.parkingFee,
      trainFare: r.trainFare,
      expenses: r.expenses,
    })),
  );
}

export type WorkLogRow = { id: string; workDateKey: string; userName: string; startTime: string; endTime: string; detail: string };

/** 報告書の「作業実績」：期間内の提出済み日報 */
export async function loadPropertyWorkLog(actor: Actor, propertyId: string, ym?: string | null): Promise<WorkLogRow[]> {
  assertCan(actor, "expense.view");
  const rows = await db.dailyReport.findMany({
    where: propertyReportWhere(propertyId, ym),
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
    select: { id: true, workDate: true, startTime: true, endTime: true, detail: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    workDateKey: storedDateKey(r.workDate),
    userName: r.user.name,
    startTime: r.startTime,
    endTime: r.endTime,
    detail: r.detail ?? "",
  }));
}
