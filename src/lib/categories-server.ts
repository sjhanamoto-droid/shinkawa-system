import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { DEFAULT_CATEGORIES, toCat, type Cat } from "./categories";

/** 種別マスタ（並び順）。1リクエストにつき1回だけ読む */
export const getCategories = cache(async (): Promise<Cat[]> => {
  const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.length > 0 ? rows.map(toCat) : DEFAULT_CATEGORIES;
});

/** 保存できる種別か（存在して、使う設定のもの。今の値のままなら使わない設定でも可） */
export async function isUsableCategory(key: string, current?: string | null): Promise<boolean> {
  const c = (await getCategories()).find((x) => x.key === key);
  return !!c && (c.active || c.key === current);
}
