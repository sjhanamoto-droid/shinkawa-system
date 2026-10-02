"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

export type CategoryActionResult = { error?: string };

const colorRe = /^#[0-9a-fA-F]{6}$/;
const fieldsSchema = z.object({
  label: z.string().trim().min(1, "名称を入力してください").max(20, "名称は20文字以内にしてください"),
  short: z.string().trim().min(1, "略称を入力してください").max(4, "略称は4文字以内にしてください（カレンダーのタグに入る長さ）"),
  color: z.string().regex(colorRe, "色が正しくありません"),
});

async function guard(): Promise<CategoryActionResult | null> {
  const me = await requireUser();
  try {
    assertCan(me, "settings.manage");
    return null;
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : "エラーが発生しました" };
  }
}

/** 種別マスタが空のとき（マイグレーション前のDBなど）は、最初からある種別を入れてから操作する */
async function ensureSeeded() {
  if ((await db.category.count()) > 0) return;
  await db.category.createMany({ data: DEFAULT_CATEGORIES.map(({ key, label, short, color, department, sortOrder }) => ({ key, label, short, color, department, sortOrder, builtin: true })), skipDuplicates: true });
}

function revalidateAll() {
  // 種別は全画面（カレンダー・現場・日報・ホーム）に出るのでレイアウトごと再検証
  revalidatePath("/", "layout");
}

async function labelTaken(label: string, exceptKey?: string): Promise<boolean> {
  const hit = await db.category.findFirst({ where: { label, ...(exceptKey ? { key: { not: exceptKey } } : {}) }, select: { key: true } });
  return !!hit;
}

export async function updateCategory(key: string, input: { label: string; short: string; color: string }): Promise<CategoryActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  await ensureSeeded();
  if (!(await db.category.findUnique({ where: { key }, select: { key: true } }))) return { error: "種別が見つかりません" };
  if (await labelTaken(parsed.data.label, key)) return { error: `「${parsed.data.label}」は別の種別で使われています` };
  await db.category.update({ where: { key }, data: parsed.data });
  revalidateAll();
  return {};
}

export async function setCategoryActive(key: string, active: boolean): Promise<CategoryActionResult> {
  const denied = await guard();
  if (denied) return denied;
  await ensureSeeded();
  // 「休み」は担当者の休みの登録に使う特別な種別なので止めない。定期清掃は現場の定期の既定なので止めない
  if (!active && (key === "OFF" || key === "REGULAR_CLEANING")) return { error: "この種別は使わない設定にできません" };
  if (!(await db.category.findUnique({ where: { key }, select: { key: true } }))) return { error: "種別が見つかりません" };
  await db.category.update({ where: { key }, data: { active } });
  revalidateAll();
  return {};
}

/** 並び順を1つ上／下へ（隣と入れ替え） */
export async function moveCategory(key: string, direction: "up" | "down"): Promise<CategoryActionResult> {
  const denied = await guard();
  if (denied) return denied;
  await ensureSeeded();
  const list = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { key: true } });
  const i = list.findIndex((c) => c.key === key);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return {};
  [list[i], list[j]] = [list[j], list[i]];
  // 10 刻みで振り直す（間に追加しやすいように）
  await db.$transaction(list.map((c, idx) => db.category.update({ where: { key: c.key }, data: { sortOrder: (idx + 1) * 10 } })));
  revalidateAll();
  return {};
}

const createSchema = fieldsSchema.extend({ department: z.enum(["CLEANING", "CONSTRUCTION", ""]) });

export async function createCategory(input: { label: string; short: string; color: string; department: string }): Promise<CategoryActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  await ensureSeeded();
  if (await labelTaken(parsed.data.label)) return { error: `「${parsed.data.label}」はもうあります` };
  const last = await db.category.aggregate({ _max: { sortOrder: true } });
  // キーは予定に保存される値。名前を変えても変わらないよう、ランダムに振る
  const key = `C_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  await db.category.create({
    data: {
      key,
      label: parsed.data.label,
      short: parsed.data.short,
      color: parsed.data.color,
      department: parsed.data.department || null,
      sortOrder: (last._max.sortOrder ?? 0) + 10,
      builtin: false,
    },
  });
  revalidateAll();
  return {};
}
