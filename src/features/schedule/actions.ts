"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { assertCan, can, canViewAmounts, PermissionError } from "@/lib/permissions";
import { dateFromKey, storedDateKey, jstDateKey } from "@/lib/date";
import {
  DEPARTMENT_OPTIONS,
  NON_WORK_CATEGORIES,
  OCCURRENCE_STATUS_LABEL,
  isRuleKind,
  hasFixedDates,
  isOccurrenceStatus,
  type OccurrenceStatus,
} from "@/lib/constants";
import { ruleFromDate, slotsForMonth, type RuleParams } from "@/lib/recurrence";
import { catDepartment, catLabel } from "@/lib/categories";
import { getCategories, isUsableCategory } from "@/lib/categories-server";
import { createNotificationForUsers } from "@/lib/notifications";
import type { NotificationType } from "@/lib/constants";
import { fetchOccurrenceView, fetchOccurrenceViews, loadChangeLog, loadGroupSummary, loadUnassigned, loadVehicleUsage, loadWorkerUsage } from "./query";
import { createOccurrenceDays, daysOf } from "@/lib/occurrence-days";
import { randomUUID } from "node:crypto";
import { fmtKeyShort, shiftKey, ymOf } from "./filters";
import type { ActionResult, OccurrenceView, OccurrenceInput, MoveInput, ChangeLogView, VehicleUsage, WorkerUsage } from "./types";

// ─────────────────────────── 共通 ───────────────────────────

class ConflictError extends Error {
  constructor(public occurrenceId: string) {
    super("他の人が先に変更しました。最新の内容に更新します");
  }
}
class ValidationError extends Error {}
class NotFoundError extends Error {
  constructor() {
    super("予定が見つかりません（削除された可能性があります）");
  }
}

type Tx = Prisma.TransactionClient;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const inputSchema = z.object({
  department: z.enum(DEPARTMENT_OPTIONS),
  category: z.string().regex(/^[A-Z0-9_]{1,40}$/, "種別が正しくありません"),
  customerId: z.string().nullable(),
  propertyId: z.string().nullable(),
  title: z.string().trim().max(100).nullable(),
  date: z.string().regex(DATE_RE).nullable(),
  endDate: z.string().regex(DATE_RE).nullable(),
  startTime: z.string().regex(TIME_RE, "時刻の形式が正しくありません").nullable(),
  endTime: z.string().regex(TIME_RE, "時刻の形式が正しくありません").nullable(),
  headcount: z.number().int().min(0).max(99).nullable(),
  unitCount: z.number().int().min(0).max(999).nullable(),
  vehicleIds: z.array(z.string()).max(10),
  note: z.string().trim().max(2000).nullable(),
  amount: z.number().int().min(0).max(100_000_000).nullable().optional(),
  workerIds: z.array(z.string()).max(20),
});

async function run<T>(fn: (me: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  const me = await requireUser();
  try {
    const data = await fn(me);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    if (e instanceof ConflictError) {
      const latest = (await fetchOccurrenceView(e.occurrenceId, me)) ?? undefined;
      return { ok: false, error: e.message, code: "CONFLICT", latest };
    }
    if (e instanceof NotFoundError) return { ok: false, error: e.message, code: "NOT_FOUND" };
    if (e instanceof ValidationError) return { ok: false, error: e.message, code: "VALIDATION" };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "入力エラー", code: "VALIDATION" };
    console.error("[schedule/actions]", e);
    return { ok: false, error: "処理に失敗しました。時間をおいて再度お試しください" };
  }
}

/** 状態の自動判定：日付が入っていれば予定（CONFIRMED）、無ければ未割当。仮・確定の区別はしない（担当未定は担当の有無で見る） */
function computeStatus(current: string, dateKey: string | null, _assigneeCount?: number, _category?: string): OccurrenceStatus {
  void _assigneeCount;
  void _category;
  if (current === "DONE" || current === "CANCELLED") return current;
  return dateKey ? "CONFIRMED" : "UNASSIGNED";
}

function revalidateAll(propertyId?: string | null) {
  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/properties");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
}

