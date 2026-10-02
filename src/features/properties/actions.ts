"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, canEditDepartment, PermissionError } from "@/lib/permissions";
import { parseAndValidatePhotosField, type NewPhotoInput } from "@/lib/photos";
import { dateFromKey, jstDateKey, jstMonthKey, addMonthsKey } from "@/lib/date";
import {
  CONTRACT_TYPE_OPTIONS,
  DEPARTMENT_OPTIONS,
  JOB_STATUS_FOR_PROPERTY,
  PROPERTY_STATUS_OPTIONS,
  type PropertyStatus,
} from "@/lib/constants";
import { validateRule, type RuleParams } from "@/lib/recurrence";
import { generateOccurrencesForMonth } from "@/lib/generate-occurrences";
import { PRIMARY_JOB_ORDER } from "./work";
import { getCategories } from "@/lib/categories-server";
import type { Cat } from "@/lib/categories";

export type PropertyFormState = { error?: string };

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function forbidden(e: unknown): PropertyFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const propertySchema = z.object({
  customerId: z.string().min(1, "顧客を選択してください"),
  name: z.string().trim().min(1, "現場名を入力してください").max(100),
  kana: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(300).nullable(),
  building: z.string().trim().max(100).nullable(),
  unitCount: z.coerce.number().int().min(0).max(999).nullable(),
  keyboxStatus: z.enum(["HAS", "NONE"]).nullable(),
  keyboxNumber: z.string().trim().max(50).nullable(),
  keyboxPlace: z.string().trim().max(200).nullable(),
  keyboxNoneReason: z.string().trim().max(200).nullable(),
  accessNote: z.string().trim().max(2000).nullable(),
  contactName: z.string().trim().max(100).nullable(),
  contactPhone: z.string().trim().max(30).nullable(),
  handoverNote: z.string().trim().max(2000).nullable(),
  status: z.enum(PROPERTY_STATUS_OPTIONS),
});

function parseProperty(formData: FormData) {
  const ks = nz(formData.get("keyboxStatus"));
  return propertySchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    name: formData.get("name") ?? "",
    kana: formData.has("kana") ? nz(formData.get("kana")) : undefined,
    address: nz(formData.get("address")),
    building: nz(formData.get("building")),
    unitCount: nz(formData.get("unitCount")),
    keyboxStatus: ks === "HAS" || ks === "NONE" ? ks : null,
    keyboxNumber: nz(formData.get("keyboxNumber")),
    keyboxPlace: nz(formData.get("keyboxPlace")),
    keyboxNoneReason: nz(formData.get("keyboxNoneReason")),
    accessNote: nz(formData.get("accessNote")),
    contactName: nz(formData.get("contactName")),
    contactPhone: nz(formData.get("contactPhone")),
    handoverNote: nz(formData.get("handoverNote")),
    status: formData.get("status") || "ACTIVE",
  });
}

// ── 作業内容（現場1件＝作業1つ。保存先は現場にぶら下がる Job） ──
const workSchema = z.object({
  department: z.enum(DEPARTMENT_OPTIONS),
  category: z.string().regex(/^[A-Z0-9_]{1,40}$/),
  contractType: z.enum(CONTRACT_TYPE_OPTIONS),
  timesPerMonth: z.coerce.number().int("月の回数は整数で入力してください").min(1, "月の回数は1以上にしてください").max(31, "月の回数は31以下にしてください").nullable(),
  spotDate: z.string().regex(dateRe, "実施日の形式が正しくありません").nullable(),
  workStart: z.string().regex(dateRe, "工事の開始日の形式が正しくありません").nullable(),
  workEnd: z.string().regex(dateRe, "工事の終了日の形式が正しくありません").nullable(),
  addToCalendar: z.boolean(),
});
type Work = z.infer<typeof workSchema>;

