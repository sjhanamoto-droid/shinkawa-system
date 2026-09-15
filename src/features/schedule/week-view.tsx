"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayDropId } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { UnassignedLane } from "./unassigned-lane";
import { shiftKey, weekStartOf, weekdayOfKey, WEEKDAY_JA } from "./filters";
import type { OccurrenceView } from "./types";

function DayColumn({
  dateKey,
  items,
  isToday,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  items: OccurrenceView[];
  isToday: boolean;
  canEdit: boolean;
  dnd: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDropId(dateKey), disabled: !dnd });
  const dow = weekdayOfKey(dateKey);
  const head = items.reduce((s, o) => s + (o.assignees.length || o.headcount || 0), 0);
  const noWorker = items.filter((o) => o.assignees.length === 0 && o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED").length;

  return (
    <div
      ref={setNodeRef}
      className={cn("flex min-h-[60vh] flex-col rounded-xl border transition-colors", isOver ? "border-brand-400 bg-brand-50" : "border-line bg-surface")}
    >
      <div className={cn("flex items-center gap-1.5 rounded-t-xl border-b border-line px-2 py-1.5", isToday && "bg-brand-50")}>
        <button type="button" onClick={() => onOpenDay(dateKey)} className="flex items-baseline gap-1 rounded hover:bg-surface-sunken">
          <span className={cn("text-base font-bold tnum", dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink")}>{Number(dateKey.slice(8, 10))}</span>
          <span className={cn("text-[11px] font-bold", dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-ink-muted")}>{WEEKDAY_JA[dow]}</span>
        </button>
        <span className="text-[11px] tnum text-ink-faint">
          {items.length}件{head > 0 && ` / ${head}名`}
        </span>
        {noWorker > 0 && <span className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-600">担当未定{noWorker}</span>}
        {canEdit && (
          <button type="button" onClick={() => onAdd(dateKey)} aria-label="予定を追加" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-ink-faint hover:bg-surface-sunken hover:text-ink-soft">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        {items.map((o) => (
          <OccurrenceCard key={o.id} occurrence={o} variant="chip" draggable={dnd} onClick={onSelect} />
        ))}
        {items.length === 0 && <p className="py-4 text-center text-[11px] text-ink-faint">予定なし</p>}
      </div>
    </div>
  );
}

export function WeekView({
  dateKey,
  byDay,
  unassigned,
  todayKey,
  canEdit,
  dnd,
  onSelect,
  onAdd,
  onOpenDay,
}: {
  dateKey: string;
  byDay: Map<string, OccurrenceView[]>;
  unassigned: OccurrenceView[];
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
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[230px_repeat(7,minmax(0,1fr))]">
      {/* 未割当レーン（PC は左固定、スマホは上に折りたたみ） */}
      <UnassignedLane items={unassigned} dnd={dnd} onSelect={onSelect} className="md:sticky md:top-20 md:max-h-[calc(100vh-6rem)]" collapsible />
      {days.map((k) => (
        <DayColumn
          key={k}
          dateKey={k}
          items={byDay.get(k) ?? []}
          isToday={k === todayKey}
          canEdit={canEdit}
          dnd={dnd}
          onSelect={onSelect}
          onAdd={onAdd}
          onOpenDay={onOpenDay}
        />
      ))}
    </div>
  );
}
