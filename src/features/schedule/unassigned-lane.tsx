"use client";

import { useEffect, useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Inbox, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANE_DROP_ID } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { fmtYm } from "./filters";
import type { OccurrenceView } from "./types";

// 未割当の列：日付が決まっていない工事・スポットなど（定期の回はここに出さず、予定の追加で選ぶ）。
// 忘れないように常に表示する。ここから日付列へドラッグすると日付が付き、日付列からここへ戻すこともできる。
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
        "flex flex-col rounded-2xl border bg-amber-50/40 shadow-card transition-colors",
        isOver ? "border-amber-500 bg-amber-100/60" : "border-amber-200",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={cn("flex min-h-[2.75rem] items-center gap-2 px-3 py-2 text-left", collapsible && "cursor-pointer")}
      >
        <Inbox className="h-4 w-4 text-amber-600" />
        <span className="text-base font-bold text-ink">未割当</span>
        <span className="rounded-full bg-amber-200 px-2 text-xs font-bold tnum text-amber-800">{items.length}</span>
        {collapsible && <span className="ml-auto text-sm font-semibold text-ink-muted">{open ? "閉じる" : "開く"}</span>}
      </button>
      {open && (
        <>
          {items.length > 5 && (
            <div className="mx-2 mb-1.5 flex h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-2.5 focus-within:border-brand-400">
              <Search className="h-4 w-4 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="絞り込み" className="h-full min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
            </div>
          )}
          <div className="min-h-[3rem] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {groups.length === 0 && <p className="px-1 py-2 text-sm text-ink-muted">{dnd ? "日付の決まっていない工事・スポットはありません（日付を外したい予定はここへドロップ）" : "日付の決まっていない工事・スポットはありません"}</p>}
            {groups.map(([ym, list]) => (
              <div key={ym}>
                <p className="mb-1 px-1 text-xs font-bold text-ink-muted">{fmtYm(ym)}</p>
                <div className="space-y-1.5">
                  {list.map((o) => (
                    <div key={o.id} className="flex flex-col">
                      <OccurrenceCard occurrence={o} variant="chip" draggable={dnd} onClick={onSelect} />
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