async function loadForMutation(tx: Tx, id: string) {
  const occ = await tx.occurrence.findUnique({
    where: { id },
    select: {
      id: true,
      version: true,
      jobId: true,
      propertyId: true,
      customerId: true,
      seriesKey: true,
      groupId: true,
      title: true,
      department: true,
      category: true,
      status: true,
      targetMonth: true,
      date: true,
      endDate: true,
      startTime: true,
      endTime: true,
      headcount: true,
      unitCount: true,
      note: true,
      amount: true,
      customer: { select: { name: true } },
      property: { select: { name: true } },
      job: { select: { ruleKind: true, ruleParams: true } },
      assignments: { select: { userId: true } },
      vehicles: { select: { vehicleId: true, vehicle: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!occ) throw new NotFoundError();
  return occ;
}

type Loaded = Awaited<ReturnType<typeof loadForMutation>>;

/** 車両 id の実在確認（重複除去・最大10台）。名前は履歴の表示用 */
async function resolveVehicles(tx: Tx, ids: string[]): Promise<{ ids: string[]; names: Map<string, string> }> {
  const uniq = Array.from(new Set(ids)).slice(0, 10);
  if (uniq.length === 0) return { ids: [], names: new Map() };
  const rows = await tx.vehicle.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  if (rows.length !== uniq.length) throw new ValidationError("車両が見つかりません（削除された可能性があります）");
  return { ids: uniq, names: new Map(rows.map((r) => [r.id, r.name])) };
}

/** 使用車両を差し替え、変わっていれば履歴に「車両変更 A・B → C」を残す。戻り値は変更の有無 */
async function syncVehicles(
  tx: Tx,
  occ: { id: string; vehicles: { vehicleId: string; vehicle: { name: string } }[] },
  actorId: string,
  nextIds: string[],
): Promise<boolean> {
  const before = occ.vehicles.map((v) => v.vehicleId);
  const { ids: after, names } = await resolveVehicles(tx, nextIds);
  const added = after.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !after.includes(id));
  if (added.length === 0 && removed.length === 0) return false;
  if (removed.length) await tx.occurrenceVehicle.deleteMany({ where: { occurrenceId: occ.id, vehicleId: { in: removed } } });
  if (added.length) {
    await tx.occurrenceVehicle.createMany({
      data: added.map((vehicleId) => ({ occurrenceId: occ.id, vehicleId, createdById: actorId })),
      skipDuplicates: true,
    });
  }
  await log(tx, occ.id, actorId, {
    action: "VEHICLE",
    field: "vehicle",
    fromValue: occ.vehicles.map((v) => v.vehicle.name).join("・") || null,
    toValue: after.map((id) => names.get(id) ?? id).join("・") || null,
  });
  return true;
}

function labelOfOcc(occ: Loaded): string {
  return occ.title ?? occ.customer?.name ?? occ.property?.name ?? "予定";
}

async function bump(tx: Tx, occ: Loaded, expectedVersion: number, data: Prisma.OccurrenceUncheckedUpdateManyInput) {
  const r = await tx.occurrence.updateMany({
    where: { id: occ.id, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (r.count === 0) throw new ConflictError(occ.id);
}

async function log(
  tx: Tx,
  occurrenceId: string,
  actorId: string,
  entry: { action: string; field?: string; fromValue?: string | null; toValue?: string | null; scope?: string; reason?: string },
) {
  await tx.occurrenceChangeLog.create({
    data: {
      occurrenceId,
      actorId,
      action: entry.action,
      field: entry.field ?? null,
      fromValue: entry.fromValue ?? null,
      toValue: entry.toValue ?? null,
      scope: entry.scope ?? null,
      reason: entry.reason ?? null,
    },
  });
}

async function notify(
  me: CurrentUser,
  occ: { id: string; version: number; date: Date | null; category: string },
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
) {
  const targets = userIds.filter((id) => id !== me.id);
  if (targets.length === 0) return;
  const dateKey = occ.date ? storedDateKey(occ.date) : null;
  await createNotificationForUsers(targets, {
    type,
    title,
    body,
    href: dateKey ? `/schedule?view=day&d=${dateKey}&mine=1` : "/schedule",
    occurrenceId: occ.id,
    dedupeKey: `${type}-${occ.id}-${occ.version}`,
  });
}

/** 部門が決まっている種別（例：内装工事＝工事）を、別の部門の予定にさせない */
async function assertCategoryDepartment(category: string, department: string) {
  const dept = catDepartment(await getCategories(), category);
  if (dept && dept !== department) throw new ValidationError(`種別「${catLabel(await getCategories(), category)}」は${dept === "CLEANING" ? "クリーニング" : "工事"}部門の種別です`);
}

async function occLabelWithDate(occ: Loaded, dateKey: string | null): Promise<string> {
  const cat = catLabel(await getCategories(), occ.category);
  return `${dateKey ? fmtKeyShort(dateKey) : "日付未定"} ${cat} ${labelOfOcc(occ)}`;
}

function parseSlotIndex(seriesKey: string | null): number | null {
  if (!seriesKey) return null;
  const idx = Number(seriesKey.split(":").pop());
  return Number.isInteger(idx) ? idx : null;
}

// ─────────────────────────── 作成 ───────────────────────────

export async function createOccurrence(raw: OccurrenceInput): Promise<ActionResult<{ occurrence: OccurrenceView; occurrences: OccurrenceView[] }>> {
  return run(async (me) => {
    const input = inputSchema.parse(raw);
    if (!(await isUsableCategory(input.category))) throw new ValidationError("種別が見つからないか、使わない設定になっています");
    await assertCategoryDepartment(input.category, input.department);
    assertCan(me, "occurrence.create", { department: input.department });
    if (input.amount !== undefined && input.amount !== null) assertCan(me, "amount.edit");
    if (input.date && input.endDate && input.endDate < input.date) throw new ValidationError("終了日は開始日以降にしてください");
    // 日付が無ければ日付未定（未割当の列）で1件
    let days: (string | null)[];
    try {
      days = input.date ? daysOf(input.date, input.endDate) : [null];
    } catch (e) {
      throw new ValidationError(e instanceof Error ? e.message : "日数が多すぎます");
    }

    let customerId = input.customerId;
    if (input.propertyId) {
      const p = await db.property.findUnique({ where: { id: input.propertyId }, select: { customerId: true } });
      if (!p) throw new ValidationError("物件が見つかりません");
      customerId = p.customerId;
    }
    const workerIds = Array.from(new Set(input.workerIds));
    const status = computeStatus("UNASSIGNED", input.date, workerIds.length, input.category);

    // 複数日で入れた工事は、1日ずつの予定に分けて作る（日ごとに担当・車両・削除・日報を扱えるように）
    const ids = await db.$transaction(
      async (tx) => {
        const { ids: vehicleIds } = await resolveVehicles(tx, input.vehicleIds);
        return createOccurrenceDays(
          tx,
          {
            department: input.department,
            category: input.category,
            customerId,
            propertyId: input.propertyId,
            title: input.title || null,
            startTime: input.startTime,
            endTime: input.endTime,
            headcount: input.headcount,
            unitCount: input.unitCount,
            note: input.note,
            amount: canViewAmounts(me) ? (input.amount ?? null) : null,
            status,
            source: "MANUAL",
            createdById: me.id,
          },
          days,
          { workerIds, vehicleIds, actorId: me.id },
        );
      },
      { timeout: 30_000 },
    );

    const views = await fetchOccurrenceViews(ids, me);
    const first = views[0];
    if (!first) throw new NotFoundError();
    const d0 = days[0], dN = days[days.length - 1];
    const range = !d0 ? "日付未定" : days.length > 1 && dN ? `${fmtKeyShort(d0)}〜${fmtKeyShort(dN)}（${days.length}日）` : fmtKeyShort(d0);
    await notify(me, { id: first.id, version: first.version, date: d0 ? dateFromKey(d0) : null, category: first.category }, workerIds, "OCC_ASSIGNED", "予定の担当になりました", `${range} ${first.title}`);
    revalidateAll(input.propertyId);
    return { occurrence: first, occurrences: views };
  });
}

/**
 * 日付未定だった予定に期間（開始日〜終了日）を入れたとき、1日ずつの予定に分ける。
 * 元の予定は開始日のまま残し（groupId を付ける）、2日目以降を同じ内容・担当・車両で作る。作った予定の id を返す。
 */
async function expandToDays(tx: Tx, id: string, startKey: string, endKey: string, actorId: string): Promise<string[]> {
  let days: string[];
  try {
    days = daysOf(startKey, endKey);
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : "日数が多すぎます");
  }
  if (days.length <= 1) return [];
  const src = await tx.occurrence.findUnique({
    where: { id },
    include: { assignments: { select: { userId: true } }, vehicles: { select: { vehicleId: true } } },
  });
  if (!src) throw new NotFoundError();
  const groupId = randomUUID();
  await tx.occurrence.update({ where: { id }, data: { groupId, endDate: null } });
  const rows = days.slice(1).map((d) => ({
    id: randomUUID(),
    jobId: src.jobId,
    propertyId: src.propertyId,
    customerId: src.customerId,
    title: src.title,
    department: src.department,
    category: src.category,
    targetMonth: d.slice(0, 7),
    date: dateFromKey(d),
    startTime: src.startTime,
    endTime: src.endTime,
    status: src.status,
    headcount: src.headcount,
    unitCount: src.unitCount,
    amount: src.amount,
    note: src.note,
    customerNameRaw: src.customerNameRaw,
    source: src.source,
    createdById: actorId,
    groupId,
  }));
  await tx.occurrence.createMany({ data: rows });
  const ids = rows.map((r) => r.id);
  if (src.assignments.length) {
    await tx.assignment.createMany({ data: ids.flatMap((occurrenceId) => src.assignments.map((a) => ({ occurrenceId, userId: a.userId, createdById: actorId }))), skipDuplicates: true });
  }
  if (src.vehicles.length) {
    await tx.occurrenceVehicle.createMany({ data: ids.flatMap((occurrenceId) => src.vehicles.map((v) => ({ occurrenceId, vehicleId: v.vehicleId, createdById: actorId }))), skipDuplicates: true });
  }
  const reason = `${days[0]}〜${days[days.length - 1]}（${days.length}日）の期間で入れたため1日ずつに分割`;
  await tx.occurrenceChangeLog.createMany({ data: ids.map((occurrenceId, i) => ({ occurrenceId, actorId, action: "CREATE", toValue: days[i + 1], reason })) });
  return ids;
}

// ─────────────────────────── 編集 ───────────────────────────

export async function updateOccurrence(
  id: string,
  raw: OccurrenceInput,
  expectedVersion: number,
): Promise<ActionResult<{ occurrence: OccurrenceView }>> {
  return run(async (me) => {
    const input = inputSchema.parse(raw);
    if (input.endDate && input.date && input.endDate < input.date) throw new ValidationError("終了日は開始日以降にしてください");

    const result = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.edit", { department: occ.department });
      if (input.department !== occ.department) assertCan(me, "occurrence.edit", { department: input.department });
      if (!(await isUsableCategory(input.category, occ.category))) throw new ValidationError("種別が見つからないか、使わない設定になっています");
      await assertCategoryDepartment(input.category, input.department);
      const amountChanged = input.amount !== undefined && (input.amount ?? null) !== occ.amount;
      if (amountChanged) assertCan(me, "amount.edit");

      let customerId = input.customerId;
      if (input.propertyId) {
        const p = await tx.property.findUnique({ where: { id: input.propertyId }, select: { customerId: true } });
        if (!p) throw new ValidationError("物件が見つかりません");
        customerId = p.customerId;
      }

      const before = occ.assignments.map((a) => a.userId);
      const after = Array.from(new Set(input.workerIds));
      const added = after.filter((u) => !before.includes(u));
      const removed = before.filter((u) => !after.includes(u));
      const oldDate = occ.date ? storedDateKey(occ.date) : null;
      const dateChanged = oldDate !== input.date;
      if (dateChanged && (occ.status === "DONE" || occ.status === "CANCELLED")) {
        throw new ValidationError("完了・中止した予定の日付は変更できません");
      }
      const status = computeStatus(occ.status, input.date, after.length, input.category);

      await bump(tx, occ, expectedVersion, {
        department: input.department,
        category: input.category,
        customerId,
        propertyId: input.propertyId,
        title: input.title || null,
        targetMonth: input.date ? ymOf(input.date) : occ.targetMonth,
        date: input.date ? dateFromKey(input.date) : null,
        // 連続工事を分けた1日は1日のまま。日付未定から期間で入れたときは下で1日ずつに分ける（旧データの複数日工事だけ endDate を持つ）
        endDate: input.endDate && !occ.groupId && occ.date ? dateFromKey(input.endDate) : null,
        startTime: input.startTime,
        endTime: input.endTime,
        headcount: input.headcount,
        unitCount: input.unitCount,
        note: input.note,
        ...(amountChanged ? { amount: input.amount ?? null } : {}),
        status,
      });
      if (removed.length) await tx.assignment.deleteMany({ where: { occurrenceId: id, userId: { in: removed } } });
      if (added.length) {
        await tx.assignment.createMany({
          data: added.map((userId) => ({ occurrenceId: id, userId, createdById: me.id })),
          skipDuplicates: true,
        });
      }
      await syncVehicles(tx, occ, me.id, input.vehicleIds);
      await log(tx, id, me.id, { action: "EDIT" });
      if (dateChanged) await log(tx, id, me.id, { action: "MOVE", field: "date", fromValue: oldDate ?? "日付未定", toValue: input.date ?? "日付未定", scope: "ONE" });
      for (const u of added) await log(tx, id, me.id, { action: "ASSIGN", field: "assignee", toValue: u });
      for (const u of removed) await log(tx, id, me.id, { action: "UNASSIGN", field: "assignee", fromValue: u });
      if (status !== occ.status) await log(tx, id, me.id, { action: "STATUS", field: "status", fromValue: occ.status, toValue: status });
      // 日付未定だった予定に期間で日付を入れた → 1日ずつに分ける
      const createdIds = !occ.date && input.date && input.endDate && input.endDate > input.date ? await expandToDays(tx, id, input.date, input.endDate, me.id) : [];
      return { occ, added, dateChanged, createdIds, remaining: after.filter((u) => !added.includes(u)) };
    }, { timeout: 30_000 });

    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    const created = result.createdIds.length ? await fetchOccurrenceViews(result.createdIds, me) : [];
    const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
    if (result.added.length) await notify(me, occRef, result.added, "OCC_ASSIGNED", "予定の担当になりました", `${view.date ? fmtKeyShort(view.date) : "日付未定"} ${view.title}`);
    if (result.dateChanged) await notify(me, occRef, result.remaining, "OCC_MOVED", "予定の日付が変わりました", `${view.date ? fmtKeyShort(view.date) : "日付未定"} ${view.title}`);
    revalidateAll(view.property?.id);
    return { occurrence: view, occurrences: [view, ...created] };
  });
}

// ─────────────────────────── 移動（D&D／移動シート） ───────────────────────────

export async function moveOccurrence(
  id: string,
  move: MoveInput,
  expectedVersion: number,
): Promise<ActionResult<{ occurrence: OccurrenceView; movedIds: string[]; created: OccurrenceView[] }>> {
  return run(async (me) => {
    if (move.date && !DATE_RE.test(move.date)) throw new ValidationError("日付の形式が正しくありません");
    if (move.endDate && (!DATE_RE.test(move.endDate) || !move.date || move.endDate < move.date)) throw new ValidationError("終了日は開始日以降にしてください");
    const reason = move.reason?.trim().slice(0, 200) || undefined;

    const result = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.move", { department: occ.department });
      if (occ.status === "DONE" || occ.status === "CANCELLED") throw new ValidationError("完了・中止した予定は移動できません");

      const oldDate = occ.date ? storedDateKey(occ.date) : null;
      const newDate = move.date;
      const before = occ.assignments.map((a) => a.userId);
      const add = (move.workerAdd ?? []).filter((u) => !before.includes(u));
      const remove = (move.workerRemove ?? []).filter((u) => before.includes(u));
      const after = [...before.filter((u) => !remove.includes(u)), ...add];
      const dateChanged = oldDate !== newDate;
      if (!dateChanged && add.length === 0 && remove.length === 0) {
        return { occ, movedIds: [] as string[], notifyMoved: [] as string[], notifyAdded: [] as string[], dateChanged: false };
      }

      // 複数日工事は日数を保ったまま平行移動
      let endDate: Date | null | undefined = undefined;
      if (dateChanged) {
        if (newDate && occ.endDate && oldDate) {
          const span = Math.round((occ.endDate.getTime() - occ.date!.getTime()) / 86_400_000);
          endDate = dateFromKey(shiftKey(newDate, span));
        } else if (!newDate) {
          endDate = null;
        }
      }
      const status = computeStatus(occ.status, newDate, after.length, occ.category);

      await bump(tx, occ, expectedVersion, {
        ...(dateChanged
          ? {
              date: newDate ? dateFromKey(newDate) : null,
              targetMonth: newDate ? ymOf(newDate) : occ.targetMonth,
              ...(endDate !== undefined ? { endDate } : {}),
            }
          : {}),
        status,
      });
      if (remove.length) await tx.assignment.deleteMany({ where: { occurrenceId: id, userId: { in: remove } } });
      if (add.length) {
        await tx.assignment.createMany({ data: add.map((userId) => ({ occurrenceId: id, userId, createdById: me.id })), skipDuplicates: true });
      }
      if (dateChanged) await log(tx, id, me.id, { action: "MOVE", field: "date", fromValue: oldDate ?? "日付未定", toValue: newDate ?? "日付未定", scope: move.scope, reason });
      for (const u of add) await log(tx, id, me.id, { action: "ASSIGN", field: "assignee", toValue: u, reason });
      for (const u of remove) await log(tx, id, me.id, { action: "UNASSIGN", field: "assignee", fromValue: u, reason });
      if (status !== occ.status) await log(tx, id, me.id, { action: "STATUS", field: "status", fromValue: occ.status, toValue: status });

      // ── 以降の定期もまとめて動かす ──
      const movedIds: string[] = [];
      if (move.scope === "FOLLOWING" && dateChanged && newDate && occ.jobId && isRuleKind(occ.job?.ruleKind) && hasFixedDates(occ.job?.ruleKind)) {
        const kind = occ.job!.ruleKind;
        const params = (occ.job!.ruleParams ?? {}) as RuleParams;
        const slotIndex = parseSlotIndex(occ.seriesKey) ?? 0;
        const newParams = ruleFromDate(kind, params, newDate, slotIndex);
        await tx.job.update({ where: { id: occ.jobId }, data: { ruleParams: newParams as Prisma.InputJsonValue } });
        const siblings = await tx.occurrence.findMany({
          where: {
            jobId: occ.jobId,
            id: { not: id },
            seriesKey: { not: null },
            status: { notIn: ["DONE", "CANCELLED"] },
            targetMonth: { gte: occ.targetMonth },
          },
          select: { id: true, seriesKey: true, targetMonth: true, date: true, status: true, assignments: { select: { userId: true } } },
        });
        for (const s of siblings) {
          const sDate = s.date ? storedDateKey(s.date) : null;
          // 同じ月で元の日付より前の回は触らない
          if (oldDate && sDate && s.targetMonth === occ.targetMonth && sDate < oldDate) continue;
          const idx = parseSlotIndex(s.seriesKey);
          if (idx === null) continue;
          const slot = slotsForMonth(kind, newParams, s.targetMonth).find((x) => x.index === idx);
          const nextDate = slot?.date ?? null;
          if (nextDate === sDate) continue;
          const nextStatus = computeStatus(s.status, nextDate, s.assignments.length, occ.category);
          await tx.occurrence.update({
            where: { id: s.id },
            data: {
              date: nextDate ? dateFromKey(nextDate) : null,
              windowStart: slot ? dateFromKey(slot.windowStart) : undefined,
              windowEnd: slot ? dateFromKey(slot.windowEnd) : undefined,
              status: nextStatus,
              version: { increment: 1 },
            },
          });
          await log(tx, s.id, me.id, { action: "MOVE", field: "date", fromValue: sDate ?? "日付未定", toValue: nextDate ?? "日付未定", scope: "FOLLOWING", reason });
          movedIds.push(s.id);
        }
      }

      // 日付未定だった予定に期間で日付を入れた → 1日ずつに分ける
      const createdIds = !oldDate && newDate && move.endDate && move.endDate > newDate ? await expandToDays(tx, id, newDate, move.endDate, me.id) : [];

      return {
        occ,
        movedIds,
        createdIds,
        dateChanged,
        notifyMoved: before.filter((u) => !remove.includes(u) && !add.includes(u)),
        notifyAdded: add,
      };
    });

    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
    const label = await occLabelWithDate(result.occ, view.date);
    if (result.dateChanged) await notify(me, occRef, result.notifyMoved, "OCC_MOVED", "予定の日付が変わりました", label + (reason ? `（${reason}）` : ""));
    if (result.notifyAdded.length) await notify(me, occRef, result.notifyAdded, "OCC_ASSIGNED", "予定の担当になりました", label);
    revalidateAll(view.property?.id);
    const createdIds = "createdIds" in result ? (result.createdIds ?? []) : [];
    const created = createdIds.length ? await fetchOccurrenceViews(createdIds, me) : [];
    return { occurrence: view, movedIds: result.movedIds, created };
  });
}

// ─────────────────────────── 状態変更 ───────────────────────────

export async function setOccurrenceStatus(
  id: string,
  status: string,
  expectedVersion: number,
  reason?: string,
): Promise<ActionResult<{ occurrence: OccurrenceView }>> {
  return run(async (me) => {
    if (!isOccurrenceStatus(status)) throw new ValidationError("状態が不正です");
    const r = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.status", {
        department: occ.department,
        assigneeIds: occ.assignments.map((a) => a.userId),
        nextStatus: status,
      });
      if (status === "CONFIRMED" && !occ.date) throw new ValidationError("日付を決めてから確定してください");
      if (status === "CONFIRMED" && occ.assignments.length === 0 && !(NON_WORK_CATEGORIES as string[]).includes(occ.category)) {
        throw new ValidationError("担当者を決めてから確定してください");
      }
      if (status === occ.status) return { occ, changed: false };
      await bump(tx, occ, expectedVersion, { status });
      await log(tx, id, me.id, { action: status === "CANCELLED" ? "CANCEL" : "STATUS", field: "status", fromValue: occ.status, toValue: status, reason: reason?.trim() || undefined });
      return { occ, changed: true };
    });
    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    if (r.changed && (status === "CONFIRMED" || status === "CANCELLED")) {
      const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
      await notify(
        me,
        occRef,
        r.occ.assignments.map((a) => a.userId),
        status === "CONFIRMED" ? "OCC_CONFIRMED" : "OCC_CANCELLED",
        status === "CONFIRMED" ? "予定が確定しました" : "予定が中止になりました",
        `${await occLabelWithDate(r.occ, view.date)}（${OCCURRENCE_STATUS_LABEL[status]}）`,
      );
    }
    revalidateAll(view.property?.id);
    return { occurrence: view };
  });
}

