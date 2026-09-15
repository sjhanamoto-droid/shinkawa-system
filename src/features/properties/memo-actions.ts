"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/permissions";

// 物件メモ（PropertyMemo）。追加は全ログインユーザー可。編集・削除は投稿者本人か管理者（OWNER/OFFICE）。

const MAX_LEN = 2000;

function normalize(raw: unknown): { content?: string; error?: string } {
  const content = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!content) return { error: "メモの内容を入力してください。" };
  if (content.length > MAX_LEN) return { error: `メモは${MAX_LEN}文字以内で入力してください。` };
  return { content };
}

export async function addPropertyMemo(propertyId: string, raw: string, atSurvey = false) {
  const user = await requireUser();
  const { content, error } = normalize(raw);
  if (error || !content) return { error };
  const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) return { error: "物件が見つかりません。" };
  await db.propertyMemo.create({ data: { propertyId, content, createdById: user.id, atSurvey } });
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function updatePropertyMemo(memoId: string, raw: string) {
  const user = await requireUser();
  const { content, error } = normalize(raw);
  if (error || !content) return { error };
  const memo = await db.propertyMemo.findUnique({ where: { id: memoId }, select: { id: true, propertyId: true, createdById: true } });
  if (!memo) return { error: "メモが見つかりません。" };
  if (memo.createdById !== user.id && !isManager(user)) return { error: "このメモを編集できるのは投稿者本人か管理者のみです。" };
  await db.propertyMemo.update({ where: { id: memoId }, data: { content } });
  revalidatePath(`/properties/${memo.propertyId}`);
  return { ok: true };
}

export async function deletePropertyMemo(memoId: string) {
  const user = await requireUser();
  const memo = await db.propertyMemo.findUnique({ where: { id: memoId }, select: { id: true, propertyId: true, createdById: true } });
  if (!memo) return { ok: true };
  if (memo.createdById !== user.id && !isManager(user)) return { error: "このメモを削除できるのは投稿者本人か管理者のみです。" };
  await db.propertyMemo.delete({ where: { id: memoId } });
  revalidatePath(`/properties/${memo.propertyId}`);
  return { ok: true };
}
