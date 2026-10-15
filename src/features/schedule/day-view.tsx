"use client";

import { Plus } from "lucide-react";
import { DEPARTMENT_LABEL, isDepartment } from "@/lib/constants";
import { OccurrenceCard } from "./occurrence-card";
import { UnassignedLane } from "./unassigned-lane";
import type { OccurrenceView } from "./types";

function bandOf(o: OccurrenceView): string {
  if (!o.startTime) return "終日";
  const h = Number(o.startTime.slice(0, 2));
  if (h < 9) return "早朝";
  if (h < 17) return "日中";
  return "夜間";
}
const BAND_ORDER = ["早朝", "日中", "夜間", "終日"];

export function DayView({
  dateKey,
  items,
  unassigned,
  canEdit,
  mine,
  onSelect,
  onAdd,
}: {
  dateKey: string;
  items: OccurrenceView[];
  unassigned: OccurrenceView[];
  canEdit: boolean;
  mine: boolean;
  onSelect: (o: OccurrenceView) => void;
  onAdd: (date: string) => void;
}) {
  const noWorker = items.filter((o) => o.assignees.length === 0 && o.category !== "OFF" && o.status !== "DONE" && o.status !== "CANCELLED");
  const rest = items.filter((o) => !noWorker.includes(o));

  // 部門 → 時間帯でグループ
  const groups: { key: string; label: string; items: OccurrenceView[] }[] = [];
  for (const dept of ["CLEANING", "CONSTRUCTION"] as const) {
    for (const band of BAND_ORDER) {
      const list = rest.filter((o) => o.department === dept && bandOf(o) === band);
      if (list.length) groups.push({ key: `${dept}-${band}`, label: `${DEPARTMENT_LABEL[dept]} ・ ${band}`, items: list });
    }
  }
  const others = rest.filter((o) => !isDepartment(o.department));
  if (others.length) groups.push({ key: "other", label: "その他", items: others });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-bold text-ink">
          この日の予定
          {items.length > 0 && <span className="ml-2 text-sm font-semibold tnum text-ink-muted">{items.length}件</span>}
        </h2>
        {canEdit && (
          <button
            type="button"
            onClick={() => onAdd(dateKey)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-bold text-white shadow-card active:scale-95 md:hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" /> この日に追加
          </button>
        )}
      </div>
      {!mine && noWorker.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 px-1 text-base font-bold text-red-600">
            担当未定 <span className="rounded-full bg-red-100 px-2 text-xs tnum">{noWorker.length}</span>
          </h3>
          <div className="space-y-3">
            {noWorker.map((o) => (
              <OccurrenceCard key={o.id} occurrence={o} variant="card" onClick={onSelect} />
            ))}
          </div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="px-1 text-base font-bold text-ink-soft">
            {g.label} <span className="ml-1 text-sm font-semibold tnum text-ink-muted">{g.items.length}件</span>
          </h3>
          <div className="space-y-3">
            {g.items.map((o) => (
              <OccurrenceCard key={o.id} occurrence={o} variant="card" onClick={onSelect} />
            ))}
          </div>
        </section>
      ))}
      {items.length === 0 && <p className="card p-8 text-center text-[15px] text-ink-muted">{mine ? "この日のあなたの予定はありません" : "この日の予定はありません"}</p>}
      {!mine && canEdit && unassigned.length > 0 && <UnassignedLane items={unassigned} dnd={false} onSelect={onSelect} collapsible />}
    </div>
  );
}
