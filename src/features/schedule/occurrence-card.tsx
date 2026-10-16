"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Building, Clock, MapPin, KeyRound, Repeat, Car } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { catColor } from "@/lib/categories";
import { useCategories } from "@/components/category-provider";
import { cn, mapSearchUrl } from "@/lib/utils";
import { dragId, type DragData } from "./dnd";
import type { OccurrenceView } from "./types";
import { isOffOccurrence, occurrenceLabels, timeLabel } from "./labels";

export { occurrenceLabels, timeLabel };

// 状態ごとの枠線：仮＝点線、未割当＝黄、担当未定（日付あり・担当なし）＝赤、完了＝薄く、中止＝打ち消し
export function statusClass(o: OccurrenceView): string {
  if (o.status === "CANCELLED") return "opacity-50 line-through";
  if (o.status === "DONE") return "opacity-60";
  if (o.status === "UNASSIGNED") return o.date ? "border-red-300 bg-red-50/60" : "border-amber-300 bg-amber-50/60";
  if (isOffOccurrence(o)) return "border-line bg-surface"; // 休みは仮・確定の区別をしない
  if (o.status === "TENTATIVE") return "border-dashed border-amber-400 bg-surface";
  return "border-line bg-surface";
}


function AvatarStack({ people, max = 3, size = "sm" }: { people: OccurrenceView["assignees"]; max?: number; size?: "sm" | "md" }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex shrink-0 items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.avatarColor} image={p.avatarUrl} size={size} className={cn("ring-2 ring-surface", size === "sm" && "!h-5 !w-5 !text-[9px]")} />
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
  const color = catColor(useCategories(), o.category);
  const t = timeLabel(o);
  const label = occurrenceLabels(o);
  const off = isOffOccurrence(o); // 休みは名前が1行目に出るので、担当の行は出さない

  if (variant === "chip") {
    const noWorker = o.assignees.length === 0 && !!o.date && o.status !== "DONE" && o.status !== "CANCELLED" && o.category !== "OFF";
    const showAssignees = o.assignees.length > 0 && !off;
    const hasMeta = !!o.unitCount || !!o.ruleKind || noWorker || showAssignees || o.vehicles.length > 0;
    return (
      <button
        ref={setNodeRef}
        style={{ ...style, borderLeftColor: color }}
        type="button"
        onClick={() => onClick?.(o)}
        {...listeners}
        {...attributes}
        title={`${label.primary}${label.site ? ` / ${label.site}` : ""}${t ? ` ${t}` : ""}${o.assignees.length ? ` / ${o.assignees.map((a) => a.name).join("・")}` : ""}`}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-snug transition-shadow",
          statusClass(o),
          isDragging && "opacity-40",
          highlight && "ring-2 ring-brand-400",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-card",
        )}
      >
        {/* 1段目：種別・時刻・顧客名（隠さない。長ければ折り返す） */}
        <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          <CategoryBadge category={o.category} short={!off} className="px-1 py-px text-[9px]" />
          {o.startTime && <span className="shrink-0 tnum font-semibold text-ink-muted">{o.startTime}</span>}
          <span className="min-w-[4rem] flex-1 break-words font-semibold text-ink">
            {label.primary}
            {label.extra && <span className="font-normal text-ink-soft">・{label.extra}</span>}
          </span>
        </span>
        {/* 現場名（未設定なら薄く表示して、紐づけを促す） */}
        {(label.site || label.siteMissing) && (
          <span className={cn("flex min-w-0 items-center gap-0.5 text-[10px]", label.site ? "text-ink-soft" : "text-ink-faint")}>
            <Building className="h-2.5 w-2.5 shrink-0" />
            <span className="break-words">{label.site ?? "現場未設定"}</span>
          </span>
        )}
        {/* 2段目：件数・定期・車両・担当 */}
        {hasMeta && (
          <span className="flex flex-wrap items-center gap-1">
            {o.unitCount ? <span className="text-[10px] text-ink-faint">{o.unitCount}件</span> : null}
            {o.ruleKind && <Repeat className="h-3 w-3 shrink-0 text-ink-faint" aria-label="定期" />}
            {o.vehicles.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5" title={o.vehicles.map((v) => v.name).join("・")} aria-label={`車両: ${o.vehicles.map((v) => v.name).join("・")}`}>
                <Car className="h-3 w-3 text-ink-faint" />
                {o.vehicles.map((v) => (
                  <span key={v.id} className="h-2 w-2 rounded-full ring-1 ring-surface" style={{ backgroundColor: v.color }} />
                ))}
              </span>
            )}
            {noWorker && <span className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-600">担当未定</span>}
            {/* 担当：アイコン＋全員の名前（省略せず折り返す） */}
            {showAssignees && (
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <AvatarStack people={o.assignees} max={3} />
                <span className="min-w-0 break-words text-[10px] text-ink-soft">{o.assignees.map((a) => a.name).join("・")}</span>
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
        style={{ ...style, borderLeftColor: color }}
        type="button"
        onClick={() => onClick?.(o)}
        {...listeners}
        {...attributes}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-snug",
          statusClass(o),
          isDragging && "opacity-40",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          "hover:shadow-card",
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-1">
          {t && <span className="shrink-0 tnum text-[10px] font-semibold text-ink-muted">{o.startTime}</span>}
          <span className="min-w-0 flex-1 break-words font-semibold text-ink">{label.primary}</span>
        </span>
        {label.site && <span className="break-words text-[10px] text-ink-soft">{label.site}</span>}
        {o.assignees.length > 1 && !off && (
          <span className="break-words text-[10px] text-ink-muted">{o.assignees.map((a) => a.name).join("・")}</span>
        )}
      </button>
    );
  }

  // card（日ビュー）：左に種別色の縦線、件名（大）と人数、現場、担当（アイコン＋全員の名前）、下段に時刻とバッジ
  const noWorkerCard = o.assignees.length === 0 && !!o.date && o.category !== "OFF";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("card overflow-hidden", statusClass(o), isDragging && "opacity-40", highlight && "ring-2 ring-brand-400")}
    >
      <button type="button" onClick={() => onClick?.(o)} {...listeners} {...attributes} className="flex w-full gap-4 p-4 text-left transition-colors hover:bg-surface-subtle/60 md:p-5">
        <span className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-xl font-bold leading-snug text-ink">
              {label.primary}
              {label.extra && <span className="ml-1.5 text-base font-semibold text-ink-soft">{label.extra}</span>}
            </span>
            {o.headcount ? <span className="shrink-0 pt-1 text-sm tnum text-ink-muted">{o.headcount}名</span> : null}
          </span>
          {(label.site || label.siteMissing) && (
            <span className={cn("mt-1.5 flex items-start gap-1.5 text-[15px]", label.site ? "text-ink-soft" : "text-ink-faint")}>
              <Building className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{label.site ?? "現場未設定"}</span>
            </span>
          )}
          {o.property?.address && (
            <span className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              <span className="min-w-0 break-words">{o.property.address}</span>
            </span>
          )}
          {o.property?.keyboxNumber && (
            <span className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <KeyRound className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              キーBOX <span className="font-bold tnum text-ink">{o.property.keyboxNumber}</span>
              {o.property.keyboxPlace && <span>（{o.property.keyboxPlace}）</span>}
            </span>
          )}
          {off ? null : o.assignees.length > 0 ? (
            <span className="mt-3 flex min-w-0 items-center gap-3">
              <AvatarStack people={o.assignees} max={3} size="md" />
              <span className="min-w-0 break-words text-[15px] text-ink-soft">{o.assignees.map((a) => a.name).join(" ・ ")}</span>
            </span>
          ) : noWorkerCard ? (
            <span className="mt-3 inline-flex rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">担当未定</span>
          ) : null}
          <span className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5 tnum">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                {t ?? "終日"}
              </span>
              {o.unitCount ? <span>{o.unitCount}件</span> : null}
              {o.vehicles.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  <Car className="h-4 w-4 shrink-0" aria-hidden />
                  {o.vehicles.map((v, i) => (
                    <span key={v.id} className="flex items-center gap-0.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                      {v.name}
                      {i < o.vehicles.length - 1 && "・"}
                    </span>
                  ))}
                </span>
              )}
              {o.ruleKind && (
                <span className="flex items-center gap-1">
                  <Repeat className="h-4 w-4 shrink-0" aria-hidden />
                  {o.ruleSummary}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={o.category} />
              <OccurrenceStatusBadge status={o.status} />
            </span>
          </span>
        </span>
      </button>
      {o.property?.address && (
        <div className="border-t border-line px-4 py-1 text-right md:px-5">
          <a href={mapSearchUrl(o.property.address)} target="_blank" rel="noreferrer" className="inline-flex min-h-[2.75rem] items-center text-sm font-bold text-brand-600">
            地図を開く
          </a>
        </div>
      )}
    </div>
  );
}
