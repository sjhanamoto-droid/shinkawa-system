import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { storedDateKey, dateFromKey, jstDateKey } from "@/lib/date";
import { canViewAmounts, type Actor } from "@/lib/permissions";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { isRuleKind } from "@/lib/constants";
import { getAppSettings } from "@/lib/settings";
import { avatarUrlFor } from "@/lib/session";
import { rangeFor, monthsInRange } from "./filters";
import type {
  FilterState,
  OccurrenceView,
  PersonRef,
  ScheduleData,
  WorkerOption,
  CustomerOption,
  PropertyOption,
  ChangeLogView,
} from "./types";

// ── 実施回の select（金額は権限があるときだけ含める） ──
export function occurrenceSelect(showAmount: boolean) {
  return {
    id: true,
    version: true,
    jobId: true,
    job: { select: { ruleKind: true, ruleParams: true } },
    title: true,
    department: true,
    category: true,
    status: true,
    source: true,
    targetMonth: true,
    date: true,
    endDate: true,
    windowStart: true,
    windowEnd: true,
    startTime: true,
    endTime: true,
    headcount: true,
    unitCount: true,
    vehicle: true,
    note: true,
    customerNameRaw: true,
    amount: showAmount,
    customer: { select: { id: true, name: true, shortName: true } },
    property: {
      select: { id: true, name: true, address: true, keyboxNumber: true, keyboxPlace: true, accessNote: true },
    },
    assignments: { select: { userId: true }, orderBy: { createdAt: "asc" as const } },
    createdBy: { select: { id: true, name: true, avatarColor: true } },
  } satisfies Prisma.OccurrenceSelect;
}

export type OccurrenceRow = Prisma.OccurrenceGetPayload<{ select: ReturnType<typeof occurrenceSelect> }>;

/** 作業者の PersonRef 辞書（アバター画像の有無だけを取り、base64 はクライアントへ渡さない） */
export async function loadPersonMap(): Promise<Map<string, PersonRef>> {
  const users = await db.user.findMany({
    select: { id: true, name: true, avatarColor: true, updatedAt: true },
  });
  const withAvatar = await db.user.findMany({ where: { avatarImage: { not: null } }, select: { id: true } });
  const hasAvatar = new Set(withAvatar.map((u) => u.id));
  const map = new Map<string, PersonRef>();
  for (const u of users) {
    map.set(u.id, {
      id: u.id,
      name: u.name,
      avatarColor: u.avatarColor,
      avatarUrl: hasAvatar.has(u.id) ? avatarUrlFor({ id: u.id, updatedAt: u.updatedAt, avatarImage: "x" }) : null,
    });
  }
  return map;
}

function windowLabelOf(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const s = storedDateKey(start);
  const e = storedDateKey(end);
  if (s === e) return null;
  const sd = Number(s.slice(8, 10));
  const ed = Number(e.slice(8, 10));
  if (sd === 1 && ed === 15) return "前半";
  if (sd === 16) return "後半";
  if (sd === 1) return "月内";
  return `${sd}日〜${ed}日`;
}

export function toOccurrenceView(row: OccurrenceRow, people: Map<string, PersonRef>, showAmount: boolean): OccurrenceView {
  const ruleKind = row.job?.ruleKind ?? null;
  const ruleSummary = isRuleKind(ruleKind) ? describeRule(ruleKind, (row.job?.ruleParams ?? {}) as RuleParams) : null;
  const title = row.title ?? row.customer?.shortName ?? row.customer?.name ?? row.property?.name ?? row.customerNameRaw ?? "予定";
  const view: OccurrenceView = {
    id: row.id,
    version: row.version,
    jobId: row.jobId,
    ruleKind,
    ruleSummary,
    title,
    department: row.department,
    category: row.category,
    status: row.status,
    source: row.source,
    targetMonth: row.targetMonth,
    date: row.date ? storedDateKey(row.date) : null,
    endDate: row.endDate ? storedDateKey(row.endDate) : null,
    windowStart: row.windowStart ? storedDateKey(row.windowStart) : null,
    windowEnd: row.windowEnd ? storedDateKey(row.windowEnd) : null,
    windowLabel: windowLabelOf(row.windowStart, row.windowEnd),
    startTime: row.startTime,
    endTime: row.endTime,
    customer: row.customer,
    property: row.property,
    headcount: row.headcount,
    unitCount: row.unitCount,
    vehicle: row.vehicle,
    note: row.note,
    customerNameRaw: row.customerNameRaw,
    assignees: row.assignments
      .map((a) => people.get(a.userId))
      .filter((p): p is PersonRef => !!p),
    createdBy: row.createdBy
      ? (people.get(row.createdBy.id) ?? { id: row.createdBy.id, name: row.createdBy.name, avatarColor: row.createdBy.avatarColor, avatarUrl: null })
      : null,
  };
  if (showAmount) view.amount = (row as { amount?: number | null }).amount ?? null;
  return view;
}

