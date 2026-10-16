"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { catColor } from "@/lib/categories";
import { useCategories } from "@/components/category-provider";
import { cn } from "@/lib/utils";
import { dayDropId } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { holidayName } from "@/lib/holidays";
import { monthStartOf, monthEndExclusive, shiftKey, weekdayOfKey, WEEKDAY_JA } from "./filters";
import { toneText } from "./day-heading";
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
  const categories = useCategories();
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(dateKey), disabled: !dnd });
  const holiday = holidayName(dateKey);
  const dayNum = Number(dateKey.slice(8, 10));
  const unassigned = items.filter((o) => o.status === "UNASSIGNED").length;
  const noWorker = items.filter((o) => o.assignees.length === 0 && o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED").length;

  const numberEl = (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tnum md:h-7 md:w-7 md:text-sm",
        isToday ? "bg-brand-600 text-white" : toneText(dateKey, "text-ink"),
        !inMonth && "opacity-40",
      )}
    >
      {dayNum}
    </span>
  );

  if (coarse) {
    // スマホ：件数＋種別色ドット＋警告。タップで日ビューへ
    const colors = Array.from(new Set(items.map((o) => catColor(categories, o.category)))).slice(0, 4);
    return (
      <button
        type="button"
        onClick={() => onOpenDay(dateKey)}
        title={holiday ?? undefined}
        className={cn("flex aspect-square flex-col items-center gap-0.5 rounded-xl p-0.5 active:bg-surface-sunken", !inMonth && "opacity-50")}
      >
        {numberEl}
        {items.length > 0 && (
          <>
            <span className="text-xs font-bold tnum text-ink">{items.length}</span>
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
        "group flex min-h-[7.5rem] flex-col rounded-xl border p-1.5 transition-colors",
        inMonth ? "bg-surface" : "bg-surface-subtle",
        isOver ? "border-brand-400 bg-brand-50" : isToday ? "border-brand-300" : "border-line",
      )}
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onOpenDay(dateKey)} className="rounded-full hover:ring-2 hover:ring-brand-200" title="この日を開く">
          {numberEl}
        </button>
        {items.length > 0 && <span className="text-xs tnum text-ink-muted">{items.length}件</span>}
        {noWorker > 0 && <span className="rounded-md bg-red-100 px-1 text-[11px] font-bold text-red-600">担当未定{noWorker}</span>}
        {canEdit && (
          <button
            type="button"
            onClick={() => onAdd(dateKey)}
            aria-label="予定を追加"
            className="ml-auto hidden h-7 w-7 items-center justify-center rounded-full text-brand-600 hover:bg-brand-100 group-hover:flex"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* 祝日名 */}
      {holiday && <span className="truncate px-0.5 text-[11px] font-bold leading-tight text-red-500">{holiday}</span>}
      <div className="mt-1 flex flex-1 flex-col gap-1">
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
    <div className="card p-2 md:p-3">
      <div className="grid grid-cols-7 gap-1 pb-1.5 text-center text-xs font-bold text-ink-muted md:text-sm">
        {WEEKDAY_JA.map((w, i) => (
          <div key={w} className={cn(i === 0 && "text-red-500", i === 6 && "text-blue-500")}>
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
