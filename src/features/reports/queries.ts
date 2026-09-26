import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDaysKey, dateFromKey, dayRangeForKey, jstDateKey, storedDateKey } from "@/lib/date";
import { NON_WORK_CATEGORIES } from "@/lib/constants";
import type { Actor } from "@/lib/permissions";
import { avatarUrlFor } from "@/lib/session";
import {
  MISSING_LOOKBACK_DAYS,
  canSeeReportExpenses,
  canViewReport,
  EXPENSE_CATEGORY_LABEL,
  fmtExpenseDate,
  isExpenseCategory,
  isReportStatus,
  occurrenceWorkDays,
  type ReportStatus,
} from "@/lib/reports";
import { occurrenceTitle } from "@/features/schedule/query";

// ─────────────────────────── 書くべき日報（担当 × 作業日） ───────────────────────────

export type ReportDue = {
  occurrenceId: string;
  workDate: string; // 'YYYY-MM-DD'
  title: string;
  propertyName: string | null;
  category: string;
  department: string;
  startTime: string | null;
  endTime: string | null;
  userId: string;
  userName: string;
  canLogin: boolean;
  report: { id: string; status: ReportStatus } | null;
};

const dueOccurrenceSelect = {
  id: true,
  title: true,
  category: true,
  department: true,
  status: true,
  date: true,
  endDate: true,
  startTime: true,
  endTime: true,
  customerNameRaw: true,
  customer: { select: { name: true, shortName: true } },
  property: { select: { name: true } },
  assignments: { select: { userId: true, user: { select: { name: true, canLogin: true, active: true } } } },
} satisfies Prisma.OccurrenceSelect;

/**
 * [fromKey, toKey] の作業日で、条件に合う担当者が書くべき日報を並べる。
 * users: "self" = その人だけ / "nonLogin" = ログインしない作業者（事務が代理入力する分）
 */
