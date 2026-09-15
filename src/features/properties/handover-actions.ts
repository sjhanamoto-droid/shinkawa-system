"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 引き継ぎ事項（Handover）。起票は全員、解決・再開も全員（現場で気づいた人が止められるように）。

export async function addHandover(propertyId: string, raw: string) {
  const user = await requireUser();
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) return { error: "内容を入力してください。" };
  if (content.length > 1000) return { error: "1000文字以内で入力してください。" };
  await db.handover.create({ data: { propertyId, content, createdById: user.id } });
  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function resolveHandover(id: string) {
  const user = await requireUser();
  const h = await db.handover.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: user.id }, select: { propertyId: true } });
  revalidatePath(`/properties/${h.propertyId}`);
  return { ok: true };
}

export async function reopenHandover(id: string) {
  await requireUser();
  const h = await db.handover.update({ where: { id }, data: { resolvedAt: null, resolvedById: null }, select: { propertyId: true } });
  revalidatePath(`/properties/${h.propertyId}`);
  return { ok: true };
}
