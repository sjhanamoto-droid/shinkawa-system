"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/permissions";
import { restoreTrashed } from "@/lib/trash";

/** 削除済みの写真・図面・領収書を元に戻す（最高管理者・事務のみ） */
export async function restoreMedia(id: string): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!isManager(me)) return { error: "元に戻す権限がありません" };
  const r = await db.$transaction((tx) => restoreTrashed(tx, id));
  if (r.error) return r;
  revalidatePath("/settings/trash");
  revalidatePath("/properties", "layout");
  revalidatePath("/reports", "layout");
  revalidatePath("/claims", "layout");
  revalidatePath("/w", "layout");
  return {};
}
