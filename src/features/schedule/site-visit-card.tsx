import { AlertTriangle, ArrowRight, Building, CalendarDays, ChevronDown, Clock, DoorOpen, KeyRound, MapPin, Phone, Users } from "lucide-react";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { cn, mapSearchUrl } from "@/lib/utils";
import { occurrenceLabels, timeLabel } from "./labels";
import type { OccurrenceView } from "./types";

/**
 * ホームの「今日・明日行く現場」カード。現場に着くまでに要る情報（住所・キーBOX・入館・連絡先・引き継ぎ）をまとめて出す。
 * collapsed=true（明日の分）は1行の見出しだけ出し、タップで開く。
 */
export function SiteVisitCard({ o, color, calendarHref, collapsed = false }: { o: OccurrenceView; color: string; calendarHref: string; collapsed?: boolean }) {
  const label = occurrenceLabels(o);
  const t = timeLabel(o);
  const p = o.property;

  return (
    <details open={!collapsed} className="group card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-stretch [&::-webkit-details-marker]:hidden">
        <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 px-4 py-3.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={o.category} short />
            {t && (
              <span className="flex items-center gap-1 text-sm font-semibold tnum text-ink-muted">
                <Clock className="h-3.5 w-3.5" />
                {t}
              </span>
            )}
            <OccurrenceStatusBadge status={o.status} />
            {p && p.openHandovers > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                引き継ぎ {p.openHandovers}
              </span>
            )}
          </span>
          <span className="mt-1.5 block break-words text-lg font-bold leading-snug text-ink [text-wrap:pretty]">
            {label.primary}
            {label.extra && <span className="ml-1.5 text-[15px] font-semibold text-ink-soft">{label.extra}</span>}
          </span>
          {(label.site || label.siteMissing) && (
            <span className={cn("mt-0.5 flex items-start gap-1.5 break-words text-sm font-semibold", label.site ? "text-ink-soft" : "text-ink-faint")}>
              <Building className="mt-0.5 h-4 w-4 shrink-0" />
              {label.site ?? "現場未設定"}
            </span>
          )}
          {o.assignees.length > 0 && (
            <span className="mt-1 flex items-start gap-1.5 break-words text-sm text-ink-muted">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              {o.assignees.map((a) => a.name).join("・")}
            </span>
          )}
        </span>
        <span className="flex items-center pr-4">
          <ChevronDown className="h-5 w-5 text-ink-faint transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="space-y-2.5 border-t border-line px-4 py-4 text-[15px]">
        {p ? (
          <>
            {p.address && (
              <p className="flex items-start gap-2 text-ink-soft">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="flex-1">{p.address}</span>
                <a href={mapSearchUrl(p.address)} target="_blank" rel="noreferrer" className="-my-2 flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-brand-600">
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
              <p className="text-sm text-ink-muted">住所・キーBOXなどはまだ登録されていません。</p>
            )}
            <div className="flex flex-col gap-2 pt-1.5">
              <LinkButton href={`/properties/${p.id}`} size="lg" className="w-full">
                現場を見る（図面・写真・メモ）
                <ArrowRight className="h-5 w-5" aria-hidden />
              </LinkButton>
              <LinkButton href={`${calendarHref}&open=${o.id}`} variant="outline" className="w-full">
                <CalendarDays className="h-4 w-4" />
                カレンダーで開く
              </LinkButton>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{label.siteMissing ? "この予定は現場が未設定です。カレンダーで予定を開くと現場を設定できます。" : "現場のない予定です。"}</p>
            <LinkButton href={`${calendarHref}&open=${o.id}`} variant="outline" className="w-full">
              <CalendarDays className="h-4 w-4" />
              カレンダーで開く
            </LinkButton>
          </div>
        )}
      </div>
    </details>
  );
}