// ─────────────────────────── 担当者 ───────────────────────────

export async function assignWorkers(
  id: string,
  workerIds: string[],
  expectedVersion: number,
): Promise<ActionResult<{ occurrence: OccurrenceView }>> {
  return run(async (me) => {
    const after = Array.from(new Set(workerIds)).slice(0, 20);
    const r = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.assign", { department: occ.department });
      const before = occ.assignments.map((a) => a.userId);
      const added = after.filter((u) => !before.includes(u));
      const removed = before.filter((u) => !after.includes(u));
      const status = computeStatus(occ.status, occ.date ? storedDateKey(occ.date) : null, after.length, occ.category);
      await bump(tx, occ, expectedVersion, { status });
      if (removed.length) await tx.assignment.deleteMany({ where: { occurrenceId: id, userId: { in: removed } } });
      if (added.length) await tx.assignment.createMany({ data: added.map((userId) => ({ occurrenceId: id, userId, createdById: me.id })), skipDuplicates: true });
      for (const u of added) await log(tx, id, me.id, { action: "ASSIGN", field: "assignee", toValue: u });
      for (const u of removed) await log(tx, id, me.id, { action: "UNASSIGN", field: "assignee", fromValue: u });
      if (status !== occ.status) await log(tx, id, me.id, { action: "STATUS", field: "status", fromValue: occ.status, toValue: status });
      return { occ, added };
    });
    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    if (r.added.length) {
      const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
      await notify(me, occRef, r.added, "OCC_ASSIGNED", "予定の担当になりました", await occLabelWithDate(r.occ, view.date));
    }
    revalidateAll(view.property?.id);
    return { occurrence: view };
  });
}

