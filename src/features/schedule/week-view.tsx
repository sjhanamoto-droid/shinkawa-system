"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayDropId } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { holidayName } from "@/lib/holidays";
import { shiftKey, weekStartOf, weekdayOfKey, WEEKDAY_JA } from "./filters";
import { toneText } from "./day-heading";
import type { OccurrenceView } from "./types";
import type { DayStaff } from "./staffing";

function DayColumn({
  dateKey,
  items,
  staff,
  isToday,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  items: OccurrenceView[];
  staff?: DayStaff;
  isToday: boolean;
  canEdit: boolean;
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(dateKey), disabled: !dnd });
  const dow = weekdayOfKey(dateKey);
  const holiday = holidayName(dateKey);
  const noWorker = items.filter((o) => o.assignees.length === 0 && o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED").length;

  return (
    <div
      ref={setNodeRef}
      className={cn("card flex flex-col overflow-hidden transition-colors md:min-h-[60vh]", isOver && "border-brand-400 bg-brand-50")}
    >
      <div className={cn("border-b border-line py-1.5 pl-2 pr-1", isToday && "bg-brand-50 dark:bg-brand-950/30")}>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onOpenDay(dateKey)} className="flex min-h-[2.5rem] items-center gap-1.5 rounded-lg pr-1 hover:bg-surface-sunken" title="この日を開く">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold tnum",
                isToday ? "bg-brand-600 text-white" : toneText(dateKey, "text-ink"),
              )}
            >
              {Number(dateKey.slice(8, 10))}
            </span>
            <span className={cn("text-xs font-bold", toneText(dateKey, "text-ink-soft"))}>{WEEKDAY_JA[dow]}</span>
          </button>
          {staff && (
            <span className="flex min-w-0 flex-wrap gap-x-1 text-xs leading-tight tnum text-ink-muted" title="作業可能＝社員・アルバイトのうち休みでない人／残り＝そのうちまだ現場に入っていない人">
              <span className="whitespace-nowrap">作業可能{staff.available}人</span>
              <span className={cn("whitespace-nowrap font-bold", staff.remaining === 0 ? "text-red-600" : "text-brand-700")}>残り{staff.remaining}人</span>
            </span>
          )}
          {canEdit && (
            <button type="button" onClick={() => onAdd(dateKey)} aria-label="予定を追加" className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-600 active:bg-brand-100 md:h-7 md:w-7 md:hover:bg-brand-100">
              <Plus className="h-5 w-5 md:h-4 md:w-4" />
            </button>
          )}
        </div>
        {(holiday || noWorker > 0) && (
          <div className="flex flex-wrap items-center gap-1 pb-0.5">
            {holiday && <span className="text-[11px] font-bold text-red-500">{holiday}</span>}
            {noWorker > 0 && (
              <span className="inline-block whitespace-nowrap rounded-md bg-red-100 px-1.5 text-[11px] font-bold text-red-600">担当未定 {noWorker}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-1.5">
        {items.map((o) => (
          <OccurrenceCard key={o.id} occurrence={o} variant="chip" draggable={dnd} onClick={onSelect} />
        ))}
        {items.length === 0 && <p className="py-4 text-center text-sm text-ink-faint md:text-xs">予定なし</p>}
      </div>
    </div>
  );
}

export function WeekView({
  dateKey,
  byDay,
  staffByDay,
  todayKey,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  byDay: Map<string, OccurrenceView[]>;
  staffByDay?: Map<string, DayStaff>;
  todayKey: string;
  canEdit: boolean;
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const start = weekStartOf(dateKey);
  const days = Array.from({ length: 7 }, (_, i) => shiftKey(start, i));

  return (
    // 列は最小 180px を確保し、画面が狭いときは横スクロールにする（チップの現場名を隠さないため）
    <div className="md:-mx-4 md:overflow-x-auto md:px-4 md:pb-2">
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(7,minmax(180px,1fr))]">
      {days.map((k) => (
        <DayColumn
          key={k}
          dateKey={k}
          items={byDay.get(k) ?? []}
          staff={staffByDay?.get(k)}
          isToday={k === todayKey}
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
