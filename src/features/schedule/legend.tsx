"use client";

import { useCategories } from "@/components/category-provider";

export function Legend() {
  const categories = useCategories().filter((c) => c.active);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-muted">
      {categories.map((c) => (
        <span key={c.key} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
          {c.label}
        </span>
      ))}
      <span className="ml-2 flex items-center gap-1">
        <span className="h-3 w-5 rounded border border-dashed border-amber-400" />仮
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-5 rounded border border-amber-300 bg-amber-50" />未割当
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-5 rounded border border-red-300 bg-red-50" />担当未定
      </span>
    </div>
  );
}