/** 部門が未選択なら null（＝作業内容は未設定のまま保存） */
function parseWork(formData: FormData): { work: Work | null } | { error: string } {
  const department = nz(formData.get("workDepartment"));
  if (!department) return { work: null };
  const parsed = workSchema.safeParse({
    department,
    category: formData.get("category") ?? "",
    contractType: formData.get("contractType") ?? "",
    timesPerMonth: nz(formData.get("timesPerMonth")),
    spotDate: nz(formData.get("spotDate")),
    workStart: nz(formData.get("workStart")),
    workEnd: nz(formData.get("workEnd")),
    addToCalendar: formData.get("addToCalendar") === "1",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "category") return { error: "種別を選択してください" };
    if (issue?.path[0] === "contractType") return { error: "定期・スポット・工事のどれかを選択してください" };
    return { error: issue?.message ?? "作業内容の入力エラー" };
  }
  return { work: parsed.data };
}

// 人数・時刻・車両・金額は現場の画面から外した（予定ごとにカレンダーで入れる）。既存の作業に入っている値は触らない
type JobData = Omit<Prisma.JobUncheckedCreateInput, "customerId" | "propertyId" | "amount" | "status" | "unitCount" | "vehicleId" | "headcount" | "defaultStartTime" | "defaultEndTime">;

/** 作業内容の整合性チェックと Job 保存用データ。currentCategory＝今保存されている種別（使わない設定になっていても、そのままなら保存できる） */
function normalizeWork(w: Work, categories: Cat[], currentCategory?: string | null): { data: JobData } | { error: string } {
  const cat = categories.find((c) => c.key === w.category);
  if (!cat || w.category === "OFF" || (!cat.active && w.category !== currentCategory)) return { error: "種別を選択してください" };
  if (cat.department && cat.department !== w.department) return { error: `種別「${cat.label}」は${cat.department === "CLEANING" ? "クリーニング" : "工事"}部門の種別です` };
  let ruleKind: string | null = null;
  let ruleParams: RuleParams | null = null;
  // 期間は頻度ごとに必要なものだけ書く（スポットは触らない＝旧データの契約期間を消さない）
  let period: { startsOn?: Date | null; endsOn?: Date | null } = {};
  if (w.contractType === "REGULAR") {
    // 定期は「月◯回」：日付は持たず、毎月その回数ぶん未割当に入れる（日付はカレンダーで配置）
    if (!w.timesPerMonth) return { error: "月に何回かを入力してください" };
    ruleKind = "TIMES_PER_MONTH";
    ruleParams = { timesPerMonth: w.timesPerMonth };
    const err = validateRule("TIMES_PER_MONTH", ruleParams);
    if (err) return { error: err };
  }
  if (w.contractType === "CONSTRUCTION") {
    if (w.workStart && w.workEnd && w.workEnd < w.workStart) return { error: "工事の終了日は開始日以降にしてください" };
    if (!w.workStart && w.workEnd) return { error: "工事の開始日を入力してください" };
    period = { startsOn: w.workStart ? dateFromKey(w.workStart) : null, endsOn: w.workEnd ? dateFromKey(w.workEnd) : null };
  }
  return {
    data: {
      name: cat.label,
      department: w.department,
      category: w.category,
      contractType: w.contractType,
      ruleKind,
      ruleParams: ruleParams === null ? Prisma.JsonNull : (ruleParams as Prisma.InputJsonValue),
      ...period,
    },
  };
}

/** スポット・工事の予定を1件カレンダーに入れる（日付が無ければ未割当） */
async function createSingleOccurrence(
  tx: Prisma.TransactionClient,
  job: { id: string; propertyId: string; customerId: string; department: string; category: string; headcount: number | null; unitCount: number | null; defaultStartTime: string | null; defaultEndTime: string | null; vehicleId: string | null; amount: number | null },
  w: Work,
  actorId: string,
) {
  const date = w.contractType === "CONSTRUCTION" ? w.workStart : w.spotDate;
  const endDate = w.contractType === "CONSTRUCTION" ? w.workEnd : null;
  const occ = await tx.occurrence.create({
    data: {
      jobId: job.id,
      propertyId: job.propertyId,
      customerId: job.customerId,
      department: job.department,
      category: job.category,
      targetMonth: (date ?? jstDateKey()).slice(0, 7),
      date: date ? dateFromKey(date) : null,
      endDate: endDate && endDate !== date ? dateFromKey(endDate) : null,
      startTime: job.defaultStartTime,
      endTime: job.defaultEndTime,
      headcount: job.headcount,
      unitCount: job.unitCount,
      amount: job.amount,
      status: "UNASSIGNED",
      source: "MANUAL",
      createdById: actorId,
    },
    select: { id: true },
  });
  await tx.occurrenceChangeLog.create({ data: { occurrenceId: occ.id, actorId, action: "CREATE", toValue: date ?? "日付未定" } });
  if (job.vehicleId) await tx.occurrenceVehicle.create({ data: { occurrenceId: occ.id, vehicleId: job.vehicleId, createdById: actorId } });
}

