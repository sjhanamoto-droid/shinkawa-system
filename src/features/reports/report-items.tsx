import Link from "next/link";
import { Camera, ChevronRight, MessageSquare, PenLine, UserCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/reports";
import { fmtKeyShort } from "@/features/schedule/filters";
import type { ReportDue, ReportListItem } from "./queries";

/** 書くべき日報への導線（未作成＝新規、下書き＝続き、提出済＝閲覧） */
export function reportLinkFor(i: Pick<ReportDue, "occurrenceId" | "userId" | "workDate" | "report">): { href: string; label: string; done: boolean } {
  if (!i.report) return { href: `/reports/new?occurrenceId=${i.occurrenceId}&userId=${i.userId}&date=${i.workDate}`, label: "日報を書く", done: false };
  if (i.report.status === "DRAFT") return { href: `/reports/${i.report.id}/edit`, label: "続きを書く", done: false };
  return { href: `/reports/${i.report.id}`, label: "日報を見る", done: true };
}

export function ReportStatusBadge({ status }: { status: ReportStatus | null }) {
  if (!status) return <Badge tone="danger">未提出</Badge>;
  return <Badge tone={status === "SUBMITTED" ? "active" : "warn"}>{REPORT_STATUS_LABEL[status]}</Badge>;
}

/** 書くべき日報の1行 */
export function DueRow({ item, showDate = false, showWorker = false, proxy = false }: { item: ReportDue; showDate?: boolean; showWorker?: boolean; proxy?: boolean }) {
  const link = reportLinkFor(item);
  const label = proxy && !item.report ? "代理で書く" : link.label;
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={item.category} short />
          {showDate && <span className="text-xs font-bold tnum text-ink-soft">{fmtKeyShort(item.workDate)}</span>}
          {item.startTime && <span className="text-xs tnum text-ink-muted">{item.startTime}</span>}
          <ReportStatusBadge status={item.report?.status ?? null} />
        </div>
        <p className="mt-0.5 truncate text-sm font-bold text-ink">
          {item.title}
          {item.propertyName && item.propertyName !== item.title && <span className="ml-1 font-semibold text-ink-soft">{item.propertyName}</span>}
        </p>
        {showWorker && (
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            {!item.canLogin && <UserCheck className="h-3 w-3" />}
            {item.userName}
            {!item.canLogin && "（ログインなし）"}
          </p>
        )}
      </div>
      <Link
        href={link.href}
        className={buttonClass({ size: "sm", variant: link.done ? "outline" : "primary", className: "shrink-0 whitespace-nowrap" })}
      >
        {!link.done && <PenLine className="h-4 w-4" />}
        {label}
      </Link>
    </div>
  );
}

/** 日報一覧のカード */
export function ReportListRow({ r, showDate = true }: { r: ReportListItem; showDate?: boolean }) {
  return (
    <Link href={`/reports/${r.id}`} className="flex items-start gap-3 px-3.5 py-3 hover:bg-surface-subtle">
      <Avatar name={r.user.name} color={r.user.avatarColor} image={r.user.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold text-ink">{r.user.name}</span>
          <ReportStatusBadge status={r.status} />
          {r.proxyBy && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-violet-700">
              <UserCheck className="h-3 w-3" />
              代理：{r.proxyBy}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          {showDate && <span className="font-bold tnum text-ink-soft">{fmtKeyShort(r.workDateKey)}</span>}
          {r.category && <CategoryBadge category={r.category} short />}
          <span className="font-semibold text-ink-soft">{r.title}</span>
          <span className="tnum">
            {r.startTime}〜{r.endTime}
          </span>
        </p>
        {r.detail && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{r.detail}</p>}
        {(r.photoCount > 0 || r.commentCount > 0) && (
          <p className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
            {r.photoCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Camera className="h-3 w-3" />
                {r.photoCount}
              </span>
            )}
            {r.commentCount > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {r.commentCount}
              </span>
            )}
          </p>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />
    </Link>
  );
}
