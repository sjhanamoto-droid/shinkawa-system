import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Building, CalendarDays, Car, ChevronRight, Clock, MessageSquare, Pencil, Printer, UserCheck, Wallet } from "lucide-react";
import { requireUser } from "@/lib/session";
import { canEditReport, fmtTimeRange, fmtWorkHours, workMinutes } from "@/lib/reports";
import { cn, fmtYen } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";
import { jstDateTimeLabel } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { PhotoGrid } from "@/components/photo-grid";
import { SearchParamToast } from "@/components/ui/toast";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReport } from "@/features/reports/queries";
import { ReportCommentForm } from "@/features/reports/comment-form";
import { ReportStatusBadge } from "@/features/reports/report-items";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const r = await loadReport(id, me);
  if (!r) notFound();
  const canEdit = canEditReport(me, r);
  const minutes = workMinutes(r.startTime, r.endTime);
  const proxyBy = r.createdBy && r.createdBy.id !== r.userId ? r.createdBy.name : null;

  return (
    <div>
      <PageHeader
        title="日報"
        subtitle={`${fmtKeyLong(r.workDateKey)}・${r.user.name}`}
        backHref="/reports"
        right={
          <LinkButton href={`/reports/${id}/print`} variant="ghost" size="sm">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">PDF・印刷</span>
          </LinkButton>
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-5">
          {r.status === "DRAFT" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span className="flex-1">この日報はまだ下書きです。内容を確認して提出してください。</span>
              {canEdit && (
                <LinkButton href={`/reports/${id}/edit`} size="sm">
                  続きを書く
                </LinkButton>
              )}
            </div>
          )}

          {/* 概要カード（日付と状態 → 予定名を大きく → 時間・作業者 → 次の操作） */}
          <div className="card p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-bold tnum text-ink">{fmtKeyLong(r.workDateKey)}</p>
              <ReportStatusBadge status={r.status} className="px-3 py-1 text-sm" />
            </div>
            {r.occurrence && (
              <div className="mt-2">
                <CategoryBadge category={r.occurrence.category} short />
              </div>
            )}
            <h1
              className={cn(
                "mt-1.5 break-words font-bold leading-tight text-ink",
                r.occurrenceTitle.length > 10 ? "text-2xl" : "text-[1.875rem]",
              )}
            >
              {r.occurrenceTitle}
            </h1>
            {r.property && r.property.name !== r.occurrenceTitle && (
              <p className="mt-1 text-[15px] text-ink-soft">{r.property.name}</p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-soft">
              <Clock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="font-semibold tnum text-ink">
                {fmtTimeRange(r.startTime, r.endTime)}
              </span>
              <span>（{fmtWorkHours(minutes)}）</span>
            </p>
            {r.occurrence && r.occurrence.vehicles.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-[15px] text-ink-soft">
                <Car className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                {r.occurrence.vehicles.map((v) => v.vehicle.name).join("・")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={r.user.name} color={r.user.avatarColor} image={r.user.avatarUrl} size="sm" />
                <span className="min-w-0 truncate">{r.user.name}</span>
              </span>
              {proxyBy && (
                <span className="flex items-center gap-1 text-violet-700">
                  <UserCheck className="h-4 w-4" />
                  {proxyBy} が代理入力
                </span>
              )}
            </div>
            {r.submittedAt && <p className="mt-1.5 text-xs text-ink-faint">提出：{jstDateTimeLabel(r.submittedAt)}</p>}

            {canEdit && (
              <LinkButton href={`/reports/${id}/edit`} size="lg" className="relative mt-4 w-full">
                <Pencil className="h-5 w-5" aria-hidden />
                編集
                <ChevronRight className="absolute right-4 h-5 w-5" aria-hidden />
              </LinkButton>
            )}
            {(r.property || r.occurrence?.date) && (
              <div className={cn("grid gap-2", canEdit ? "mt-2" : "mt-4", r.property && r.occurrence?.date && "grid-cols-2")}>
                {r.property && (
                  <Link
                    href={`/properties/${r.property.id}`}
                    className={buttonClass({ variant: "outline", className: "w-full border-brand-200 text-brand-700 dark:border-brand-800" })}
                  >
                    <Building className="h-[18px] w-[18px]" aria-hidden />
                    現場を見る
                  </Link>
                )}
                {r.occurrence?.date && (
                  <Link
                    href={`/schedule?view=day&d=${r.workDateKey}`}
                    className={buttonClass({ variant: "outline", className: "w-full border-brand-200 text-brand-700 dark:border-brand-800" })}
                  >
                    <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
                    カレンダーで見る
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* 引き継ぎ */}
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-5 w-5" />
                引き継ぎ事項
              </span>
            </SectionTitle>
            {r.handover ? (
              <p className="whitespace-pre-wrap rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-ink">{r.handover}</p>
            ) : (
              <p className="card p-4 text-sm text-ink-muted">{r.handoverNone ? "引き継ぎなし" : "未入力"}</p>
            )}
          </section>

          {/* 作業内容 */}
          <section className="space-y-2.5">
            <SectionTitle>作業内容</SectionTitle>
            <p className="card whitespace-pre-wrap p-4 text-sm leading-relaxed text-ink">{r.detail || <span className="text-ink-muted">未入力</span>}</p>
          </section>

          {/* 経費（本人・入力者・最高管理者・事務だけ） */}
          {r.showExpenses && (
            <section className="space-y-2.5">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-5 w-5" />
                  経費
                </span>
              </SectionTitle>
              <Card className="divide-y divide-line overflow-hidden text-sm">
                {r.expenseLines.length === 0 && <p className="px-4 py-3 text-ink-muted">経費はありません</p>}
                {r.expenseLines.map((e) => (
                  <div key={e.key} className="flex items-center gap-3 px-4 py-3">
                    {e.receiptPhotoId ? (
                      <a href={photoSrc(e.receiptPhotoId)} target="_blank" rel="noreferrer" className="shrink-0" aria-label="領収書を開く">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoSrc(e.receiptPhotoId, true)} alt="領収書" className="h-12 w-10 rounded border border-line object-cover" />
                      </a>
                    ) : (
                      <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink-faint">なし</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{e.categoryLabel}</span>
                      {(e.paidOn || e.label || e.ocr) && (
                        <span className="block truncate text-xs text-ink-muted">
                          {e.paidOn && <span className="mr-1.5 tnum">{e.paidOn}</span>}
                          {e.label}
                          {e.ocr && <span className="ml-1 text-emerald-700">（領収書から読み取り）</span>}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tnum text-ink">{fmtYen(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between bg-surface-subtle px-4 py-3 font-bold">
                  <span>合計</span>
                  <span className="tnum">{fmtYen(r.expenseTotal)}</span>
                </div>
              </Card>
            </section>
          )}

          {/* 写真 */}
          {r.photos.length > 0 && (
            <section className="space-y-2.5">
              <SectionTitle action={<span className="text-sm font-semibold text-ink-muted tnum">{r.photos.length}件</span>}>写真</SectionTitle>
              <PhotoGrid photos={r.photos} />
            </section>
          )}

          {/* コメント */}
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-5 w-5" />
                コメント {r.comments.length > 0 && <span className="text-ink-faint">{r.comments.length}</span>}
              </span>
            </SectionTitle>
            <Card className="space-y-3 p-4">
              {r.comments.length === 0 ? (
                <p className="text-sm text-ink-muted">コメントはまだありません</p>
              ) : (
                <ul className="space-y-3">
                  {r.comments.map((c) => (
                    <li key={c.id} className="flex gap-2.5">
                      <Avatar name={c.user.name} color={c.user.avatarColor} image={c.user.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-ink-muted">
                          <span className="font-bold text-ink">{c.user.name}</span>・{jstDateTimeLabel(c.createdAt)}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <ReportCommentForm reportId={r.id} />
            </Card>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
