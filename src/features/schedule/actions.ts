"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { assertCan, canViewAmounts, PermissionError } from "@/lib/permissions";
import { dateFromKey, storedDateKey, jstDateKey } from "@/lib/date";
import {
  CATEGORY_OPTIONS,
  DEPARTMENT_OPTIONS,
  NON_WORK_CATEGORIES,
  CATEGORY,
  OCCURRENCE_STATUS_LABEL,
  isRuleKind,
  isOccurrenceStatus,
  type OccurrenceStatus,
} from "@/lib/constants";
import { ruleFromDate, slotsForMonth, type RuleParams } from "@/lib/recurrence";
import { createNotificationForUsers } from "@/lib/notifications";
import type { NotificationType } from "@/lib/constants";
import { fetchOccurrenceView, loadChangeLog } from "./query";
import { fmtKeyShort, shiftKey, ymOf } from "./filters";
import type { ActionResult, OccurrenceView, OccurrenceInput, MoveInput, ChangeLogView } from "./types";

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
  category: z.enum(CATEGORY_OPTIONS),
  customerId: z.string().nullable(),
  propertyId: z.string().nullable(),
  title: z.string().trim().max(100).nullable(),
  date: z.string().regex(DATE_RE).nullable(),
  endDate: z.string().regex(DATE_RE).nullable(),
  startTime: z.string().regex(TIME_RE, "時刻の形式が正しくありません").nullable(),
  endTime: z.string().regex(TIME_RE, "時刻の形式が正しくありません").nullable(),
  headcount: z.number().int().min(0).max(99).nullable(),
  unitCount: z.number().int().min(0).max(999).nullable(),
  vehicle: z.string().trim().max(50).nullable(),
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

/** 状態の自動判定（担当の有無・日付の有無から） */
function computeStatus(current: string, dateKey: string | null, assigneeCount: number, category: string): OccurrenceStatus {
  if (current === "DONE" || current === "CANCELLED") return current;
  if (!dateKey) return "UNASSIGNED";
  const nonWork = (NON_WORK_CATEGORIES as string[]).includes(category);
  if (assigneeCount === 0 && !nonWork) return "UNASSIGNED";
  if (current === "UNASSIGNED") return "TENTATIVE";
  return isOccurrenceStatus(current) ? current : "TENTATIVE";
}

function revalidateAll(propertyId?: string | null) {
  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/jobs");
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
      vehicle: true,
      note: true,
      amount: true,
      customer: { select: { shortName: true, name: true } },
      property: { select: { name: true } },
      job: { select: { ruleKind: true, ruleParams: true } },
      assignments: { select: { userId: true } },
    },
  });
  if (!occ) throw new NotFoundError();
  return occ;
}

type Loaded = Awaited<ReturnType<typeof loadForMutation>>;

function labelOfOcc(occ: Loaded): string {
  return occ.title ?? occ.customer?.shortName ?? occ.customer?.name ?? occ.property?.name ?? "予定";
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

function occLabelWithDate(occ: Loaded, dateKey: string | null): string {
  const cat = occ.category in CATEGORY ? CATEGORY[occ.category as keyof typeof CATEGORY].label : occ.category;
  return `${dateKey ? fmtKeyShort(dateKey) : "日付未定"} ${cat} ${labelOfOcc(occ)}`;
}

function parseSlotIndex(seriesKey: string | null): number | null {
  if (!seriesKey) return null;
  const idx = Number(seriesKey.split(":").pop());
  return Number.isInteger(idx) ? idx : null;
}

// ─────────────────────────── 作成 ───────────────────────────

export async function createOccurrence(raw: OccurrenceInput): Promise<ActionResult<{ occurrence: OccurrenceView }>> {
  return run(async (me) => {
    const input = inputSchema.parse(raw);
    assertCan(me, "occurrence.create", { department: input.department });
    if (input.amount !== undefined && input.amount !== null) assertCan(me, "amount.edit");
    if (input.endDate && input.date && input.endDate < input.date) throw new ValidationError("終了日は開始日以降にしてください");

    let customerId = input.customerId;
    if (input.propertyId) {
      const p = await db.property.findUnique({ where: { id: input.propertyId }, select: { customerId: true } });
      if (!p) throw new ValidationError("物件が見つかりません");
      customerId = p.customerId;
    }
    const workerIds = Array.from(new Set(input.workerIds));
    const status = computeStatus("UNASSIGNED", input.date, workerIds.length, input.category);
    const targetMonth = ymOf(input.date ?? jstDateKey());

    const created = await db.$transaction(async (tx) => {
      const occ = await tx.occurrence.create({
        data: {
          department: input.department,
          category: input.category,
          customerId,
          propertyId: input.propertyId,
          title: input.title || null,
          targetMonth,
          date: input.date ? dateFromKey(input.date) : null,
          endDate: input.endDate ? dateFromKey(input.endDate) : null,
          startTime: input.startTime,
          endTime: input.endTime,
          headcount: input.headcount,
          unitCount: input.unitCount,
          vehicle: input.vehicle,
          note: input.note,
          amount: canViewAmounts(me) ? (input.amount ?? null) : null,
          status,
          source: "MANUAL",
          createdById: me.id,
          assignments: { createMany: { data: workerIds.map((userId) => ({ userId, createdById: me.id })) } },
        },
        select: { id: true, version: true, date: true, category: true, propertyId: true },
      });
      await log(tx, occ.id, me.id, { action: "CREATE", toValue: input.date ?? "日付未定" });
      for (const userId of workerIds) await log(tx, occ.id, me.id, { action: "ASSIGN", field: "assignee", toValue: userId });
      return occ;
    });

    const view = await fetchOccurrenceView(created.id, me);
    if (!view) throw new NotFoundError();
    await notify(me, created, workerIds, "OCC_ASSIGNED", "予定の担当になりました", `${view.date ? fmtKeyShort(view.date) : "日付未定"} ${view.title}`);
    revalidateAll(created.propertyId);
    return { occurrence: view };
  });
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
        endDate: input.endDate ? dateFromKey(input.endDate) : null,
        startTime: input.startTime,
        endTime: input.endTime,
        headcount: input.headcount,
        unitCount: input.unitCount,
        vehicle: input.vehicle,
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
      await log(tx, id, me.id, { action: "EDIT" });
      if (dateChanged) await log(tx, id, me.id, { action: "MOVE", field: "date", fromValue: oldDate ?? "日付未定", toValue: input.date ?? "日付未定", scope: "ONE" });
      for (const u of added) await log(tx, id, me.id, { action: "ASSIGN", field: "assignee", toValue: u });
      for (const u of removed) await log(tx, id, me.id, { action: "UNASSIGN", field: "assignee", fromValue: u });
      if (status !== occ.status) await log(tx, id, me.id, { action: "STATUS", field: "status", fromValue: occ.status, toValue: status });
      return { occ, added, dateChanged, remaining: after.filter((u) => !added.includes(u)) };
    });

    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
    if (result.added.length) await notify(me, occRef, result.added, "OCC_ASSIGNED", "予定の担当になりました", `${view.date ? fmtKeyShort(view.date) : "日付未定"} ${view.title}`);
    if (result.dateChanged) await notify(me, occRef, result.remaining, "OCC_MOVED", "予定の日付が変わりました", `${view.date ? fmtKeyShort(view.date) : "日付未定"} ${view.title}`);
    revalidateAll(view.property?.id);
    return { occurrence: view };
  });
}

