"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock, MapPin, KeyRound, Users, Repeat, Car } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { categoryColor } from "@/lib/constants";
import { cn, mapSearchUrl } from "@/lib/utils";
import { dragId, type DragData } from "./dnd";
import type { OccurrenceView } from "./types";

// 状態ごとの枠線：仮＝点線、未割当＝黄、担当未定（日付あり・担当なし）＝赤、完了＝薄く、中止＝打ち消し
export function statusClass(o: OccurrenceView): string {
  if (o.status === "CANCELLED") return "opacity-50 line-through";
  if (o.status === "DONE") return "opacity-60";
  if (o.status === "UNASSIGNED") return o.date ? "border-red-300 bg-red-50/60" : "border-amber-300 bg-amber-50/60";
  if (o.status === "TENTATIVE") return "border-dashed border-amber-400 bg-surface";
  return "border-line bg-surface";
}

export function timeLabel(o: OccurrenceView): string | null {
  if (!o.startTime) return null;
  return o.endTime ? `${o.startTime}–${o.endTime}` : o.startTime;
}

function AvatarStack({ people, max = 3, size = "sm" }: { people: OccurrenceView["assignees"]; max?: number; size?: "sm" | "md" }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex shrink-0 items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.avatarColor} image={p.avatarUrl} size={size} className={cn("ring-2 ring-white", size === "sm" && "!h-5 !w-5 !text-[9px]")} />
      ))}
      {rest > 0 && <span className="ml-1 text-[10px] font-bold text-ink-muted">+{rest}</span>}
    </span>
  );
}

export type CardVariant = "chip" | "card" | "board";