// ─────────────────────────── 使用車両 ───────────────────────────

export async function assignVehicles(
  id: string,
  vehicleIds: string[],
  expectedVersion: number,
): Promise<ActionResult<{ occurrence: OccurrenceView }>> {
  return run(async (me) => {
    await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.edit", { department: occ.department });
      await bump(tx, occ, expectedVersion, {});
      await syncVehicles(tx, occ, me.id, vehicleIds);
    });
    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    revalidateAll(view.property?.id);
    return { occurrence: view };
  });
}

/**
 * 予定を現場に紐づける（サイボウズから取り込んだ予定は顧客しか分からないため、あとから現場を選ぶ）。
 * sameCustomer=true のときは、同じ顧客・同じ種別で現場が未設定の今日以降の予定（未定を含む）にもまとめて設定する。
 */
export async function linkOccurrenceProperty(
  id: string,
  propertyId: string,
  expectedVersion: number,
  sameCustomer: boolean,
): Promise<ActionResult<{ occurrence: OccurrenceView; alsoLinked: number }>> {
  return run(async (me) => {
    const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true, customerId: true, status: true } });
    if (!property) throw new ValidationError("現場が見つかりません");
    if (property.status === "INACTIVE") throw new ValidationError("終了した現場には設定できません");
    const alsoLinked = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.edit", { department: occ.department });
      if (occ.customerId && occ.customerId !== property.customerId) throw new ValidationError("この予定の顧客の現場ではありません");
      await bump(tx, occ, expectedVersion, { propertyId: property.id, customerId: property.customerId });
      await log(tx, id, me.id, { action: "EDIT", field: "property", toValue: property.name });
      if (!sameCustomer || !occ.customerId) return 0;
      const today = dateFromKey(jstDateKey());
      const others = await tx.occurrence.findMany({
        where: {
          id: { not: id },
          customerId: occ.customerId,
          category: occ.category,
          propertyId: null,
          status: { notIn: ["DONE", "CANCELLED"] },
          OR: [{ date: null }, { date: { gte: today } }],
        },
        select: { id: true, department: true },
      });
      const editable = others.filter((o) => can(me, "occurrence.edit", { department: o.department })).map((o) => o.id);
      if (editable.length === 0) return 0;
      // 探してから更新するまでに誰かが現場を設定した予定は上書きしない（propertyId: null の条件を更新にも付ける）
      const updatedIds: string[] = [];
      for (const oid of editable) {
        const r = await tx.occurrence.updateMany({ where: { id: oid, propertyId: null }, data: { propertyId: property.id, version: { increment: 1 } } });
        if (r.count > 0) updatedIds.push(oid);
      }
      if (updatedIds.length > 0) {
        await tx.occurrenceChangeLog.createMany({ data: updatedIds.map((occurrenceId) => ({ occurrenceId, actorId: me.id, action: "EDIT", field: "property", toValue: property.name })) });
      }
      return updatedIds.length;
    });
    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    revalidateAll(property.id);
    return { occurrence: view, alsoLinked };
  });
}

