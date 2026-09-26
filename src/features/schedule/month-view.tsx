"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { categoryColor } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { dayDropId } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { monthStartOf, monthEndExclusive, shiftKey, weekdayOfKey, WEEKDAY_JA } from "./filters";
import type { OccurrenceView } from "./types";

function DayCell({
  dateKey,
  inMonth,
  items,
  isToday,
  coarse,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  inMonth: boolean;
  items: OccurrenceView[];
  isToday: boolean;
  coarse: boolean;
  canEdit: boolean;
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(dateKey), disabled: !dnd });
  const dow = weekdayOfKey(dateKey);
  const dayNum = Number(dateKey.slice(8, 10));
  const unassigned = items.filter((o) => o.status === "UNASSIGNED").length;
  const tentative = items.filter((o) => o.status === "TENTATIVE").length;
  const noWorker = items.filter((o) => o.assignees.length === 0 && o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED").length;

  const numberEl = (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tnum",
        isToday ? "bg-brand-600 text-white" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink-soft",
        !inMonth && "opacity-40",
      )}
    >
      {dayNum}
    </span>
  );

  if (coarse) {
    // スマホ：件数＋種別色ドット＋警告。タップで日ビューへ
    const colors = Array.from(new Set(items.map((o) => categoryColor(o.category)))).slice(0, 4);
    return (
      <button
        type="button"
        onClick={() => onOpenDay(dateKey)}
        className={cn("flex aspect-square flex-col items-center gap-0.5 rounded-lg p-0.5 active:bg-surface-sunken", !inMonth && "opacity-50")}
      >
        {numberEl}
        {items.length > 0 && (
          <>
            <span className="text-[11px] font-bold tnum text-ink">{items.length}</span>
            <span className="flex gap-0.5">
              {colors.map((c) => (
                <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </span>
            {(noWorker > 0 || unassigned > 0) && <span className="h-1 w-4 rounded-full bg-red-400" />}
          </>
        )}
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex min-h-[7.5rem] flex-col rounded-lg border p-1 transition-colors",
        inMonth ? "bg-surface" : "bg-surface-subtle",
        isOver ? "border-brand-400 bg-brand-50" : "border-line",
      )}
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onOpenDay(dateKey)} className="rounded-full hover:ring-2 hover:ring-brand-200" title="この日を開く">
          {numberEl}
        </button>
        {items.length > 0 && <span className="text-[11px] tnum text-ink-faint">{items.length}件</span>}
        {noWorker > 0 && <span className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-600">担当未定{noWorker}</span>}
        {tentative > 0 && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">仮{tentative}</span>}
        {canEdit && (
          <button
            type="button"
            onClick={() => onAdd(dateKey)}
            aria-label="予定を追加"
            className="ml-auto hidden h-5 w-5 items-center justify-center rounded text-ink-faint hover:bg-surface-sunken hover:text-ink-soft group-hover:flex"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-1 flex-col gap-0.5">
        {items.map((o) => (
          <OccurrenceCard key={o.id} occurrence={o} variant="chip" draggable={dnd} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function MonthView({
  dateKey,
  byDay,
  todayKey,
  coarse,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  byDay: Map<string, OccurrenceView[]>;
  todayKey: string;
  coarse: boolean;
  canEdit: boolean;
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const start = monthStartOf(dateKey);
  const end = monthEndExclusive(dateKey);
  const gridStart = shiftKey(start, -weekdayOfKey(start));
  const cells: string[] = [];
  let cur = gridStart;
  while (cur < end || cells.length % 7 !== 0) {
    cells.push(cur);
    cur = shiftKey(cur, 1);
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-bold text-ink-faint">
        {WEEKDAY_JA.map((w, i) => (
          <div key={w} className={cn(i === 0 && "text-red-400", i === 6 && "text-blue-400")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((k) => (
          <DayCell
            key={k}
            dateKey={k}
            inMonth={k >= start && k < end}
            items={byDay.get(k) ?? []}
            isToday={k === todayKey}
            coarse={coarse}
            canEdit={canEdit}
            dnd={dnd}
            onSelect={onSelect}
            onAdd={onAdd}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
}
