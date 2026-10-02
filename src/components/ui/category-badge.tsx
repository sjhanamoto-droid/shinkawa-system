"use client";

import { cn } from "@/lib/utils";
import { catOf } from "@/lib/categories";
import { useCategories } from "@/components/category-provider";

// 種別バッジ（サイボウズの色付きラベルを踏襲。名称・色は種別マスタで変えられる）
export function CategoryBadge({ category, short = false, className }: { category: string; short?: boolean; className?: string }) {
  const def = catOf(useCategories(), category);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold leading-none text-white", className)}
      style={{ backgroundColor: def?.color ?? "#64748b" }}
    >
      {def ? (short ? def.short : def.label) : category}
    </span>
  );
}
