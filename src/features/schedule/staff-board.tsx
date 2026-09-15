"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Avatar } from "@/components/ui/avatar";
import { WORKER_KIND_LABEL, WORKER_KIND_OPTIONS, type WorkerKind } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { cellDropId } from "./dnd";
import { OccurrenceCard } from "./occurrence-card";
import { shiftKey, weekStartOf, weekdayOfKey, WEEKDAY_JA } from "./filters";
import type { OccurrenceView, WorkerOption } from "./types";

function Cell({
  workerId,
  dateKey,
  items,
  dnd,
  isToday,
  onSelect,
}: {
  workerId: string | null;
  dateKey: string;
  items: OccurrenceView[];
  dnd: boolean;
  isToday: boolean;
  onSelect: (o: OccurrenceView) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellDropId(workerId, dateKey), disabled: !dnd });
  return (
    <td ref={setNodeRef} className={cn("min-w-[120px] border-b border-l border-line p-1 align-top transition-colors", isOver ? "bg-brand-50" : isToday ? "bg-brand-50/30" : workerId === null ? "bg-red-50/40" : "")}>
      <div className="flex flex-col gap-1">
        {items.map((o) => (
          <OccurrenceCard key={o.id} occurrence={o} variant="board" draggable={dnd} fromWorkerId={workerId} onClick={onSelect} />
        ))}
      </div>
    </td>
  );
}

export function StaffBoard({
  dateKey,
  items,
  workers,
  todayKey,
  dnd,
  dept,
  onSelect,
}: {
  dateKey: string;
  items: OccurrenceView[];
  workers: WorkerOption[];
  todayKey: string;
  dnd: boolean;
  dept: "ALL" | "CLEANING" | "CONSTRUCTION";
  onSelect: (o: OccurrenceView) => void;
}) {
  const start = weekStartOf(dateKey);
  const days = Array.from({ length: 7 }, (_, i) => shiftKey(start, i));
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("");

  const rows = useMemo(() => {
    const t = q.trim();
    return workers
      .filter((w) => dept === "ALL" || !w.department || w.department === dept)
      .filter((w) => !kindFilter || w.kind === kindFilter)
      .filter((w) => !t || w.name.includes(t) || w.tags.some((x) => x.includes(t)) || (w.partnerName ?? "").includes(t));
  }, [workers, dept, kindFilter, q]);

  // worker × day → items
  const cell = new Map<string, OccurrenceView[]>();
  const unassignedByDay = new Map<string, OccurrenceView[]>();
  for (const o of items) {
    if (!o.date) continue;
    const dayKeys: string[] = [];
    if (o.endDate && o.endDate > o.date) {
      let k = o.date;
      while (k <= o.endDate) {
        if (k >= start && k < shiftKey(start, 7)) dayKeys.push(k);
        k = shiftKey(k, 1);
      }
    } else dayKeys.push(o.date);
    for (const k of dayKeys) {
      if (o.assignees.length === 0) {
        if (o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED") {
          const arr = unassignedByDay.get(k) ?? [];
          arr.push(o);
          unassignedByDay.set(k, arr);
        }
        continue;
      }
      for (const a of o.assignees) {
        const key = `${a.id}:${k}`;
        const arr = cell.get(key) ?? [];
        arr.push(o);
        cell.set(key, arr);
      }
    }
  }

  const groups = WORKER_KIND_OPTIONS.map((k) => ({ kind: k, rows: rows.filter((w) => w.kind === k) })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="作業者を絞り込み（名前・タグ・会社）" className="h-9 min-w-[200px] rounded-lg border border-line-strong bg-surface px-3 text-xs" />
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-xs font-semibold text-ink-soft">
          <option value="">区分：すべて</option>
          {WORKER_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {WORKER_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">{rows.length}名</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="w-44 border-b border-line p-2 text-left text-[11px] font-bold text-ink-faint">作業者</th>
              {days.map((k) => {
                const dow = weekdayOfKey(k);
                const count = items.filter((o) => o.date === k).length;
                return (
                  <th key={k} className={cn("border-b border-l border-line p-2 text-left", k === todayKey && "bg-brand-50")}>
                    <span className={cn("text-sm font-bold tnum", dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-ink")}>{Number(k.slice(8, 10))}</span>
                    <span className="ml-1 text-[11px] font-bold text-ink-muted">{WEEKDAY_JA[dow]}</span>
                    <span className="ml-1 text-[10px] tnum text-ink-faint">{count}件</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border-b border-line bg-red-50/60 p-2 text-left text-xs font-bold text-red-600">担当未定</th>
              {days.map((k) => (
                <Cell key={k} workerId={null} dateKey={k} items={unassignedByDay.get(k) ?? []} dnd={dnd} isToday={k === todayKey} onSelect={onSelect} />
              ))}
            </tr>
            {groups.map((g) => (
              <>
                <tr key={`h-${g.kind}`}>
                  <td colSpan={8} className="border-b border-line bg-surface-subtle px-2 py-1 text-[11px] font-bold text-ink-faint">
                    {WORKER_KIND_LABEL[g.kind as WorkerKind]}
                  </td>
                </tr>
                {g.rows.map((w) => {
                  const total = days.reduce((s, k) => s + (cell.get(`${w.id}:${k}`)?.length ?? 0), 0);
                  return (
                    <tr key={w.id} className="hover:bg-surface-subtle/50">
                      <th className="border-b border-line p-2 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <Avatar name={w.name} color={w.avatarColor} image={w.avatarUrl} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-ink">{w.name}</span>
                            <span className="block truncate text-[10px] text-ink-faint">
                              {w.partnerName ?? w.tags.slice(0, 2).join("・")}
                              {total > 0 && ` ・ 週${total}件`}
                            </span>
                          </span>
                        </span>
                      </th>
                      {days.map((k) => (
                        <Cell key={k} workerId={w.id} dateKey={k} items={cell.get(`${w.id}:${k}`) ?? []} dnd={dnd} isToday={k === todayKey} onSelect={onSelect} />
                      ))}
                    </tr>
                  );
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
