import Link from "next/link";
import { AlertTriangle, Building, CalendarDays, ChevronDown, Clock, DoorOpen, KeyRound, MapPin, Phone, Users } from "lucide-react";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { categoryColor } from "@/lib/constants";
import { cn, mapSearchUrl } from "@/lib/utils";
import { occurrenceLabels, timeLabel } from "./labels";
import type { OccurrenceView } from "./types";

/**
 * ホームの「今日・明日行く現場」カード。現場に着くまでに要る情報（住所・キーBOX・入館・連絡先・引き継ぎ）をまとめて出す。
 * collapsed=true（明日の分）は1行の見出しだけ出し、タップで開く。
 */
export function SiteVisitCard({ o, calendarHref, collapsed = false }: { o: OccurrenceView; calendarHref: string; collapsed?: boolean }) {
  const label = occurrenceLabels(o);
  const t = timeLabel(o);
  const p = o.property;

  return (
    <details open={!collapsed} className="group card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-stretch [&::-webkit-details-marker]:hidden">
        <span className="w-1.5 shrink-0" style={{ backgroundColor: categoryColor(o.category) }} />
        <span className="min-w-0 flex-1 p-3">
          <span className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={o.category} short />
            {t && (
              <span className="flex items-center gap-0.5 text-xs font-semibold tnum text-ink-muted">
                <Clock className="h-3 w-3" />
                {t}
              </span>
            )}
            <OccurrenceStatusBadge status={o.status} />
            {p && p.openHandovers > 0 && (
              <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                引き継ぎ {p.openHandovers}
              </span>
            )}
          </span>
          <span className="mt-1 block text-[15px] font-bold leading-snug text-ink">
            {label.primary}
            {label.extra && <span className="ml-1.5 text-sm font-semibold text-ink-soft">{label.extra}</span>}
          </span>
          {(label.site || label.siteMissing) && (
            <span className={cn("flex items-center gap-1 text-sm font-semibold", label.site ? "text-ink-soft" : "text-ink-faint")}>
              <Building className="h-3.5 w-3.5 shrink-0" />
              {label.site ?? "現場未設定"}
            </span>
          )}
          {o.assignees.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {o.assignees.map((a) => a.name).join("・")}
            </span>
          )}
        </span>
        <span className="flex items-center pr-3">
          <ChevronDown className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-2 border-t border-line px-4 py-3 text-sm">
        {p ? (
          <>
            {p.address && (
              <p className="flex items-start gap-2 text-ink-soft">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="flex-1">{p.address}</span>
                <a href={mapSearchUrl(p.address)} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-brand-600">
                  地図
                </a>
              </p>
            )}
            {p.keyboxNumber && (
              <p className="flex items-center gap-2 text-ink-soft">
                <KeyRound className="h-4 w-4 shrink-0 text-ink-faint" />
                キーBOX <span className="font-bold tnum text-ink">{p.keyboxNumber}</span>
                {p.keyboxPlace && <span className="text-ink-muted">（{p.keyboxPlace}）</span>}
              </p>
            )}
            {p.accessNote && (
              <p className="flex items-start gap-2 text-ink-soft">
                <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="whitespace-pre-wrap">{p.accessNote}</span>
              </p>
            )}
            {(p.contactName || p.contactPhone) && (
              <p className="flex items-center gap-2 text-ink-soft">
                <Phone className="h-4 w-4 shrink-0 text-ink-faint" />
                {p.contactName}
                {p.contactPhone && (
                  <a href={`tel:${p.contactPhone}`} className="font-bold text-brand-600">
                    {p.contactPhone}
                  </a>
                )}
              </p>
            )}
            {!p.address && !p.keyboxNumber && !p.accessNote && !p.contactPhone && (
              <p className="text-xs text-ink-muted">住所・キーBOXなどはまだ登録されていません。</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/properties/${p.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white">
                <Building className="h-3.5 w-3.5" />
                現場を見る（図面・写真・メモ）
              </Link>
              <Link href={`${calendarHref}&open=${o.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-bold text-ink-soft">
                <CalendarDays className="h-3.5 w-3.5" />
                カレンダー
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">{label.siteMissing ? "この予定は現場が未設定です。カレンダーで予定を開くと現場を設定できます。" : "現場のない予定です。"}</p>
            <Link href={`${calendarHref}&open=${o.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong px-3 text-xs font-bold text-ink-soft">
              <CalendarDays className="h-3.5 w-3.5" />
              カレンダーで開く
            </Link>
          </div>
        )}
      </div>
    </details>
  );
}
