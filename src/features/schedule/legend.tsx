import { CATEGORY, CATEGORY_OPTIONS } from "@/lib/constants";

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-ink-muted">
      {CATEGORY_OPTIONS.map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY[k].color }} />
          {CATEGORY[k].label}
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