/** 定期：今月と来月の分を未割当に入れる（その先は毎月の自動生成） */
async function generateFirstMonths(jobId: string, actorId: string): Promise<number> {
  const first = jstMonthKey();
  let created = 0;
  for (const month of [first, addMonthsKey(first, 1)]) {
    const r = await generateOccurrencesForMonth({ month, jobId, actorId, notBefore: jstDateKey() });
    created += r.created;
  }
  return created;
}

// ── 現場直付け写真（キーBOX / 図面PDF / 現調写真）──
const PHOTO_FIELDS = [
  { field: "keyboxPhotos", kind: "KEYBOX" },
  { field: "drawingPhotos", kind: "DRAWING" },
  { field: "surveyPhotos", kind: "SURVEY" },
] as const;

type PhotoSet = { kind: string; kept: string[]; added: NewPhotoInput[] };

function parsePhotoFields(formData: FormData): PhotoSet[] | { error: string } {
  const sets: PhotoSet[] = [];
  for (const spec of PHOTO_FIELDS) {
    const raw = formData.get(spec.field);
    const parsed = parseAndValidatePhotosField(typeof raw === "string" ? raw : "");
    if ("error" in parsed) return { error: parsed.error };
    sets.push({ kind: spec.kind, kept: parsed.kept, added: parsed.added });
  }
  return sets;
}

// kind ごとに「kept に無い既存写真を削除 → added を作成」
async function applyPhotoSets(tx: Prisma.TransactionClient, propertyId: string, sets: PhotoSet[], createdById: string) {
  for (const set of sets) {
    await tx.photo.deleteMany({ where: { propertyId, kind: set.kind, id: { notIn: set.kept } } });
    if (set.added.length > 0) {
      await tx.photo.createMany({
        data: set.added.map((p) => ({
          propertyId,
          kind: set.kind,
          dataUrl: p.dataUrl ?? null,
          thumbUrl: p.thumbUrl ?? null,
          blobPath: p.blobPath ?? null,
          mimeType: p.mimeType ?? null,
          sizeBytes: p.sizeBytes ?? null,
          duration: p.duration ?? null,
          caption: p.caption.trim() === "" ? null : p.caption,
          isVideo: p.isVideo,
          width: p.width ?? null,
          height: p.height ?? null,
          createdById,
        })),
      });
    }
  }
}

function validateKeybox(d: z.infer<typeof propertySchema>): string | null {
  if (d.keyboxStatus === "NONE" && !d.keyboxNoneReason) return "キーBOXが無い場合は、鍵の受け渡し方法を入力してください";
  return null;
}

/** 現場の主な作業（現場1件＝作業1つ。統合前のデータで複数ある場合は最初に登録したもの） */
async function primaryJobOf(tx: Prisma.TransactionClient | typeof db, propertyId: string) {
  return tx.job.findFirst({
    where: { propertyId },
    orderBy: PRIMARY_JOB_ORDER,
    select: { id: true, department: true, category: true, amount: true, _count: { select: { occurrences: true } } },
  });
}

/**
 * 現場のステータスを作業（すべて）に反映する。
 * 止まっていた現場を「稼働中」に戻したときは、定期の終了日を外す
 * （カレンダーの「以降を削除」で入った終了日が、再開後も生成を止め続けないように）。
 */
async function syncJobStatus(tx: Prisma.TransactionClient, propertyId: string, prev: string, next: PropertyStatus) {
  await tx.job.updateMany({ where: { propertyId }, data: { status: JOB_STATUS_FOR_PROPERTY[next] } });
  if (next === "ACTIVE" && prev !== "ACTIVE") {
    await tx.job.updateMany({ where: { propertyId, contractType: "REGULAR" }, data: { endsOn: null } });
  }
}

