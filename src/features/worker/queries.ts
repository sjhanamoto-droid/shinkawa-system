import "server-only";
import { db } from "@/lib/db";
import { addDaysKey, dateFromKey, dayRangeForKey, jstDateKey, monthRangeForKey, storedDateKey } from "@/lib/date";
import { NON_WORK_CATEGORIES } from "@/lib/constants";
import { catLabel } from "@/lib/categories";
import { getCategories } from "@/lib/categories-server";
import { occurrenceWorkDays, workMinutes, isExpenseCategory, EXPENSE_CATEGORY_LABEL } from "@/lib/reports";
import { visitState, type VisitState } from "@/lib/worker";
import { occurrenceTitle } from "@/features/schedule/query";

// スタッフ画面のデータ。本人の予定・日報だけを扱う。

export type WorkerVisit = {
  occurrenceId: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  siteName: string;
  customerName: string | null;
  workLabel: string;
  category: string;
  propertyId: string | null;
  address: string | null;
  state: VisitState;
  reportId: string | null;
  reportStatus: "DRAFT" | "SUBMITTED" | null;
};

/** 日本時間の今（0時からの分） */
export function jstNowMinutes(d = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).split(":").map(Number);
  return h * 60 + m;
}

/** 本人が担当の予定を、[fromKey, toKey] の作業日ごとに並べる（休みなど日報の要らないものは除く） */
export async function loadMyVisits(userId: string, fromKey: string, toKey: string): Promise<WorkerVisit[]> {
  const [rows, reports, categories] = await Promise.all([
    db.occurrence.findMany({
      where: {
        assignments: { some: { userId } },
        status: { not: "CANCELLED" },
        category: { notIn: NON_WORK_CATEGORIES as string[] },
        date: { not: null, lt: dayRangeForKey(toKey).lt },
        OR: [{ date: { gte: dateFromKey(fromKey) } }, { endDate: { gte: dateFromKey(fromKey) } }],
      },
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        endDate: true,
        startTime: true,
        endTime: true,
        customerNameRaw: true,
        customer: { select: { name: true } },
        property: { select: { id: true, name: true, address: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    }),
    db.dailyReport.findMany({
      where: { userId, workDate: { gte: dateFromKey(fromKey), lt: dayRangeForKey(toKey).lt }, occurrenceId: { not: null } },
      select: { id: true, occurrenceId: true, workDate: true, status: true },
    }),
    getCategories(),
  ]);
  const byKey = new Map(reports.map((r) => [`${r.occurrenceId}|${storedDateKey(r.workDate)}`, r]));
  const today = jstDateKey();
  const now = jstNowMinutes();
  const out: WorkerVisit[] = [];
  for (const o of rows) {
    const days = occurrenceWorkDays(storedDateKey(o.date!), o.endDate ? storedDateKey(o.endDate) : null).filter((d) => d >= fromKey && d <= toKey);
    for (const d of days) {
      const r = byKey.get(`${o.id}|${d}`);
      const status = r?.status === "SUBMITTED" ? "SUBMITTED" : r ? "DRAFT" : null;
      out.push({
        occurrenceId: o.id,
        dateKey: d,
        startTime: o.startTime,
        endTime: o.endTime,
        siteName: o.property?.name ?? occurrenceTitle(o),
        customerName: o.customer?.name ?? o.customerNameRaw ?? null,
        workLabel: catLabel(categories, o.category),
        category: o.category,
        propertyId: o.property?.id ?? null,
        address: o.property?.address ?? null,
        state: visitState({ dateKey: d, startTime: o.startTime, endTime: o.endTime, submitted: status === "SUBMITTED" }, today, now),
        reportId: r?.id ?? null,
        reportStatus: status,
      });
    }
  }
  out.sort((a, b) => (a.dateKey === b.dateKey ? (a.startTime ?? "99").localeCompare(b.startTime ?? "99") : a.dateKey < b.dateKey ? -1 : 1));
  return out;
}

/** 現場の情報（予定1件）。本人が担当でなければ null（管理者は見られる） */
export async function loadVisitInfo(occurrenceId: string, userId: string, allowAny: boolean, dateKey?: string) {
  const o = await db.occurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      id: true,
      title: true,
      category: true,
      date: true,
      endDate: true,
      startTime: true,
      endTime: true,
      note: true,
      customerNameRaw: true,
      customer: { select: { name: true } },
      assignments: { select: { userId: true } },
      property: {
        select: {
          id: true,
          name: true,
          address: true,
          building: true,
          keyboxStatus: true,
          keyboxNumber: true,
          keyboxPlace: true,
          keyboxNoneReason: true,
          accessNote: true,
          contactName: true,
          contactPhone: true,
          _count: { select: { photos: true, memos: true, handovers: { where: { resolvedAt: null } } } },
        },
      },
    },
  });
  if (!o || !o.date) return null;
  if (!allowAny && !o.assignments.some((a) => a.userId === userId)) return null;
  const categories = await getCategories();
  // 複数日の工事は、その日（作業日のうちの1日）の日報を見る
  const days = occurrenceWorkDays(storedDateKey(o.date), o.endDate ? storedDateKey(o.endDate) : null);
  const day = dateKey && days.includes(dateKey) ? dateKey : days[0];
  const report = await db.dailyReport.findFirst({ where: { occurrenceId, userId, workDate: dateFromKey(day) }, select: { id: true, status: true } });
  return {
    occurrenceId: o.id,
    dateKey: day,
    startTime: o.startTime,
    endTime: o.endTime,
    note: o.note,
    siteName: o.property?.name ?? occurrenceTitle(o),
    customerName: o.customer?.name ?? o.customerNameRaw ?? null,
    workLabel: catLabel(categories, o.category),
    property: o.property,
    assigned: o.assignments.some((a) => a.userId === userId),
    report,
  };
}

