import { ClipboardList, History, Inbox, List, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/permissions";
import { canViewAllReports, MISSING_LOOKBACK_DAYS } from "@/lib/reports";
import { jstDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadMyRecentReports, loadMyReportTodo, loadProxyTodo } from "@/features/reports/queries";
import { DueRow, ReportListRow } from "@/features/reports/report-items";

export const dynamic = "force-dynamic";

// 日報の入口。自分の今日の日報・未提出・最近の日報と、事務の代理入力待ちを並べる。
export default async function ReportsPage() {
  const me = await requireUser();
  const manager = isManager(me);
  const [todo, recent, proxy] = await Promise.all([
    loadMyReportTodo(me.id),
    loadMyRecentReports(me.id, 10),
    manager ? loadProxyTodo() : Promise.resolve([]),
  ]);
  const today = jstDateKey();

  return (
    <div>
      <PageHeader
        title="日報"
        right={
          canViewAllReports(me) ? (
            <LinkButton href="/reports/all" variant="outline" size="sm">
              <List className="h-4 w-4" />
              すべての日報
            </LinkButton>
          ) : undefined
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-6">
          <section className="space-y-2.5">
            <SectionTitle action={<span className="text-sm font-semibold text-ink-muted tnum">{fmtKeyLong(today)}</span>}>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-5 w-5" />
                今日の日報
              </span>
            </SectionTitle>
            {todo.today.length === 0 ? (
              <p className="card p-5 text-center text-sm text-ink-muted">今日あなたが担当の予定はありません</p>
            ) : (
              <div className="space-y-2.5">
                {todo.today.map((i) => (
                  <DueRow key={`${i.occurrenceId}-${i.workDate}`} item={i} variant="card" />
                ))}
              </div>
            )}
          </section>

          {todo.missing.length > 0 && (
            <section className="space-y-2.5">
              <SectionTitle action={<span className="text-sm font-semibold text-red-600 tnum">{todo.missing.length}件</span>}>
                <span className="flex items-center gap-1.5 text-red-600">
                  <Inbox className="h-5 w-5" />
                  未提出の日報
                </span>
              </SectionTitle>
              <p className="px-1 text-sm text-ink-muted">過去{MISSING_LOOKBACK_DAYS}日で、まだ提出していない日報です。</p>
              <Card className="divide-y divide-line overflow-hidden">
                {todo.missing.map((i) => (
                  <DueRow key={`${i.occurrenceId}-${i.workDate}`} item={i} showDate />
                ))}
              </Card>
            </section>
          )}

          {manager && (
            <section className="space-y-2.5">
              <SectionTitle action={<span className="text-sm font-semibold text-ink-muted tnum">{proxy.length}件</span>}>
                <span className="flex items-center gap-1.5">
                  <UserCheck className="h-5 w-5" />
                  代理入力が必要な日報
                </span>
              </SectionTitle>
              <p className="px-1 text-sm text-ink-muted">ログインしない作業者（協力会社・下請など）の、今日まで{MISSING_LOOKBACK_DAYS}日分の未提出です。</p>
              {proxy.length === 0 ? (
                <p className="card p-4 text-center text-sm text-ink-muted">代理入力が必要な日報はありません</p>
              ) : (
                <Card className="divide-y divide-line overflow-hidden">
                  {proxy.map((i) => (
                    <DueRow key={`${i.occurrenceId}-${i.userId}-${i.workDate}`} item={i} showDate showWorker proxy />
                  ))}
                </Card>
              )}
            </section>
          )}

          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <History className="h-5 w-5" />
                最近の日報
              </span>
            </SectionTitle>
            {recent.length === 0 ? (
              <p className="card p-4 text-center text-sm text-ink-muted">まだ日報はありません</p>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {recent.map((r) => (
                  <ReportListRow key={r.id} r={r} />
                ))}
              </Card>
            )}
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
