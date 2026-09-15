"use client";

import { useEffect, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Inbox, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANE_DROP_ID } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { fmtYm } from "./filters";
import type { OccurrenceView } from "./types";

// 未割当レーン：日付が決まっていない実施回（定期の枠・速報メモ・LINE依頼）。
// ここから日付列へドラッグすると日付が付く。列からここへ戻すこともできる。
export function UnassignedLane({
  items,
  dnd,
  onSelect,
  className,
  collapsible = false,
}: {
  items: OccurrenceView[];
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  className?: string;
  collapsible?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: LANE_DROP_ID, disabled: !dnd });
  const [q, setQ] = useState("");
  // PC では常に開く。スマホ（collapsible）では初期状態を畳み、日付列を先に見せる
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (collapsible && window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, [collapsible]);

  const groups = useMemo(() => {
    const t = q.trim();
    const filtered = items.filter((o) => !t || o.title.includes(t) || (o.property?.name ?? "").includes(t) || (o.customer?.name ?? "").includes(t));
    const map = new Map<string, OccurrenceView[]>();
    for (const o of filtered) {
      const arr = map.get(o.targetMonth) ?? [];
      arr.push(o);
      map.set(o.targetMonth, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, q]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border bg-amber-50/40 transition-colors",
        isOver ? "border-amber-500 bg-amber-100/60" : "border-amber-200",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={cn("flex items-center gap-2 px-3 py-2 text-left", collapsible && "cursor-pointer")}
      >
        <Inbox className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-bold text-ink">未割当</span>
        <span className="rounded-full bg-amber-200 px-1.5 text-[11px] font-bold tnum text-amber-800">{items.length}</span>
        {collapsible && <span className="ml-auto text-xs text-ink-muted">{open ? "閉じる" : "開く"}</span>}
      </button>
      {open && (
        <>
          {items.length > 5 && (
            <div className="mx-2 mb-1 flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2">
              <Search className="h-3.5 w-3.5 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="絞り込み" className="h-full min-w-0 flex-1 bg-transparent text-xs focus:outline-none" />
            </div>
          )}
          <div className="min-h-[3rem] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {groups.length === 0 && <p className="px-1 py-2 text-xs text-ink-muted">{dnd ? "日付を外したい予定はここへドロップ" : "未割当の予定はありません"}</p>}
            {groups.map(([ym, list]) => (
              <div key={ym}>
                <p className="mb-1 px-1 text-[11px] font-bold text-ink-faint">{fmtYm(ym)}</p>
                <div className="space-y-1">
                  {list.map((o) => (
                    <div key={o.id} className="flex flex-col">
                      <OccurrenceCard occurrence={o} variant="chip" draggable={dnd} onClick={onSelect} />
                      {o.windowLabel && <span className="px-1 text-[10px] text-ink-faint">{o.windowLabel}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
