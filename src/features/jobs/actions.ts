"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, canViewAmounts, PermissionError } from "@/lib/permissions";
import { dateFromKey } from "@/lib/date";
import {
  CATEGORY,
  CATEGORY_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  DEPARTMENT_OPTIONS,
  JOB_STATUS_OPTIONS,
  RULE_KIND_OPTIONS,
  isRuleKind,
} from "@/lib/constants";
import { validateRule, type RuleParams } from "@/lib/recurrence";

export type JobFormState = { error?: string };

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function forbidden(e: unknown): JobFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const jobSchema = z.object({
  propertyId: z.string().min(1, "物件を選択してください"),
  name: z.string().trim().min(1, "案件名を入力してください").max(100),
  department: z.enum(DEPARTMENT_OPTIONS),
  category: z.enum(CATEGORY_OPTIONS),
  contractType: z.enum(CONTRACT_TYPE_OPTIONS),
  ruleKind: z.enum(RULE_KIND_OPTIONS).nullable(),
  ruleParams: z.string().nullable(),
  unitCount: z.coerce.number().int().min(0).max(999).nullable(),
  headcount: z.coerce.number().int().min(0).max(99).nullable(),
  defaultStartTime: z.string().regex(timeRe, "開始時刻の形式が正しくありません").nullable(),
  defaultEndTime: z.string().regex(timeRe, "終了時刻の形式が正しくありません").nullable(),
  vehicle: z.string().trim().max(50).nullable(),
  amount: z.coerce.number().int().min(0).max(100_000_000).nullable(),
  note: z.string().trim().max(2000).nullable(),
  status: z.enum(JOB_STATUS_OPTIONS),
  startsOn: z.string().regex(dateRe).nullable(),
  endsOn: z.string().regex(dateRe).nullable(),
});

function parseJob(formData: FormData, allowAmount: boolean) {
  const rk = nz(formData.get("ruleKind"));
  return jobSchema.safeParse({
    propertyId: formData.get("propertyId") ?? "",
    name: formData.get("name") ?? "",
    department: formData.get("department") || "CLEANING",
    category: formData.get("category") || "REGULAR_CLEANING",
    contractType: formData.get("contractType") || "REGULAR",
    ruleKind: rk && isRuleKind(rk) ? rk : null,
    ruleParams: nz(formData.get("ruleParams")),
    unitCount: nz(formData.get("unitCount")),
    headcount: nz(formData.get("headcount")),
    defaultStartTime: nz(formData.get("defaultStartTime")),
    defaultEndTime: nz(formData.get("defaultEndTime")),
    vehicle: nz(formData.get("vehicle")),
    amount: allowAmount ? nz(formData.get("amount")) : null,
    note: nz(formData.get("note")),
    status: formData.get("status") || "ACTIVE",
    startsOn: nz(formData.get("startsOn")),
    endsOn: nz(formData.get("endsOn")),
  });
}

type Parsed = z.infer<typeof jobSchema>;

/** ルール・整合性の検証。返り値は保存用データか、エラー */
function normalize(d: Parsed): { data: Omit<Prisma.JobUncheckedCreateInput, "customerId" | "propertyId" | "name"> & { name: string } } | { error: string } {
  const catDept = CATEGORY[d.category].department;
  if (catDept && catDept !== d.department) return { error: `種別「${CATEGORY[d.category].label}」は${catDept === "CLEANING" ? "クリーニング" : "工事"}部門の種別です` };
  let ruleKind: string | null = null;
  let ruleParams: RuleParams | null = null;
  if (d.contractType === "REGULAR") {
    if (!d.ruleKind) return { error: "定期契約は周期を選択してください" };
    ruleKind = d.ruleKind;
    try {
      ruleParams = d.ruleParams ? (JSON.parse(d.ruleParams) as RuleParams) : {};
    } catch {
      return { error: "周期の設定が読み取れません" };
    }
    const err = validateRule(d.ruleKind, ruleParams);
    if (err) return { error: err };
  }
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) return { error: "契約終了日は開始日以降にしてください" };
  return {
    data: {
      name: d.name,
      department: d.department,
      category: d.category,
      contractType: d.contractType,
      ruleKind,
      ruleParams: ruleParams === null ? Prisma.JsonNull : (ruleParams as Prisma.InputJsonValue),
      unitCount: d.unitCount,
      headcount: d.headcount,
      defaultStartTime: d.defaultStartTime,
      defaultEndTime: d.defaultEndTime,
      vehicle: d.vehicle,
      note: d.note,
      status: d.status,
      startsOn: d.startsOn ? dateFromKey(d.startsOn) : null,
      endsOn: d.endsOn ? dateFromKey(d.endsOn) : null,
    },
  };
}