export async function loadDueReports(opts: {
  fromKey: string;
  toKey: string;
  userId?: string;
  nonLoginOnly?: boolean;
}): Promise<ReportDue[]> {
  const { fromKey, toKey } = opts;
  const assigneeFilter: Prisma.AssignmentWhereInput = opts.userId
    ? { userId: opts.userId }
    : opts.nonLoginOnly
      ? { user: { canLogin: false, active: true } }
      : {};
  const rows = await db.occurrence.findMany({
    where: {
      status: { not: "CANCELLED" },
      category: { notIn: NON_WORK_CATEGORIES as string[] },
      date: { not: null, lt: dayRangeForKey(toKey).lt },
      OR: [{ date: { gte: dateFromKey(fromKey) } }, { endDate: { gte: dateFromKey(fromKey) } }],
      assignments: { some: assigneeFilter },
    },
    select: dueOccurrenceSelect,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const items: ReportDue[] = [];
  for (const o of rows) {
    const dateKey = storedDateKey(o.date!);
    const endKey = o.endDate ? storedDateKey(o.endDate) : null;
    const days = occurrenceWorkDays(dateKey, endKey).filter((d) => d >= fromKey && d <= toKey);
    for (const a of o.assignments) {
      if (opts.userId && a.userId !== opts.userId) continue;
      if (opts.nonLoginOnly && (a.user.canLogin || !a.user.active)) continue;
      for (const d of days) {
        items.push({
          occurrenceId: o.id,
          workDate: d,
          title: occurrenceTitle(o),
          propertyName: o.property?.name ?? null,
          category: o.category,
          department: o.department,
          startTime: o.startTime,
          endTime: o.endTime,
          userId: a.userId,
          userName: a.user.name,
          canLogin: a.user.canLogin,
          report: null,
        });
      }
    }
  }
  if (items.length === 0) return items;

  const reports = await db.dailyReport.findMany({
    where: {
      occurrenceId: { in: Array.from(new Set(items.map((i) => i.occurrenceId))) },
      userId: { in: Array.from(new Set(items.map((i) => i.userId))) },
      workDate: { gte: dateFromKey(fromKey), lt: dayRangeForKey(toKey).lt },
    },
    select: { id: true, occurrenceId: true, userId: true, workDate: true, status: true },
  });
  const byKey = new Map(reports.map((r) => [`${r.occurrenceId}|${r.userId}|${storedDateKey(r.workDate)}`, r]));
  for (const i of items) {
    const r = byKey.get(`${i.occurrenceId}|${i.userId}|${i.workDate}`);
    if (r && isReportStatus(r.status)) i.report = { id: r.id, status: r.status };
  }
  return items;
}

/** 本人の「今日の日報」と「過去の未提出」（今日を含まない過去14日） */
export async function loadMyReportTodo(userId: string) {
  const today = jstDateKey();
  const from = addDaysKey(today, -MISSING_LOOKBACK_DAYS);
  const all = await loadDueReports({ fromKey: from, toKey: today, userId });
  return {
    today: all.filter((i) => i.workDate === today),
    missing: all.filter((i) => i.workDate < today && i.report?.status !== "SUBMITTED").reverse(),
  };
}

/** 事務の代理入力待ち（ログインしない作業者の、今日まで14日分の未提出） */
export async function loadProxyTodo() {
  const today = jstDateKey();
  const from = addDaysKey(today, -MISSING_LOOKBACK_DAYS);
  const all = await loadDueReports({ fromKey: from, toKey: today, nonLoginOnly: true });
  return all.filter((i) => i.report?.status !== "SUBMITTED").reverse();
}

// ─────────────────────────── 予定の詳細画面（カレンダー）用 ───────────────────────────

export type OccurrenceReportState = {
  workDays: string[]; // 今日までの作業日
  rows: {
    userId: string;
    userName: string;
    canLogin: boolean;
    days: { workDate: string; report: { id: string; status: ReportStatus } | null }[];
  }[];
};

export async function loadOccurrenceReportState(occurrenceId: string): Promise<OccurrenceReportState | null> {
  const o = await db.occurrence.findUnique({ where: { id: occurrenceId }, select: dueOccurrenceSelect });
  if (!o || !o.date) return null;
  const today = jstDateKey();
  const workDays = occurrenceWorkDays(storedDateKey(o.date), o.endDate ? storedDateKey(o.endDate) : null).filter((d) => d <= today);
  const reports = await db.dailyReport.findMany({
    where: { occurrenceId },
    select: { id: true, userId: true, workDate: true, status: true },
  });
  const byKey = new Map(reports.map((r) => [`${r.userId}|${storedDateKey(r.workDate)}`, r]));
  return {
    workDays,
    rows: o.assignments.map((a) => ({
      userId: a.userId,
      userName: a.user.name,
      canLogin: a.user.canLogin,
      days: workDays.map((d) => {
        const r = byKey.get(`${a.userId}|${d}`);
        return { workDate: d, report: r && isReportStatus(r.status) ? { id: r.id, status: r.status } : null };
      }),
    })),
  };
}

// ─────────────────────────── 新規作成フォーム用 ───────────────────────────

/** 日報フォームの対象（予定と担当者）。担当でなければ null */
export async function loadReportTarget(occurrenceId: string, userId: string) {
  const o = await db.occurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      ...dueOccurrenceSelect,
      note: true,
      propertyId: true,
      property: { select: { id: true, name: true, address: true } },
      vehicles: { select: { vehicle: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!o || !o.date) return null;
  const a = o.assignments.find((x) => x.userId === userId);
  if (!a) return null;
  return {
    occurrence: {
      id: o.id,
      title: occurrenceTitle(o),
      category: o.category,
      department: o.department,
      status: o.status,
      dateKey: storedDateKey(o.date),
      endDateKey: o.endDate ? storedDateKey(o.endDate) : null,
      startTime: o.startTime,
      endTime: o.endTime,
      note: o.note,
      propertyId: o.propertyId,
      property: o.property,
      vehicles: o.vehicles.map((v) => v.vehicle),
    },
    worker: { id: a.userId, name: a.user.name, canLogin: a.user.canLogin },
  };
}

// ─────────────────────────── 詳細・編集用 ───────────────────────────

export type ReportDetail = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

/** 1件読み込む。見る権限が無ければ null。経費は見られる人にだけ含める */
export async function loadReport(id: string, actor: Actor) {
  const r = await db.dailyReport.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      createdById: true,
      occurrenceId: true,
      propertyId: true,
      workDate: true,
      startTime: true,
      endTime: true,
      detail: true,
      parkingFee: true,
      trainFare: true,
      handover: true,
      handoverNone: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true, canLogin: true } },
      createdBy: { select: { id: true, name: true } },
      property: { select: { id: true, name: true, address: true, customer: { select: { name: true } } } },
      occurrence: {
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          date: true,
          endDate: true,
          customerNameRaw: true,
          customer: { select: { name: true, shortName: true } },
          property: { select: { name: true } },
          vehicles: { select: { vehicle: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
      expenses: { select: { id: true, category: true, label: true, amount: true, paidOn: true, ocr: true, receiptPhotoId: true }, orderBy: { sortOrder: "asc" } },
      photos: { where: { kind: { not: "RECEIPT" } }, select: { id: true, caption: true, kind: true, isVideo: true, duration: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
      comments: {
        select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!r) return null;
  const owner = { userId: r.userId, createdById: r.createdById };
  if (!canViewReport(actor, owner)) return null;
  const showExpenses = canSeeReportExpenses(actor, owner);
  return {
    ...r,
    workDateKey: storedDateKey(r.workDate),
    status: isReportStatus(r.status) ? r.status : ("DRAFT" as ReportStatus),
    user: { id: r.user.id, name: r.user.name, avatarColor: r.user.avatarColor, avatarUrl: avatarUrlFor(r.user), canLogin: r.user.canLogin },
    occurrenceTitle: r.occurrence ? occurrenceTitle(r.occurrence) : (r.property?.name ?? "予定"),
    comments: r.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: { id: c.user.id, name: c.user.name, avatarColor: c.user.avatarColor, avatarUrl: avatarUrlFor(c.user) },
    })),
    showExpenses,
    parkingFee: showExpenses ? r.parkingFee : null,
    trainFare: showExpenses ? r.trainFare : null,
    expenses: showExpenses ? r.expenses : [],
    expenseLines: showExpenses ? expenseLinesOf(r) : [],
    expenseTotal: showExpenses ? expenseLinesOf(r).reduce((s, e) => s + e.amount, 0) : 0,
  };
}

export type ExpenseLine = { key: string; categoryLabel: string; label: string; amount: number; paidOn: string; receiptPhotoId: string | null; ocr: boolean };

/** 表示用の経費。以前の形式（駐車場代・電車賃の欄）も1行として並べる */
function expenseLinesOf(r: {
  parkingFee: number | null;
  trainFare: number | null;
  expenses: { id: string; category: string; label: string; amount: number; paidOn: string | null; receiptPhotoId: string | null; ocr: boolean }[];
}): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  if (r.parkingFee && r.parkingFee > 0) lines.push({ key: "legacy-parking", categoryLabel: EXPENSE_CATEGORY_LABEL.PARKING, label: "", amount: r.parkingFee, paidOn: "", receiptPhotoId: null, ocr: false });
  if (r.trainFare && r.trainFare > 0) lines.push({ key: "legacy-train", categoryLabel: EXPENSE_CATEGORY_LABEL.TRAVEL, label: "", amount: r.trainFare, paidOn: "", receiptPhotoId: null, ocr: false });
  for (const e of r.expenses) {
    lines.push({
      key: e.id,
      categoryLabel: isExpenseCategory(e.category) ? EXPENSE_CATEGORY_LABEL[e.category] : "科目未選択",
      label: e.label,
      amount: e.amount,
      paidOn: fmtExpenseDate(e.paidOn),
      receiptPhotoId: e.receiptPhotoId,
      ocr: e.ocr,
    });
  }
  return lines;
}

// ─────────────────────────── 一覧用 ───────────────────────────

const listSelect = {
  id: true,
  userId: true,
  createdById: true,
  workDate: true,
  startTime: true,
  endTime: true,
  detail: true,
  status: true,
  user: { select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true } },
  createdBy: { select: { id: true, name: true } },
  property: { select: { id: true, name: true } },
  occurrence: {
    select: { id: true, title: true, category: true, customerNameRaw: true, customer: { select: { name: true, shortName: true } }, property: { select: { name: true } } },
  },
  _count: { select: { photos: { where: { kind: { not: "RECEIPT" } } }, comments: true } },
} satisfies Prisma.DailyReportSelect;

type ListRow = Prisma.DailyReportGetPayload<{ select: typeof listSelect }>;

export type ReportListItem = ReturnType<typeof toListItem>;

function toListItem(r: ListRow) {
  return {
    id: r.id,
    userId: r.userId,
    workDateKey: storedDateKey(r.workDate),
    startTime: r.startTime,
    endTime: r.endTime,
    detail: r.detail,
    status: isReportStatus(r.status) ? r.status : ("DRAFT" as ReportStatus),
    user: { id: r.user.id, name: r.user.name, avatarColor: r.user.avatarColor, avatarUrl: avatarUrlFor(r.user) },
    proxyBy: r.createdBy && r.createdBy.id !== r.userId ? r.createdBy.name : null,
    title: r.occurrence ? occurrenceTitle(r.occurrence) : (r.property?.name ?? "予定"),
    propertyName: r.property?.name ?? null,
    category: r.occurrence?.category ?? null,
    photoCount: r._count.photos,
    commentCount: r._count.comments,
  };
}

/** 本人（または本人の分を代理入力した）の最近の日報 */
export async function loadMyRecentReports(userId: string, take = 10) {
  const rows = await db.dailyReport.findMany({
    where: { userId },
    select: listSelect,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map(toListItem);
}

/** 全員分の一覧（予定を扱う役割向け）。絞り込み: 日付範囲・担当者・キーワード・状態 */
export async function loadReportList(opts: {
  from?: string;
  to?: string;
  userId?: string;
  propertyId?: string;
  q?: string;
  status?: ReportStatus;
  take: number;
}) {
  const where: Prisma.DailyReportWhereInput = {
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.from || opts.to
      ? {
          workDate: {
            ...(opts.from ? { gte: dateFromKey(opts.from) } : {}),
            ...(opts.to ? { lt: dayRangeForKey(opts.to).lt } : {}),
          },
        }
      : {}),
    ...(opts.q
      ? {
          OR: [
            { detail: { contains: opts.q } },
            { user: { name: { contains: opts.q } } },
            { property: { name: { contains: opts.q } } },
            { occurrence: { title: { contains: opts.q } } },
            { occurrence: { customer: { OR: [{ name: { contains: opts.q } }, { shortName: { contains: opts.q } }] } } },
          ],
        }
      : {}),
  };
  const rows = await db.dailyReport.findMany({
    where,
    select: listSelect,
    orderBy: [{ workDate: "desc" }, { createdAt: "asc" }],
    take: opts.take + 1,
  });
  return { items: rows.slice(0, opts.take).map(toListItem), hasMore: rows.length > opts.take };
}

/** 現場の最近の日報 */
export async function loadPropertyReports(propertyId: string, take = 5) {
  const [rows, total] = await Promise.all([
    db.dailyReport.findMany({
      where: { propertyId },
      select: listSelect,
      orderBy: [{ workDate: "desc" }, { createdAt: "asc" }],
      take,
    }),
    db.dailyReport.count({ where: { propertyId } }),
  ]);
  return { items: rows.map(toListItem), total };
}
