"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { PARTNER_KIND_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/constants";

export type PartnerFormState = { error?: string };

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function forbidden(e: unknown): PartnerFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const schema = z.object({
  name: z.string().trim().min(1, "会社名を入力してください").max(100),
  kana: z.string().trim().max(100).nullable(),
  kind: z.enum(PARTNER_KIND_OPTIONS),
  department: z.enum(DEPARTMENT_OPTIONS).nullable(),
  contactName: z.string().trim().max(100).nullable(),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(100).nullable(),
  address: z.string().trim().max(300).nullable(),
  memo: z.string().trim().max(2000).nullable(),
});

function parse(formData: FormData) {
  const dept = nz(formData.get("department"));
  return schema.safeParse({
    name: formData.get("name") ?? "",
    kana: nz(formData.get("kana")),
    kind: formData.get("kind") || "PARTNER",
    department: dept === "CLEANING" || dept === "CONSTRUCTION" ? dept : null,
    contactName: nz(formData.get("contactName")),
    phone: nz(formData.get("phone")),
    email: nz(formData.get("email")),
    address: nz(formData.get("address")),
    memo: nz(formData.get("memo")),
  });
}

export async function createPartner(_prev: PartnerFormState, formData: FormData): Promise<PartnerFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "partner.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const p = await db.partner.create({ data: parsed.data, select: { id: true } });
  revalidatePath("/partners");
  redirect(`/partners/${p.id}/edit?toast=${encodeURIComponent("保存しました")}`);
}

export async function updatePartner(_prev: PartnerFormState, formData: FormData): Promise<PartnerFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "partner.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "協力会社が見つかりません" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  await db.partner.update({ where: { id }, data: parsed.data });
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}/edit`);
  redirect(`/partners?toast=${encodeURIComponent("保存しました")}`);
}

export async function togglePartnerActive(id: string): Promise<PartnerFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "partner.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const p = await db.partner.findUnique({ where: { id }, select: { active: true } });
  if (!p) return { error: "協力会社が見つかりません" };
  await db.partner.update({ where: { id }, data: { active: !p.active } });
  revalidatePath("/partners");
  return {};
}

export async function deletePartner(id: string): Promise<PartnerFormState | void> {
  const me = await requireUser();
  try {
    assertCan(me, "partner.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラー" };
  }
  const workers = await db.user.count({ where: { partnerId: id } });
  if (workers > 0) return { error: `所属する作業者が ${workers} 名いるため削除できません。先に作業者の所属を外すか、無効化してください` };
  await db.partner.delete({ where: { id } });
  revalidatePath("/partners");
  redirect(`/partners?toast=${encodeURIComponent("削除しました")}`);
}
