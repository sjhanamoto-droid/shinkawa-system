"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { parseAndValidatePhotosField, type NewPhotoInput } from "@/lib/photos";

export type PropertyFormState = { error?: string };

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function forbidden(e: unknown): PropertyFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const propertySchema = z.object({
  customerId: z.string().min(1, "顧客を選択してください"),
  name: z.string().trim().min(1, "物件名を入力してください").max(100),
  kana: z.string().trim().max(100).nullable(),
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
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

function parseProperty(formData: FormData) {
  const ks = nz(formData.get("keyboxStatus"));
  return propertySchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    name: formData.get("name") ?? "",
    kana: nz(formData.get("kana")),
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

// ── 物件直付け写真（キーBOX / 図面PDF / 現調写真）──
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
  const sets = parsePhotoFields(formData);
  if ("error" in sets) return { error: sets.error };
  const customer = await db.customer.findUnique({ where: { id: d.customerId }, select: { id: true } });
  if (!customer) return { error: "顧客が見つかりません" };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const p = await tx.property.create({ data: { ...d, createdById: me.id }, select: { id: true } });
      await applyPhotoSets(tx, p.id, sets, me.id);
      return p.id;
    });
  } catch {
    return { error: "物件の保存に失敗しました。時間をおいて再度お試しください" };
  }
  revalidatePath("/properties");
  revalidatePath(`/customers/${d.customerId}`);
  redirect(`/properties/${id}?toast=${encodeURIComponent("保存しました")}`);
}

export async function updateProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "物件が見つかりません" };
  const parsed = parseProperty(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const d = parsed.data;
  const kbErr = validateKeybox(d);
  if (kbErr) return { error: kbErr };
  const sets = parsePhotoFields(formData);
  if ("error" in sets) return { error: sets.error };

  try {
    await db.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data: d });
      await applyPhotoSets(tx, id, sets, me.id);
      // 顧客が変わったら、この物件の案件・実施回の顧客も追従させる
      await tx.job.updateMany({ where: { propertyId: id }, data: { customerId: d.customerId } });
      await tx.occurrence.updateMany({ where: { propertyId: id }, data: { customerId: d.customerId } });
    });
  } catch {
    return { error: "物件の保存に失敗しました。時間をおいて再度お試しください" };
  }
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  revalidatePath("/schedule");
  redirect(`/properties/${id}?toast=${encodeURIComponent("保存しました")}`);
}

export async function setPropertyStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<PropertyFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  await db.property.update({ where: { id }, data: { status } });
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return {};
}

export async function deleteProperty(id: string): Promise<PropertyFormState | void> {
  const me = await requireUser();
  try {
    assertCan(me, "property.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const [occ, jobs] = await Promise.all([db.occurrence.count({ where: { propertyId: id } }), db.job.count({ where: { propertyId: id } })]);
  if (occ > 0 || jobs > 0) {
    return { error: `案件 ${jobs} 件・予定 ${occ} 件が紐づいているため削除できません。ステータスを「終了」にしてください` };
  }
  const p = await db.property.findUnique({ where: { id }, select: { customerId: true } });
  try {
    await db.property.delete({ where: { id } });
  } catch {
    return { error: "削除に失敗しました" };
  }
  revalidatePath("/properties");
  if (p) revalidatePath(`/customers/${p.customerId}`);
  redirect(`/properties?toast=${encodeURIComponent("物件を削除しました")}`);
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
