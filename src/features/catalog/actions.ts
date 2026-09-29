"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export type CatalogFormState = { error?: string };

/** http / https のURLだけ受け付ける */
function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function saveCatalogLink(_prev: CatalogFormState, fd: FormData): Promise<CatalogFormState> {
  const me = await requireUser();
  if (!can(me, "catalog.manage")) return { error: "この操作を行う権限がありません" };
  const id = String(fd.get("id") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim().slice(0, 80);
  const groupName = String(fd.get("groupName") ?? "").trim().slice(0, 40) || "その他";
  const note = String(fd.get("note") ?? "").trim().slice(0, 200) || null;
  const sortOrder = Math.max(0, Math.min(9999, Math.round(Number(fd.get("sortOrder") ?? 0)) || 0));
  const url = normalizeUrl(String(fd.get("url") ?? ""));
  if (!title) return { error: "名前を入力してください" };
  if (!url) return { error: "リンク先のURLを正しく入力してください（http:// または https:// で始まるもの）" };

  const data = { title, groupName, note, sortOrder, url };
  if (id) {
    const r = await db.catalogLink.updateMany({ where: { id }, data });
    if (r.count === 0) return { error: "リンクが見つかりません" };
  } else {
    await db.catalogLink.create({ data });
  }
  revalidatePath("/catalog");
  redirect(`/catalog?toast=${encodeURIComponent("保存しました")}`);
}

export async function deleteCatalogLink(id: string): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!can(me, "catalog.manage")) return { error: "この操作を行う権限がありません" };
  await db.catalogLink.deleteMany({ where: { id } });
  revalidatePath("/catalog");
  redirect(`/catalog?toast=${encodeURIComponent("削除しました")}`);
}