/** 指定日に各車両を使う他の予定（重複の警告用） */
export async function getVehicleUsage(dateKey: string, excludeOccurrenceId?: string | null): Promise<ActionResult<{ usage: VehicleUsage }>> {
  return run(async () => {
    if (!DATE_RE.test(dateKey)) throw new ValidationError("日付の形式が正しくありません");
    return { usage: await loadVehicleUsage(dateKey, excludeOccurrenceId) };
  });
}

// ─────────────────────────── 削除 ───────────────────────────

export async function deleteOccurrence(id: string, scope: "ONE" | "FOLLOWING"): Promise<ActionResult<{ deletedIds: string[] }>> {
  return run(async (me) => {
    const deleted = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.delete", { department: occ.department });
      const ids = [id];
      if (scope === "FOLLOWING" && occ.groupId) {
        // 連続工事：同じ工事のこの日以降（完了した日は残す）
        const oldDate = occ.date ? storedDateKey(occ.date) : null;
        const later = await tx.occurrence.findMany({
          where: { groupId: occ.groupId, id: { not: id }, status: { notIn: ["DONE", "CANCELLED"] }, ...(oldDate ? { date: { gte: dateFromKey(oldDate) } } : {}) },
          select: { id: true },
        });
        ids.push(...later.map((o) => o.id));
      } else if (scope === "FOLLOWING" && occ.jobId && occ.seriesKey) {
        const oldDate = occ.date ? storedDateKey(occ.date) : null;
        const siblings = await tx.occurrence.findMany({
          where: {
            jobId: occ.jobId,
            id: { not: id },
            seriesKey: { not: null },
            status: { notIn: ["DONE", "CANCELLED"] },
            targetMonth: { gte: occ.targetMonth },
          },
          select: { id: true, date: true, targetMonth: true },
        });
        for (const s of siblings) {
          const sDate = s.date ? storedDateKey(s.date) : null;
          if (oldDate && sDate && s.targetMonth === occ.targetMonth && sDate < oldDate) continue;
          ids.push(s.id);
        }
        // 契約の終了日を元の日付の前日に
        if (oldDate) {
          const job = await tx.job.update({ where: { id: occ.jobId }, data: { endsOn: dateFromKey(shiftKey(oldDate, -1)), status: "ENDED" }, select: { propertyId: true } });
          // 現場1件＝作業1つ：ほかに稼働中の作業が無ければ現場も「終了」にする（再開は現場の編集から）
          const others = await tx.job.count({ where: { propertyId: job.propertyId, status: "ACTIVE" } });
          if (others === 0) await tx.property.update({ where: { id: job.propertyId }, data: { status: "INACTIVE" } });
        }
      }
      await tx.occurrence.deleteMany({ where: { id: { in: ids } } });
      return { ids, propertyId: occ.propertyId };
    });
    revalidateAll(deleted.propertyId);
    return { deletedIds: deleted.ids };
  });
}

