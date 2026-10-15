import Link from "next/link";
import { Camera, ChevronRight, MessageSquare, PenLine, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/reports";
import { fmtKeyShort } from "@/features/schedule/filters";
import type { ReportDue, ReportListItem } from "./queries";

/** 書くべき日報への導線（未作成＝新規、下書き＝続き、提出済＝閲覧） */
export function reportLinkFor(i: Pick<ReportDue, "occurrenceId" | "userId" | "workDate" | "report">): { href: string; label: string; done: boolean } {
  if (!i.report) return { href: `/reports/new?occurrenceId=${i.occurrenceId}&userId=${i.userId}&date=${i.workDate}`, label: "日報を書く", done: false };
  if (i.report.status === "DRAFT") return { href: `/reports/${i.report.id}/edit`, label: "続きを書く", done: false };
  return { href: `/reports/${i.report.id}`, label: "日報を見る", done: true };
}

/** 日報の状態ピル（提出済み＝緑 ／ 下書き＝琥珀 ／ 未提出＝赤） */
export function ReportStatusBadge({ status, className }: { status: ReportStatus | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
        !status
          ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300"
          : status === "SUBMITTED"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        className,
      )}
    >
      {status ? REPORT_STATUS_LABEL[status] : "未提出"}
    </span>
  );
}

/**
 * 書くべき日報の1件。
 * variant="row"（既定）は一覧カード（card divide-y）の中の1行、"card" は単独の白いカード（今日の日報など）。
 */
export function DueRow({
  item,
  showDate = false,
  showWorker = false,
  proxy = false,
  variant = "row",
}: {
  item: ReportDue;
  showDate?: boolean;
  showWorker?: boolean;
  proxy?: boolean;
  variant?: "row" | "card";
}) {
  const link = reportLinkFor(item);
  const label = proxy && !item.report ? "代理で書く" : link.label;

  if (variant === "card") {
    return (
      <div className="card flex flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={item.category} short />
              {showDate && <span className="text-sm font-bold tnum text-ink-soft">{fmtKeyShort(item.workDate)}</span>}
              {item.startTime && <span className="text-sm tnum text-ink-muted">{item.startTime}〜</span>}
            </div>
            <p className={cn("mt-1.5 break-words font-bold leading-tight text-ink", item.title.length > 10 ? "text-xl" : "text-2xl")}>
              {item.title}
            </p>
          </div>
          <ReportStatusBadge status={item.report?.status ?? null} className="mt-0.5" />
        </div>
        {item.propertyName && item.propertyName !== item.title && (
          <p className="mt-1 truncate text-[15px] text-ink-soft">{item.propertyName}</p>
        )}
        {showWorker && (
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
            {!item.canLogin && <UserCheck className="h-4 w-4" />}
            {item.userName}
            {!item.canLogin && "（ログインなし）"}
          </p>
        )}
        <Link
          href={link.href}
          className={buttonClass({
            variant: link.done ? "outline" : "primary",
            size: "lg",
            className: cn("relative mt-4 w-full", link.done && "border-brand-200 text-brand-700 dark:border-brand-800"),
          })}
        >
          {!link.done && <PenLine className="h-5 w-5" />}
          {label}
          <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={item.category} short />
          {showDate && <span className="text-sm font-bold tnum text-ink-soft">{fmtKeyShort(item.workDate)}</span>}
          {item.startTime && <span className="text-sm tnum text-ink-muted">{item.startTime}</span>}
          <ReportStatusBadge status={item.report?.status ?? null} />
        </div>
        <p className="mt-1 truncate text-base font-bold text-ink">
          {item.title}
          {item.propertyName && item.propertyName !== item.title && <span className="ml-1.5 text-sm font-semibold text-ink-soft">{item.propertyName}</span>}
        </p>
        {showWorker && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
            {!item.canLogin && <UserCheck className="h-3.5 w-3.5" />}
            {item.userName}
            {!item.canLogin && "（ログインなし）"}
          </p>
        )}
      </div>
      <Link
        href={link.href}
        className={buttonClass({
          size: "md",
          variant: link.done ? "outline" : "primary",
          className: cn("shrink-0 whitespace-nowrap", link.done && "border-brand-200 text-brand-700 dark:border-brand-800"),
        })}
      >
        {!link.done && <PenLine className="h-4 w-4" />}
        {label}
      </Link>
    </div>
  );
}

/** 日報一覧の1行（一覧カード card divide-y の中で使う） */
export function ReportListRow({ r, showDate = true }: { r: ReportListItem; showDate?: boolean }) {
  return (
    <Link href={`/reports/${r.id}`} className="tap-row flex items-start gap-3 px-4 py-3.5 hover:bg-surface-subtle">
      <Avatar name={r.user.name} color={r.user.avatarColor} image={r.user.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-base font-bold text-ink">{r.user.name}</span>
          <ReportStatusBadge status={r.status} />
          {r.proxyBy && (
            <span className="inline-flex items-center gap-0.5 text-xs text-violet-700">
              <UserCheck className="h-3.5 w-3.5" />
              代理：{r.proxyBy}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm">
          {r.category && <CategoryBadge category={r.category} short />}
          <span className="truncate font-semibold text-brand-600">{r.title}</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-ink-muted tnum">
          {showDate && <span className="font-medium">{fmtKeyShort(r.workDateKey)} ・ </span>}
          {r.startTime}〜{r.endTime}
        </p>
        {r.detail && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-soft">{r.detail}</p>}
        {(r.photoCount > 0 || r.commentCount > 0) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-muted">
            {r.photoCount > 0 && (
              <span className="flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" />
                {r.photoCount}
              </span>
            )}
            {r.commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {r.commentCount}
              </span>
            )}
          </div>
        )}
      </div>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  );
}