/** 現場に付いている作業の部門をすべて編集できるか（他部門の作業を止めたり消したりさせない） */
async function canEditAllWork(me: Parameters<typeof canEditDepartment>[0], propertyId: string): Promise<boolean> {
  const depts = await db.job.findMany({ where: { propertyId }, select: { department: true }, distinct: ["department"] });
  return depts.every((j) => canEditDepartment(me, j.department));
}

function revalidateProperty(id: string, customerId?: string) {
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/schedule");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

const JOB_RESULT_SELECT = { id: true, propertyId: true, customerId: true, department: true, category: true, headcount: true, unitCount: true, defaultStartTime: true, defaultEndTime: true, vehicleId: true, amount: true } as const;

/** 定期で「予定を作る」にチェックしたときの結果メッセージ */
async function generateAfterSave(jobId: string, w: Work, status: PropertyStatus, actorId: string, done: string): Promise<string> {
  if (status !== "ACTIVE") return `${done}（休止・終了中のため予定は作っていません）`;
  const n = await generateFirstMonths(jobId, actorId).catch(() => -1);
  return n < 0 ? `${done}（予定の作成に失敗しました。「予定を作る」から作り直せます）` : `${done}。未割当に${n}件入れました`;
}

export async function createProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const parsed = parseProperty(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;
  const kbErr = validateKeybox(d);
  if (kbErr) return { error: kbErr };
  const pw = parseWork(formData);
  if ("error" in pw) return { error: pw.error };
  const w = pw.work;
  if (!w) return { error: "部門（クリーニング／工事）を選択してください" };
  try {
    assertCan(me, "job.manage", { department: w.department });
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const nw = normalizeWork(w, await getCategories());
  if ("error" in nw) return { error: nw.error };
  const sets = parsePhotoFields(formData);
  if ("error" in sets) return { error: sets.error };
  const customer = await db.customer.findUnique({ where: { id: d.customerId }, select: { id: true } });
  if (!customer) return { error: "顧客が見つかりません" };
  let ids: { propertyId: string; jobId: string };
  try {
    ids = await db.$transaction(async (tx) => {
      const p = await tx.property.create({ data: { ...d, createdById: me.id }, select: { id: true } });
      await applyPhotoSets(tx, p.id, sets, me.id);
      const job = await tx.job.create({
        data: {
          ...nw.data,
          customerId: d.customerId,
          propertyId: p.id,
          unitCount: d.unitCount,
          status: JOB_STATUS_FOR_PROPERTY[d.status],
          createdById: me.id,
        },
        select: JOB_RESULT_SELECT,
      });
      if (w.addToCalendar && w.contractType !== "REGULAR") await createSingleOccurrence(tx, job, w, me.id);
      return { propertyId: p.id, jobId: job.id };
    });
  } catch {
    return { error: "現場の保存に失敗しました。時間をおいて再度お試しください" };
  }

  let toast = "現場を登録しました";
  if (w.addToCalendar) {
    toast = w.contractType === "REGULAR" ? await generateAfterSave(ids.jobId, w, d.status, me.id, toast) : "現場を登録し、カレンダーに予定を入れました";
  }
  revalidateProperty(ids.propertyId, d.customerId);
  redirect(`/properties/${ids.propertyId}?toast=${encodeURIComponent(toast)}`);
}

export async function updateProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "現場が見つかりません" };
  const parsed = parseProperty(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;
  const kbErr = validateKeybox(d);
  if (kbErr) return { error: kbErr };
  const sets = parsePhotoFields(formData);
  if ("error" in sets) return { error: sets.error };

  const current = await db.property.findUnique({ where: { id }, select: { status: true } });
  if (!current) return { error: "現場が見つかりません" };
  const existingJob = await primaryJobOf(db, id);
  // 他部門の作業を持つ現場を手配担当が編集するときは、作業内容とステータスには触らせない（フォームも読み取り専用）
  const workEditable = await canEditAllWork(me, id);
  if (!workEditable && d.status !== current.status) return { error: "ステータスは担当部門の手配担当・事務だけが変更できます" };
  let w: Work | null = null;
  let nw: { data: JobData } | null = null;
  if (workEditable) {
    const pw = parseWork(formData);
    if ("error" in pw) return { error: pw.error };
    w = pw.work;
    if (!w && existingJob) return { error: "部門（クリーニング／工事）を選択してください" };
    if (w) {
      try {
        assertCan(me, "job.manage", { department: w.department });
      } catch (e) {
        return forbidden(e) ?? { error: "エラーが発生しました" };
      }
      const n = normalizeWork(w, await getCategories(), existingJob?.category);
      if ("error" in n) return { error: n.error };
      nw = n;
    }
  }

  let jobId: string | null = existingJob?.id ?? null;
  try {
    jobId = await db.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data: d });
      await applyPhotoSets(tx, id, sets, me.id);
      // 顧客が変わったら、この現場の作業・予定の顧客も追従させる
      await tx.job.updateMany({ where: { propertyId: id }, data: { customerId: d.customerId, unitCount: d.unitCount } });
      await tx.occurrence.updateMany({ where: { propertyId: id }, data: { customerId: d.customerId } });
      if (workEditable) await syncJobStatus(tx, id, current.status, d.status);
      if (!w || !nw) return existingJob?.id ?? null;
      if (!existingJob) {
        // 作業内容が未設定だった現場：部門を選んだら作業を作る
        const job = await tx.job.create({
          data: { ...nw.data, customerId: d.customerId, propertyId: id, unitCount: d.unitCount, status: JOB_STATUS_FOR_PROPERTY[d.status], createdById: me.id },
          select: JOB_RESULT_SELECT,
        });
        if (w.addToCalendar && w.contractType !== "REGULAR") await createSingleOccurrence(tx, job, w, me.id);
        return job.id;
      }
      // 作業名は種別を変えたときだけ付け直す（統合前に付けた独自の名前を残す）
      const { name, ...rest } = nw.data;
      const job = await tx.job.update({
        where: { id: existingJob.id },
        data: {
          ...rest,
          ...(existingJob.category !== w.category ? { name } : {}),
        },
        select: JOB_RESULT_SELECT,
      });
      // 部門・種別を変えたら、まだ確定していない予定にも反映する
      if (existingJob.category !== w.category || existingJob.department !== w.department) {
        await tx.occurrence.updateMany({
          where: { jobId: existingJob.id, status: { in: ["UNASSIGNED", "TENTATIVE"] } },
          data: { department: w.department, category: w.category },
        });
      }
      if (w.addToCalendar && w.contractType !== "REGULAR") await createSingleOccurrence(tx, job, w, me.id);
      return job.id;
    });
  } catch {
    return { error: "現場の保存に失敗しました。時間をおいて再度お試しください" };
  }

  let toast = "保存しました";
  if (w?.addToCalendar && jobId) {
    toast = w.contractType === "REGULAR" ? await generateAfterSave(jobId, w, d.status, me.id, toast) : "保存し、カレンダーに予定を入れました";
  }
  revalidateProperty(id, d.customerId);
  redirect(`/properties/${id}?toast=${encodeURIComponent(toast)}`);
}