// ─────────────────────────── 精算書（本人の分） ───────────────────────────

export type StatementDay = {
  reportId: string;
  dateKey: string;
  place: string;
  startTime: string;
  endTime: string;
  minutes: number;
  amount: number;
  receipts: number;
};

/** 本人の、その月の提出済み日報から勤務表・経費精算書を作る */
export async function loadStatement(userId: string, ym: string) {
  const reports = await db.dailyReport.findMany({
    where: { userId, status: "SUBMITTED", workDate: monthRangeForKey(ym) },
    select: {
      id: true,
      workDate: true,
      startTime: true,
      endTime: true,
      parkingFee: true,
      trainFare: true,
      property: { select: { name: true } },
      occurrence: { select: { title: true, customerNameRaw: true, customer: { select: { name: true } }, property: { select: { name: true } } } },
      expenses: { select: { amount: true, receiptPhotoId: true } },
    },
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
  });
  const days: StatementDay[] = reports.map((r) => ({
    reportId: r.id,
    dateKey: storedDateKey(r.workDate),
    place: r.property?.name ?? (r.occurrence ? occurrenceTitle(r.occurrence) : "現場"),
    startTime: r.startTime,
    endTime: r.endTime,
    minutes: workMinutes(r.startTime, r.endTime),
    amount: r.expenses.reduce((s, e) => s + e.amount, 0) + (r.parkingFee ?? 0) + (r.trainFare ?? 0),
    receipts: r.expenses.filter((e) => e.receiptPhotoId).length,
  }));
  return {
    days,
    total: days.reduce((s, d) => s + d.amount, 0),
    workDays: new Set(days.map((d) => d.dateKey)).size,
    minutes: days.reduce((s, d) => s + d.minutes, 0),
    receipts: days.reduce((s, d) => s + d.receipts, 0),
  };
}

/** 今月の立替合計（日報タブ・完了画面） */
export async function loadMonthExpenseTotal(userId: string, ym: string): Promise<number> {
  return (await loadStatement(userId, ym)).total;
}

// ─────────────────────────── 日報の形（ウィザード・日別の詳細） ───────────────────────────

export function expenseKindOf(category: string): "toll" | "train" | "receipt" {
  if (category === "HIGHWAY") return "toll";
  if (category === "TRAVEL") return "train";
  return "receipt";
}

export function expenseLabelOf(category: string): string {
  return isExpenseCategory(category) ? EXPENSE_CATEGORY_LABEL[category] : "経費";
}

export { addDaysKey };