export async function createJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const me = await requireUser();
  const allowAmount = canViewAmounts(me);
  const parsed = parseJob(formData, allowAmount);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;
  try {
    assertCan(me, "job.manage", { department: d.department });
    if (d.amount != null) assertCan(me, "amount.edit");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const n = normalize(d);
  if ("error" in n) return { error: n.error };
  const property = await db.property.findUnique({ where: { id: d.propertyId }, select: { customerId: true } });
  if (!property) return { error: "物件が見つかりません" };

  const job = await db.job.create({
    data: { ...n.data, customerId: property.customerId, propertyId: d.propertyId, amount: allowAmount ? d.amount : null, createdById: me.id },
    select: { id: true },
  });
  revalidatePath("/jobs");
  revalidatePath(`/properties/${d.propertyId}`);
  redirect(`/jobs/${job.id}?toast=${encodeURIComponent("案件を登録しました。「生成」で実施回を作れます")}`);
}

export async function updateJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const me = await requireUser();
  const allowAmount = canViewAmounts(me);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "案件が見つかりません" };
  const parsed = parseJob(formData, allowAmount);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;
  const existing = await db.job.findUnique({ where: { id }, select: { department: true, amount: true, propertyId: true } });
  if (!existing) return { error: "案件が見つかりません" };
  try {
    assertCan(me, "job.manage", { department: existing.department });
    if (d.department !== existing.department) assertCan(me, "job.manage", { department: d.department });
    if (allowAmount && (d.amount ?? null) !== existing.amount) assertCan(me, "amount.edit");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const n = normalize(d);
  if ("error" in n) return { error: n.error };
  const property = await db.property.findUnique({ where: { id: d.propertyId }, select: { customerId: true } });
  if (!property) return { error: "物件が見つかりません" };

  await db.job.update({
    where: { id },
    data: { ...n.data, customerId: property.customerId, propertyId: d.propertyId, ...(allowAmount ? { amount: d.amount } : {}) },
  });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  revalidatePath(`/properties/${d.propertyId}`);
  if (existing.propertyId !== d.propertyId) revalidatePath(`/properties/${existing.propertyId}`);
  redirect(`/jobs/${id}?toast=${encodeURIComponent("保存しました")}`);
}

export async function setJobStatus(id: string, status: string): Promise<JobFormState> {
  const me = await requireUser();
  if (!(JOB_STATUS_OPTIONS as string[]).includes(status)) return { error: "状態が不正です" };
  const job = await db.job.findUnique({ where: { id }, select: { department: true } });
  if (!job) return { error: "案件が見つかりません" };
  try {
    assertCan(me, "job.manage", { department: job.department });
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  await db.job.update({ where: { id }, data: { status } });
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  return {};
}

export async function deleteJob(id: string): Promise<JobFormState | void> {
  const me = await requireUser();
  const job = await db.job.findUnique({ where: { id }, select: { department: true, propertyId: true, _count: { select: { occurrences: true } } } });
  if (!job) return { error: "案件が見つかりません" };
  try {
    assertCan(me, "job.manage", { department: job.department });
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  if (job._count.occurrences > 0) return { error: `実施回が ${job._count.occurrences} 件あるため削除できません。状態を「終了」にしてください` };
  await db.job.delete({ where: { id } });
  revalidatePath("/jobs");
  revalidatePath(`/properties/${job.propertyId}`);
  redirect(`/jobs?toast=${encodeURIComponent("案件を削除しました")}`);
}