export async function setPropertyStatus(id: string, status: PropertyStatus): Promise<PropertyFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  if (!(PROPERTY_STATUS_OPTIONS as string[]).includes(status)) return { error: "ステータスが不正です" };
  const current = await db.property.findUnique({ where: { id }, select: { status: true } });
  if (!current) return { error: "現場が見つかりません" };
  if (!(await canEditAllWork(me, id))) return { error: "ステータスは担当部門の手配担当・事務だけが変更できます" };
  await db.$transaction(async (tx) => {
    await tx.property.update({ where: { id }, data: { status } });
    await syncJobStatus(tx, id, current.status, status);
  });
  revalidateProperty(id);
  return {};
}

export async function deleteProperty(id: string): Promise<PropertyFormState | void> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  if (!(await canEditAllWork(me, id))) return { error: "他部門の作業がある現場は削除できません" };
  const occ = await db.occurrence.count({ where: { propertyId: id } });
  if (occ > 0) {
    return { error: `予定が ${occ} 件紐づいているため削除できません。ステータスを「終了」にしてください` };
  }
  const p = await db.property.findUnique({ where: { id }, select: { customerId: true } });
  try {
    // 予定の無い作業は現場と一緒に消す（Job は現場に Cascade）
    await db.property.delete({ where: { id } });
  } catch {
    return { error: "削除に失敗しました" };
  }
  revalidatePath("/properties");
  if (p) revalidatePath(`/customers/${p.customerId}`);
  redirect(`/properties?toast=${encodeURIComponent("現場を削除しました")}`);
}

