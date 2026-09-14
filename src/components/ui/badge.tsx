import * as React from "react";
import { cn } from "@/lib/utils";
import {
  OCCURRENCE_STATUS_LABEL,
  OCCURRENCE_STATUS_TONE,
  STATUS_TOKEN,
  CATEGORY,
  isCategory,
  isOccurrenceStatus,
} from "@/lib/constants";

type Tone = "neutral" | "brand" | "accent" | "info" | "active" | "warn" | "danger" | "survey" | "past";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-700",
  info: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  survey: "bg-violet-50 text-violet-700",
  past: "bg-slate-100 text-slate-500",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

// 実施回の状態バッジ（ドット付き）
export function OccurrenceStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = isOccurrenceStatus(status) ? OCCURRENCE_STATUS_TONE[status] : "past";
  const color = STATUS_TOKEN[tone];
  return (
    <Badge tone={tone} className={className}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {isOccurrenceStatus(status) ? OCCURRENCE_STATUS_LABEL[status] : status}
    </Badge>
  );
}

// 種別バッジ（サイボウズの色付きラベルを踏襲。色は種別固定）
export function CategoryBadge({
  category,
  short = false,
  className,
}: {
  category: string;
  short?: boolean;
  className?: string;
}) {
  const def = isCategory(category) ? CATEGORY[category] : null;
  const color = def?.color ?? "#64748b";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold leading-none text-white", className)}
      style={{ backgroundColor: color }}
    >
      {def ? (short ? def.short : def.label) : category}
    </span>
  );
}
