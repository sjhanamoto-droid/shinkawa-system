"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { hashPassword, verifyPassword } from "@/lib/password";
import { DEPARTMENT_OPTIONS } from "@/lib/constants";

export type SettingsState = { error?: string; ok?: boolean };

function nz(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── アプリ設定・会社情報（OWNER / OFFICE） ──
const appSchema = z.object({
  companyName: z.string().optional(),
  companyAddress: z.string().optional(),
  companyPhone: z.string().optional(),
  invoiceNumber: z.string().optional(),
  defaultStartTime: z.string().regex(timeRe, "開始時刻の形式が正しくありません（例 09:00）"),
  defaultEndTime: z.string().regex(timeRe, "終了時刻の形式が正しくありません（例 17:00）"),
  generateDay: z.coerce.number().int().min(1, "1〜28で指定してください").max(28, "1〜28で指定してください"),
});

export async function updateAppSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const me = await requireUser();
  try {
    assertCan(me, "settings.manage");
  } catch (e) {
    if (e instanceof PermissionError) return { error: e.message };
    throw e;
  }
  const parsed = appSchema.safeParse({
    companyName: nz(formData.get("companyName")),
    companyAddress: nz(formData.get("companyAddress")),
    companyPhone: nz(formData.get("companyPhone")),
    invoiceNumber: nz(formData.get("invoiceNumber")),
    defaultStartTime: formData.get("defaultStartTime") || "09:00",
    defaultEndTime: formData.get("defaultEndTime") || "17:00",
    generateDay: formData.get("generateDay") || "25",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const data = {
    companyName: d.companyName ?? null,
    companyAddress: d.companyAddress ?? null,
    companyPhone: d.companyPhone ?? null,
    invoiceNumber: d.invoiceNumber ?? null,
    defaultStartTime: d.defaultStartTime,
    defaultEndTime: d.defaultEndTime,
    generateDay: d.generateDay,
  };
  await db.appSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidatePath("/settings/app");
  revalidatePath("/settings");
  return { ok: true };
}

// ── 自分のアカウント設定（全ユーザー） ──
const accountSchema = z.object({
  name: z.string().min(1, "氏名を入力してください"),
  kana: z.string().optional(),
  phone: z.string().optional(),
  department: z.enum(DEPARTMENT_OPTIONS).optional(),
  avatarColor: z.string().optional(),
});

export async function updateAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const me = await requireUser();
  const parsed = accountSchema.safeParse({
    name: nz(formData.get("name")),
    kana: nz(formData.get("kana")),
    phone: nz(formData.get("phone")),
    department: nz(formData.get("department")),
    avatarColor: nz(formData.get("avatarColor")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  await db.user.update({
    where: { id: me.id },
    data: {
      name: d.name,
      kana: d.kana ?? null,
      phone: d.phone ?? null,
      department: d.department ?? null,
      ...(d.avatarColor ? { avatarColor: d.avatarColor } : {}),
    },
  });
  revalidatePath("/settings/account");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── パスワード変更（全ユーザー） ──
const pwSchema = z.object({
  current: z.string().min(1, "現在のパスワードを入力してください"),
  next: z.string().min(6, "新しいパスワードは6文字以上で設定してください"),
});

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const me = await requireUser();
  const parsed = pwSchema.safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user?.passwordHash) return { error: "このアカウントはパスワードでのログインができません" };

  const ok = await verifyPassword(parsed.data.current, user.passwordHash);
  if (!ok) return { error: "現在のパスワードが違います" };

  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true };
}
