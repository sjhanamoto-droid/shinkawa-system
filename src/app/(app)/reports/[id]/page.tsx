import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, Car, Clock, ExternalLink, MessageSquare, Pencil, Printer, UserCheck, Wallet } from "lucide-react";
import { requireUser } from "@/lib/session";
import { canEditReport, fmtWorkHours, REPORT_STATUS_LABEL, workMinutes } from "@/lib/reports";
import { fmtYen } from "@/lib/utils";
import { jstDateTimeLabel } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { PhotoGrid } from "@/components/photo-grid";
import { SearchParamToast } from "@/components/ui/toast";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReport } from "@/features/reports/queries";
import { ReportCommentForm } from "@/features/reports/comment-form";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const r = await loadReport(id, me);
  if (!r) notFound();
  const canEdit = canEditReport(me, r);
  const minutes = workMinutes(r.startTime, r.endTime);
  const proxyBy = r.createdBy && r.createdBy.id !== r.userId ? r.createdBy.name : null;
  const expenseTotal = (r.parkingFee ?? 0) + (r.trainFare ?? 0) + r.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="日報"
        subtitle={`${fmtKeyLong(r.workDateKey)}・${r.user.name}`}
        backHref="/reports"
        right={
          <div className="flex items-center gap-1">
            <LinkButton href={`/reports/${id}/print`} variant="ghost" size="sm">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">PDF・印刷</span>
            </LinkButton>
            {canEdit && (
              <LinkButton href={`/reports/${id}/edit`} variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
                編集
              </LinkButton>
            )}
          </div>
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

          {/* 概要 */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={r.user.name} color={r.user.avatarColor} image={r.user.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{r.user.name}</p>
                {proxyBy && (
                  <p className="flex items-center gap-1 text-xs text-violet-700">
                    <UserCheck className="h-3.5 w-3.5" />
                    {proxyBy} が代理入力
                  </p>
                )}
              </div>
              <Badge tone={r.status === "SUBMITTED" ? "active" : "warn"}>{REPORT_STATUS_LABEL[r.status]}</Badge>
            </div>
            <div className="space-y-1.5 border-t border-line pt-3 text-sm text-ink-soft">
              <p className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-ink-faint" />
                {fmtKeyLong(r.workDateKey)}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-ink-faint" />
                {r.startTime}〜{r.endTime}
                <span className="text-ink-muted">（{fmtWorkHours(minutes)}）</span>
              </p>
              <p className="flex flex-wrap items-center gap-2">
                {r.occurrence && <CategoryBadge category={r.occurrence.category} short />}
                <span className="font-semibold text-ink">{r.occurrenceTitle}</span>
                {r.property && r.property.name !== r.occurrenceTitle && <span>{r.property.name}</span>}
              </p>
              {r.occurrence && r.occurrence.vehicles.length > 0 && (
                <p className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-ink-faint" />
                  {r.occurrence.vehicles.map((v) => v.vehicle.name).join("・")}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs font-bold">
                {r.property && (
                  <Link href={`/properties/${r.property.id}`} className="inline-flex items-center gap-1 text-brand-600">
                    現場を見る <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                {r.occurrence?.date && (
                  <Link href={`/schedule?view=day&d=${r.workDateKey}`} className="inline-flex items-center gap-1 text-brand-600">
                    カレンダーで見る <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
            {r.submittedAt && <p className="text-[11px] text-ink-faint">提出：{jstDateTimeLabel(r.submittedAt)}</p>}
          </Card>

          {/* 引き継ぎ */}
          <section className="space-y-2">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                引き継ぎ事項
              </span>
            </SectionTitle>
            {r.handover ? (
              <p className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-ink">{r.handover}</p>
            ) : (
              <p className="card p-3 text-sm text-ink-muted">{r.handoverNone ? "引き継ぎなし" : "未入力"}</p>
            )}
          </section>

          {/* 作業内容 */}
          <section className="space-y-2">
            <SectionTitle>作業内容</SectionTitle>
            <p className="card whitespace-pre-wrap p-4 text-sm leading-relaxed text-ink">{r.detail || <span className="text-ink-muted">未入力</span>}</p>
          </section>

          {/* 経費（本人・入力者・最高管理者・事務だけ） */}
          {r.showExpenses && (
            <section className="space-y-2">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" />
                  経費
                </span>
              </SectionTitle>
              <Card className="divide-y divide-line text-sm">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-ink-soft">駐車場代</span>
                  <span className="font-semibold tnum text-ink">{r.parkingFee == null ? "未入力" : r.parkingFee === 0 ? "なし" : fmtYen(r.parkingFee)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-ink-soft">電車賃</span>
                  <span className="font-semibold tnum text-ink">{r.trainFare == null ? "未入力" : r.trainFare === 0 ? "なし" : fmtYen(r.trainFare)}</span>
                </div>
                {r.expenses.map((e) => (
                  <div key={e.id} className="flex justify-between px-4 py-2.5">
                    <span className="text-ink-soft">{e.label}</span>
                    <span className="font-semibold tnum text-ink">{fmtYen(e.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between bg-surface-subtle px-4 py-2.5 font-bold">
                  <span>合計</span>
                  <span className="tnum">{fmtYen(expenseTotal)}</span>
                </div>
              </Card>
            </section>
          )}

          {/* 写真 */}
          {r.photos.length > 0 && (
            <section className="space-y-2">
              <SectionTitle>写真 {r.photos.length}件</SectionTitle>
              <PhotoGrid photos={r.photos} />
            </section>
          )}

          {/* コメント */}
          <section className="space-y-2">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
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
