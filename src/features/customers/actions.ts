"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { REGISTRATION_TYPE_OPTIONS } from "@/lib/constants";

function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

export type CustomerFormState = { error?: string };

function forbidden(e: unknown): CustomerFormState | null {
  return e instanceof PermissionError ? { error: e.message } : null;
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "顧客名を入力してください").max(100),
  shortName: z.string().trim().max(20, "短縮名は20文字以内").nullable(),
  kana: z.string().trim().max(100).nullable(),
  registrationType: z.enum(REGISTRATION_TYPE_OPTIONS),
  tradeStatus: z.enum(["NEW", "CONTINUING", "SUSPENDED"]),
  phone: z.string().trim().max(30).nullable(),
  fax: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(100).nullable(),
  headOfficeAddress: z.string().trim().max(300).nullable(),
  billingAddress: z.string().trim().max(300).nullable(),
  closingDay: z.string().trim().max(30).nullable(),
  paymentDueTerm: z.string().trim().max(30).nullable(),
  paymentMethod: z.enum(["BANK", "NOTE", "DENSAI"]).nullable(),
  memo: z.string().trim().max(2000).nullable(),
});

function parseCustomer(formData: FormData) {
  const pm = nz(formData.get("paymentMethod"));
  return customerSchema.safeParse({
    name: formData.get("name") ?? "",
    shortName: nz(formData.get("shortName")),
    kana: nz(formData.get("kana")),
    registrationType: formData.get("registrationType") || "PRIME",
    tradeStatus: formData.get("tradeStatus") || "CONTINUING",
    phone: nz(formData.get("phone")),
    fax: nz(formData.get("fax")),
    email: nz(formData.get("email")),
    headOfficeAddress: nz(formData.get("headOfficeAddress")),
    billingAddress: nz(formData.get("billingAddress")),
    closingDay: nz(formData.get("closingDay")),
    paymentDueTerm: nz(formData.get("paymentDueTerm")),
    paymentMethod: pm,
    memo: nz(formData.get("memo")),
  });
}

export async function createCustomer(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "customer.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const parsed = parseCustomer(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  let customerId: string;
  try {
    const c = await db.customer.create({ data: parsed.data });
    customerId = c.id;
  } catch {
    return { error: "顧客の保存に失敗しました。時間をおいて再度お試しください" };
  }
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?toast=${encodeURIComponent("保存しました")}`);
}

export async function updateCustomer(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "customer.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "顧客が見つかりません" };
  const parsed = parseCustomer(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  try {
    await db.customer.update({ where: { id }, data: parsed.data });
  } catch {
    return { error: "顧客の保存に失敗しました。時間をおいて再度お試しください" };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  revalidatePath("/schedule");
  redirect(`/customers/${id}?toast=${encodeURIComponent("保存しました")}`);
}

const contactSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(1, "担当者名を入力してください"),
  department: z.string().nullable(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  contactType: z.enum(["SITE", "ACCOUNTING", "APPROVER"]),
  note: z.string().nullable(),
});

export async function addContact(formData: FormData): Promise<void> {
  const me = await requireUser();
  assertCan(me, "customer.manage");
  const parsed = contactSchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    name: formData.get("name") ?? "",
    department: nz(formData.get("department")),
    position: nz(formData.get("position")),
    phone: nz(formData.get("phone")),
    mobile: nz(formData.get("mobile")),
    email: nz(formData.get("email")),
    contactType: formData.get("contactType") || "SITE",
    note: nz(formData.get("note")),
  });
  if (!parsed.success) return;
  const d = parsed.data;
  await db.contactPerson.create({
    data: { ...d, isActive: true, activeFrom: new Date() },
  });
  revalidatePath(`/customers/${d.customerId}`);
}

// 異動・退任：履歴を残すため削除せず無効化する
export async function setContactInactive(formData: FormData): Promise<void> {
  const me = await requireUser();
  assertCan(me, "customer.manage");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const contact = await db.contactPerson.update({
    where: { id },
    data: { isActive: false, activeTo: new Date() },
    select: { customerId: true },
  });
  revalidatePath(`/customers/${contact.customerId}`);
}

export async function deleteCustomer(formData: FormData): Promise<CustomerFormState | void> {
  const me = await requireUser();
  try {
    assertCan(me, "customer.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "顧客が見つかりません" };
  const [propertyCount, occCount] = await Promise.all([
    db.property.count({ where: { customerId: id } }),
    db.occurrence.count({ where: { customerId: id } }),
  ]);
  if (propertyCount > 0 || occCount > 0) {
    return { error: `物件 ${propertyCount} 件・予定 ${occCount} 件が紐づいているため削除できません。取引ステータスを「取引停止」にしてください` };
  }
  try {
    await db.customer.delete({ where: { id } });
  } catch {
    return { error: "顧客の削除に失敗しました" };
  }
  revalidatePath("/customers");
  redirect(`/customers?toast=${encodeURIComponent("顧客を削除しました")}`);
}