/**
 * 統合前のデータで1つの現場に作業が複数ある場合に、指定の作業を「この現場のコピー」へ移す。
 * 住所・キーBOX・入館メモなどを引き継いだ新しい現場を作り、作業とその予定・日報の現場を付け替える。
 */
export async function moveJobToCopiedProperty(jobId: string): Promise<PropertyFormState | void> {
  const me = await requireUser();
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, name: true, department: true, status: true, propertyId: true } });
  if (!job) return { error: "作業が見つかりません" };
  try {
    assertCan(me, "property.manage");
    assertCan(me, "job.manage", { department: job.department });
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const src = await db.property.findUnique({ where: { id: job.propertyId } });
  if (!src) return { error: "現場が見つかりません" };
  const primary = await primaryJobOf(db, src.id);
  if (primary?.id === job.id) return { error: "この現場の主な作業は移せません" };
  // 新しい現場の状態は作業の状態に合わせる（終了した作業 → 終了の現場）
  const status: PropertyStatus = job.status === "ENDED" ? "INACTIVE" : job.status === "PAUSED" ? "PAUSED" : "ACTIVE";

  let newId: string;
  try {
    newId = await db.$transaction(async (tx) => {
      const p = await tx.property.create({
        data: {
          customerId: src.customerId,
          name: `${src.name}（${job.name}）`,
          kana: src.kana,
          address: src.address,
          building: src.building,
          unitCount: src.unitCount,
          keyboxStatus: src.keyboxStatus,
          keyboxNumber: src.keyboxNumber,
          keyboxPlace: src.keyboxPlace,
          keyboxNoneReason: src.keyboxNoneReason,
          accessNote: src.accessNote,
          contactName: src.contactName,
          contactPhone: src.contactPhone,
          handoverNote: src.handoverNote,
          status,
          createdById: me.id,
        },
        select: { id: true },
      });
      await tx.job.update({ where: { id: job.id }, data: { propertyId: p.id } });
      const occIds = (await tx.occurrence.findMany({ where: { jobId: job.id }, select: { id: true } })).map((o) => o.id);
      await tx.occurrence.updateMany({ where: { id: { in: occIds } }, data: { propertyId: p.id } });
      await tx.dailyReport.updateMany({ where: { occurrenceId: { in: occIds } }, data: { propertyId: p.id } });
      return p.id;
    });
  } catch {
    return { error: "分けられませんでした。時間をおいて再度お試しください" };
  }
  revalidateProperty(src.id, src.customerId);
  redirect(`/properties/${newId}?toast=${encodeURIComponent("作業を別の現場に分けました。現場名は必要に応じて編集してください")}`);
}

// ── 関連物件 ──
export async function addRelatedProperty(propertyId: string, otherId: string, note?: string): Promise<{ error?: string }> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  if (propertyId === otherId) return { error: "同じ物件は関連付けできません" };
  const exists = await db.propertyRelation.findFirst({
    where: { OR: [{ propertyAId: propertyId, propertyBId: otherId }, { propertyAId: otherId, propertyBId: propertyId }] },
    select: { id: true },
  });
  if (!exists) await db.propertyRelation.create({ data: { propertyAId: propertyId, propertyBId: otherId, note: note?.trim() || null } });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/properties/${otherId}`);
  return {};
}

export async function removePropertyRelation(relationId: string, propertyId: string): Promise<{ error?: string }> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  await db.propertyRelation.delete({ where: { id: relationId } }).catch(() => null);
  revalidatePath(`/properties/${propertyId}`);
  return {};
}
