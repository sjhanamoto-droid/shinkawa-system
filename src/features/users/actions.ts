"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, isOwner, PermissionError } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { validateAvatarDataUrl } from "@/lib/photos";
import {
  DEFAULT_AVATAR_COLOR,
  ROLE_OPTIONS,
  WORKER_KIND_OPTIONS,
  DEPARTMENT_OPTIONS,
} from "@/lib/constants";

export type UserFormState = { error?: string; ok?: boolean };

function nz(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}

function parseTags(v: FormDataEntryValue | null): string[] {
  const s = typeof v === "string" ? v : "";
  return Array.from(
    new Set(
      s
        .split(/[,\n、]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

const baseShape = {
  name: z.string().min(1, "氏名を入力してください"),
  kana: z.string().optional(),
  email: z.email("メールアドレスの形式が正しくありません").optional(),
  role: z.enum(ROLE_OPTIONS),
  kind: z.enum(WORKER_KIND_OPTIONS),
  department: z.enum(DEPARTMENT_OPTIONS).optional(),
  partnerId: z.string().optional(),
  phone: z.string().optional(),
  canLogin: z.boolean(),
  avatarColor: z.string().optional(),
  tags: z.array(z.string()),
};

const createSchema = z.object({
  ...baseShape,
  password: z.string().min(6, "パスワードは6文字以上で設定してください").optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  ...baseShape,
  password: z.string().min(6, "パスワードは6文字以上で設定してください").optional(),
});

function readForm(formData: FormData) {
  const canLogin = formData.get("canLogin") === "on" || formData.get("canLogin") === "1";
  return {
    name: nz(formData.get("name")),
    kana: nz(formData.get("kana")),
    email: nz(formData.get("email"))?.toLowerCase(),
    role: formData.get("role") || "STAFF",
    kind: formData.get("kind") || "EMPLOYEE",
    department: nz(formData.get("department")),
    partnerId: nz(formData.get("partnerId")),
    phone: nz(formData.get("phone")),
    canLogin,
    avatarColor: nz(formData.get("avatarColor")),
    tags: parseTags(formData.get("tags")),
    password: nz(formData.get("password")),
  };
}

function forbidden(e: unknown): UserFormState | null {
  if (e instanceof PermissionError) return { error: e.message };
  return null;
}

export async function createUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "worker.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const parsed = createSchema.safeParse({ ...readForm(formData), avatarColor: nz(formData.get("avatarColor")) ?? DEFAULT_AVATAR_COLOR });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  if (d.role === "OWNER" && !isOwner(me)) return { error: "最高管理者を付与できるのは最高管理者のみです" };
  if (d.canLogin) {
    if (!d.email) return { error: "ログインする作業者にはメールアドレスが必要です" };
    if (!d.password) return { error: "ログインする作業者には初期パスワードが必要です" };
  }

  const avatarResult = validateAvatarDataUrl(formData.get("avatarImage")?.toString());
  if (avatarResult && typeof avatarResult === "object") return { error: avatarResult.error };
  const avatarImage = avatarResult as string | null;

  if (d.email) {
    const exists = await db.user.findUnique({ where: { email: d.email } });
    if (exists) return { error: "このメールアドレスは既に登録されています" };
  }

  await db.user.create({
    data: {
      name: d.name,
      kana: d.kana ?? null,
      email: d.email ?? null,
      role: d.role,
      kind: d.kind,
      department: d.department ?? null,
      partnerId: d.partnerId ?? null,
      phone: d.phone ?? null,
      canLogin: d.canLogin,
      tags: d.tags,
      avatarColor: d.avatarColor ?? DEFAULT_AVATAR_COLOR,
      avatarImage,
      passwordHash: d.password ? await hashPassword(d.password) : null,
    },
  });
  revalidatePath("/workers");
  redirect("/workers");
}

export async function updateUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "worker.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const parsed = updateSchema.safeParse({ id: formData.get("id"), ...readForm(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const target = await db.user.findUnique({ where: { id: d.id } });
  if (!target) return { error: "ユーザーが見つかりません" };

  if (!isOwner(me)) {
    if (target.role === "OWNER") return { error: "最高管理者の情報を変更できるのは最高管理者のみです" };
    if (d.role === "OWNER") return { error: "最高管理者を付与できるのは最高管理者のみです" };
  }
  if (d.canLogin && !d.email) return { error: "ログインする作業者にはメールアドレスが必要です" };
  if (d.canLogin && !target.passwordHash && !d.password) return { error: "ログインを有効にするには初期パスワードを設定してください" };

  if (d.email && d.email !== target.email) {
    const dup = await db.user.findUnique({ where: { email: d.email } });
    if (dup && dup.id !== d.id) return { error: "このメールアドレスは既に使われています" };
  }

  // 最高管理者を降格して最高管理者が0人にならないか
  if (target.role === "OWNER" && d.role !== "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER", active: true } });
    if (owners <= 1) return { error: "最高管理者が0人になるため、この変更はできません" };
  }

  const avatarResult = validateAvatarDataUrl(formData.get("avatarImage")?.toString());
  if (avatarResult && typeof avatarResult === "object") return { error: avatarResult.error };
  const avatarImage = avatarResult as string | null;

  const passwordHash = d.password ? await hashPassword(d.password) : undefined;

  await db.user.update({
    where: { id: d.id },
    data: {
      name: d.name,
      kana: d.kana ?? null,
      email: d.email ?? null,
      role: d.role,
      kind: d.kind,
      department: d.department ?? null,
      partnerId: d.partnerId ?? null,
      phone: d.phone ?? null,
      canLogin: d.canLogin,
      tags: d.tags,
      avatarColor: d.avatarColor ?? target.avatarColor,
      avatarImage,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
  revalidatePath("/workers");
  revalidatePath(`/workers/${d.id}/edit`);
  redirect("/workers");
}

// 有効/無効の切替（無効化＝ログイン不可・配員候補から除外。記録は保持）
export async function toggleUserActive(id: string): Promise<UserFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "worker.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: "ユーザーが見つかりません" };
  if (target.role === "OWNER" && !isOwner(me)) return { error: "最高管理者を無効化できるのは最高管理者のみです" };

  if (target.active) {
    if (target.id === me.id) return { error: "自分自身は無効化できません" };
    if (target.role === "OWNER") {
      const owners = await db.user.count({ where: { role: "OWNER", active: true } });
      if (owners <= 1) return { error: "最後の最高管理者は無効化できません" };
    }
  }

  await db.user.update({ where: { id }, data: { active: !target.active } });
  revalidatePath("/workers");
  return { ok: true };
}

// 完全削除（配員・日報などの記録があるユーザーは不可＝無効化を促す）
export async function deleteUser(id: string): Promise<UserFormState> {
  const me = await requireUser();
  try {
    assertCan(me, "worker.manage");
  } catch (e) {
    return forbidden(e) ?? { error: "エラーが発生しました" };
  }
  if (id === me.id) return { error: "自分自身は削除できません" };

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: "ユーザーが見つかりません" };
  if (target.role === "OWNER" && !isOwner(me)) return { error: "最高管理者を削除できるのは最高管理者のみです" };
  if (target.role === "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER" } });
    if (owners <= 1) return { error: "最後の最高管理者は削除できません" };
  }

  const [assignments, reports] = await Promise.all([
    db.assignment.count({ where: { userId: id } }),
    db.dailyReport.count({ where: { userId: id } }),
  ]);
  if (assignments > 0 || reports > 0) {
    return { error: `配員 ${assignments} 件・日報 ${reports} 件の記録があるため完全削除できません。「無効化」してください。` };
  }

  await db.user.delete({ where: { id } });
  revalidatePath("/workers");
  return { ok: true };
}