/** 1件を読み直して投影（action の戻り値用） */
export async function fetchOccurrenceView(id: string, actor: Actor): Promise<OccurrenceView | null> {
  const showAmount = canViewAmounts(actor);
  const [row, people] = await Promise.all([
    db.occurrence.findUnique({ where: { id }, select: occurrenceSelect(showAmount) }),
    loadPersonMap(),
  ]);
  if (!row) return null;
  return toOccurrenceView(row, people, showAmount);
}

function textFilter(q: string): Prisma.OccurrenceWhereInput | null {
  if (!q) return null;
  return {
    OR: [
      { title: { contains: q } },
      { customerNameRaw: { contains: q } },
      { customer: { OR: [{ name: { contains: q } }, { shortName: { contains: q } }, { kana: { contains: q } }] } },
      { property: { OR: [{ name: { contains: q } }, { kana: { contains: q } }, { address: { contains: q } }] } },
    ],
  };
}

export async function loadSchedule(filters: FilterState, user: Actor & { name: string }): Promise<ScheduleData> {
  const showAmount = canViewAmounts(user);
  const range = rangeFor(filters);
  const start = dateFromKey(range.start);
  const end = dateFromKey(range.end);
  const months = monthsInRange(range);

  const common: Prisma.OccurrenceWhereInput[] = [];
  if (filters.dept !== "ALL") common.push({ department: filters.dept });
  if (filters.category) common.push({ category: filters.category });
  if (filters.customer) common.push({ customerId: filters.customer });
  if (filters.status) common.push({ status: filters.status });
  if (filters.worker) common.push({ assignments: { some: { userId: filters.worker } } });
  if (filters.mine) common.push({ assignments: { some: { userId: user.id } } });
  const tf = textFilter(filters.q);
  if (tf) common.push(tf);

  const select = occurrenceSelect(showAmount);

  const [rows, laneRows, people, workers, customers, properties, settings] = await Promise.all([
    db.occurrence.findMany({
      where: {
        AND: [
          ...common,
          {
            OR: [
              { date: { gte: start, lt: end } },
              // 複数日にまたがる工事（開始が範囲前でも終了が範囲内なら表示）
              { date: { lt: end }, endDate: { gte: start } },
            ],
          },
        ],
      },
      select,
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    }),
    db.occurrence.findMany({
      where: { AND: [...common, { date: null, targetMonth: { in: months }, status: { notIn: ["DONE", "CANCELLED"] } }] },
      select,
      orderBy: [{ targetMonth: "asc" }, { windowStart: "asc" }, { createdAt: "asc" }],
    }),
    loadPersonMap(),
    db.user.findMany({
      where: { active: true },
      select: { id: true, kind: true, department: true, tags: true, partner: { select: { name: true } } },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.customer.findMany({ select: { id: true, name: true, shortName: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
    db.property.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, customerId: true, address: true },
      orderBy: [{ name: "asc" }],
    }),
    getAppSettings(),
  ]);

  const workerOptions: WorkerOption[] = workers
    .map((w) => {
      const p = people.get(w.id);
      if (!p) return null;
      return { ...p, kind: w.kind, department: w.department, tags: w.tags, partnerName: w.partner?.name ?? null };
    })
    .filter((w): w is WorkerOption => !!w);

  return {
    filters,
    range,
    occurrences: rows.map((r) => toOccurrenceView(r, people, showAmount)),
    unassigned: laneRows.map((r) => toOccurrenceView(r, people, showAmount)),
    workers: workerOptions,
    customers: customers as CustomerOption[],
    properties: properties as PropertyOption[],
    showAmount,
    today: jstDateKey(),
    me: { id: user.id, name: user.name, role: user.role, department: user.department },
    defaultTimes: { start: settings.defaultStartTime, end: settings.defaultEndTime },
  };
}

export async function loadChangeLog(occurrenceId: string): Promise<ChangeLogView[]> {
  const rows = await db.occurrenceChangeLog.findMany({
    where: { occurrenceId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      field: true,
      fromValue: true,
      toValue: true,
      scope: true,
      reason: true,
      createdAt: true,
      actor: { select: { id: true, name: true, avatarColor: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    field: r.field,
    fromValue: r.fromValue,
    toValue: r.toValue,
    scope: r.scope,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    actor: r.actor ? { id: r.actor.id, name: r.actor.name, avatarColor: r.actor.avatarColor, avatarUrl: null } : null,
  }));
}