export function OccurrenceCard({
  occurrence: o,
  variant = "chip",
  draggable = false,
  fromWorkerId = null,
  onClick,
  highlight = false,
}: {
  occurrence: OccurrenceView;
  variant?: CardVariant;
  draggable?: boolean;
  fromWorkerId?: string | null;
  onClick?: (o: OccurrenceView) => void;
  highlight?: boolean;
}) {
  const data: DragData = { occurrence: o, fromWorkerId };
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId(o.id) + (fromWorkerId ? `@${fromWorkerId}` : ""),
    data,
    disabled: !draggable || o.status === "DONE" || o.status === "CANCELLED",
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const color = categoryColor(o.category);
  const t = timeLabel(o);

  if (variant === "chip") {
    const noWorker = o.assignees.length === 0 && !!o.date && o.status !== "DONE" && o.status !== "CANCELLED" && o.category !== "OFF";
    const hasMeta = !!o.unitCount || !!o.ruleKind || noWorker || o.assignees.length > 0 || o.vehicles.length > 0;
    return (
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        onClick={() => onClick?.(o)}
        {...listeners}
        {...attributes}
        title={`${o.title}${t ? ` ${t}` : ""}${o.assignees.length ? ` / ${o.assignees.map((a) => a.name).join("・")}` : ""}`}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow",
          statusClass(o),
          isDragging && "opacity-40",
          highlight && "ring-2 ring-brand-400",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-card",
        )}
      >
        {/* 1段目：種別・時刻・現場名（隠さない。長ければ折り返す） */}
        <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          <CategoryBadge category={o.category} short className="px-1 py-px text-[9px]" />
          {o.startTime && <span className="shrink-0 tnum font-semibold text-ink-muted">{o.startTime}</span>}
          <span className="min-w-[4rem] flex-1 break-words font-semibold text-ink">{o.title}</span>
        </span>
        {/* 2段目：件数・定期・担当 */}
        {hasMeta && (
          <span className="flex items-center gap-1">
            {o.unitCount ? <span className="text-[10px] text-ink-faint">{o.unitCount}件</span> : null}
            {o.ruleKind && <Repeat className="h-3 w-3 shrink-0 text-ink-faint" aria-label="定期" />}
            {o.vehicles.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5" title={o.vehicles.map((v) => v.name).join("・")} aria-label={`車両: ${o.vehicles.map((v) => v.name).join("・")}`}>
                <Car className="h-3 w-3 text-ink-faint" />
                {o.vehicles.map((v) => (
                  <span key={v.id} className="h-2 w-2 rounded-full ring-1 ring-white" style={{ backgroundColor: v.color }} />
                ))}
              </span>
            )}
            {noWorker && <span className="rounded bg-red-100 px-1 text-[9px] font-bold text-red-600">担当未定</span>}
            {o.assignees.length > 0 && (
              <span className="ml-auto flex min-w-0 items-center gap-1">
                <AvatarStack people={o.assignees} max={4} />
                <span className="hidden truncate text-[10px] text-ink-muted xl:inline">{o.assignees.map((a) => a.name).join("・")}</span>
              </span>
            )}
          </span>
        )}
      </button>
    );
  }

  if (variant === "board") {
    return (
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        onClick={() => onClick?.(o)}
        {...listeners}
        {...attributes}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight",
          statusClass(o),
          isDragging && "opacity-40",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-card",
        )}
      >
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          {t && <span className="tnum text-[10px] text-ink-muted">{o.startTime}</span>}
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">{o.title}</span>
        </span>
        {o.assignees.length > 1 && (
          <span className="truncate text-[10px] text-ink-muted">{o.assignees.map((a) => a.name).join("・")}</span>
        )}
      </button>
    );
  }

  // card（日ビュー・ホーム）
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("card overflow-hidden border", statusClass(o), isDragging && "opacity-40", highlight && "ring-2 ring-brand-400")}
    >
      <button type="button" onClick={() => onClick?.(o)} {...listeners} {...attributes} className="flex w-full items-stretch text-left">
        <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 p-3">
          <span className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={o.category} />
            <OccurrenceStatusBadge status={o.status} />
            {o.ruleKind && (
              <span className="flex items-center gap-0.5 text-[11px] text-ink-faint">
                <Repeat className="h-3 w-3" />
                {o.ruleSummary}
              </span>
            )}
          </span>
          <span className="mt-1 block text-[15px] font-bold text-ink">
            {o.title}
            {o.property && o.property.name !== o.title && <span className="ml-1.5 text-sm font-semibold text-ink-soft">{o.property.name}</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {t && (
              <span className="flex items-center gap-1 tnum">
                <Clock className="h-3.5 w-3.5" />
                {t}
              </span>
            )}
            {o.unitCount ? <span>{o.unitCount}件</span> : null}
            {o.headcount ? (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {o.headcount}名
              </span>
            ) : null}
            {o.vehicles.length > 0 && (
              <span className="flex items-center gap-1">
                <Car className="h-3.5 w-3.5" />
                {o.vehicles.map((v, i) => (
                  <span key={v.id} className="flex items-center gap-0.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                    {v.name}
                    {i < o.vehicles.length - 1 && "・"}
                  </span>
                ))}
              </span>
            )}
          </span>
          {o.property?.address && (
            <span className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="truncate">{o.property.address}</span>
            </span>
          )}
          {o.property?.keyboxNumber && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              キーBOX {o.property.keyboxNumber}
              {o.property.keyboxPlace && <span className="text-ink-muted">（{o.property.keyboxPlace}）</span>}
            </span>
          )}
          <span className="mt-2 flex items-center gap-2">
            <AvatarStack people={o.assignees} max={5} size="md" />
            <span className="truncate text-xs text-ink-soft">{o.assignees.map((a) => a.name).join("・")}</span>
            {o.assignees.length === 0 && o.date && o.category !== "OFF" && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-600">担当未定</span>
            )}
          </span>
        </span>
      </button>
      {o.property?.address && (
        <div className="border-t border-line px-3 py-1.5 text-right">
          <a href={mapSearchUrl(o.property.address)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600">
            地図を開く
          </a>
        </div>
      )}
    </div>
  );
}