// ─────────────────────────── 変更履歴 ───────────────────────────

export async function getChangeLog(id: string): Promise<ActionResult<{ items: ChangeLogView[] }>> {
  return run(async (me) => {
    assertCan(me, "changelog.view");
    return { items: await loadChangeLog(id) };
  });
}

export async function refreshOccurrence(id: string): Promise<ActionResult<{ occurrence: OccurrenceView | null }>> {
  return run(async (me) => ({ occurrence: await fetchOccurrenceView(id, me) }));
}


/** 予定の追加で選ぶ、その月の未割当 */
export async function getUnassigned(month: string): Promise<ActionResult<{ items: OccurrenceView[] }>> {
  return run(async (me) => {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError("月の形式が正しくありません");
    return { items: await loadUnassigned(month, me) };
  });
}

/** その日に各作業者が入っている予定（担当の選択で印を付ける用） */
export async function getWorkerUsage(dateKey: string, excludeOccurrenceId?: string | null): Promise<ActionResult<{ usage: WorkerUsage }>> {
  return run(async () => {
    if (!DATE_RE.test(dateKey)) throw new ValidationError("日付の形式が正しくありません");
    return { usage: await loadWorkerUsage(dateKey, excludeOccurrenceId) };
  });
}

/** 連続工事の範囲（予定の詳細に「10/23〜11/21 の1日（全30日）」と出す用） */
export async function getGroupSummary(groupId: string): Promise<ActionResult<{ summary: { start: string; end: string; count: number } | null }>> {
  return run(async () => ({ summary: await loadGroupSummary(groupId) }));
}