// ─────────────────────────── 移動（D&D／移動シート） ───────────────────────────

export async function moveOccurrence(
  id: string,
  move: MoveInput,
  expectedVersion: number,
): Promise<ActionResult<{ occurrence: OccurrenceView; movedIds: string[] }>> {
  return run(async (me) => {
    if (move.date && !DATE_RE.test(move.date)) throw new ValidationError("日付の形式が正しくありません");
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
      if (move.scope === "FOLLOWING" && dateChanged && newDate && occ.jobId && isRuleKind(occ.job?.ruleKind)) {
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
            status: { in: ["UNASSIGNED", "TENTATIVE"] },
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

      return {
        occ,
        movedIds,
        dateChanged,
        notifyMoved: before.filter((u) => !remove.includes(u) && !add.includes(u)),
        notifyAdded: add,
      };
    });

    const view = await fetchOccurrenceView(id, me);
    if (!view) throw new NotFoundError();
    const occRef = { id, version: view.version, date: view.date ? dateFromKey(view.date) : null, category: view.category };
    const label = occLabelWithDate(result.occ, view.date);
    if (result.dateChanged) await notify(me, occRef, result.notifyMoved, "OCC_MOVED", "予定の日付が変わりました", label + (reason ? `（${reason}）` : ""));
    if (result.notifyAdded.length) await notify(me, occRef, result.notifyAdded, "OCC_ASSIGNED", "予定の担当になりました", label);
    revalidateAll(view.property?.id);
    return { occurrence: view, movedIds: result.movedIds };
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
        `${occLabelWithDate(r.occ, view.date)}（${OCCURRENCE_STATUS_LABEL[status]}）`,
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
      await notify(me, occRef, r.added, "OCC_ASSIGNED", "予定の担当になりました", occLabelWithDate(r.occ, view.date));
    }
    revalidateAll(view.property?.id);
    return { occurrence: view };
  });
}

// ─────────────────────────── 削除 ───────────────────────────

export async function deleteOccurrence(id: string, scope: "ONE" | "FOLLOWING"): Promise<ActionResult<{ deletedIds: string[] }>> {
  return run(async (me) => {
    const deleted = await db.$transaction(async (tx) => {
      const occ = await loadForMutation(tx, id);
      assertCan(me, "occurrence.delete", { department: occ.department });
      const ids = [id];
      if (scope === "FOLLOWING" && occ.jobId && occ.seriesKey) {
        const oldDate = occ.date ? storedDateKey(occ.date) : null;
        const siblings = await tx.occurrence.findMany({
          where: {
            jobId: occ.jobId,
            id: { not: id },
            seriesKey: { not: null },
            status: { in: ["UNASSIGNED", "TENTATIVE"] },
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
        if (oldDate) await tx.job.update({ where: { id: occ.jobId }, data: { endsOn: dateFromKey(shiftKey(oldDate, -1)), status: "ENDED" } });
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

