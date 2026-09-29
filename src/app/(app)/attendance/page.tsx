import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Download } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jstMonthKey } from "@/lib/date";
import { parseMonthKey } from "@/lib/attendance";
import { fmtWorkHours } from "@/lib/reports";
import { WORKER_KIND_LABEL, type WorkerKind } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { MonthNav } from "@/features/attendance/month-nav";
import { monthlyAttendance } from "@/features/attendance/queries";

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const me = await requireUser();
  const ym = parseMonthKey((await searchParams).ym, jstMonthKey());
  // 全員分は最高管理者・事務だけ。それ以外の人は自分の内訳へ
  if (!can(me, "attendance.view")) redirect(`/attendance/${me.id}?ym=${ym}`);
  const { rows, totalMinutes, totalDays } = await monthlyAttendance(ym);

  return (
    <div>
      <PageHeader
        title="稼働時間"
        subtitle="提出された日報から、月別・人別に集計（タイムカード）"
        right={
          rows.length > 0 && (
            <a href={`/attendance/export?ym=${ym}`} className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink-soft hover:bg-surface-subtle">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSVダウンロード</span>
            </a>
          )
        }
      />
      <PageContainer size="narrow">
        <div className="space-y-4">
          <MonthNav ym={ym} hrefFor={(m) => `/attendance?ym=${m}`} />

          <div className="grid grid-cols-2 gap-3">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink tnum">{fmtWorkHours(totalMinutes)}</p>
                <p className="text-xs text-ink-muted">総稼働時間</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-ink tnum">{totalDays} 日</p>
                <p className="text-xs text-ink-muted">延べ稼働日数</p>
              </div>
            </Card>
          </div>

          <section className="space-y-2.5">
            <SectionTitle>人別</SectionTitle>
            {rows.length === 0 ? (
              <EmptyState icon={<Clock className="h-6 w-6" />} title="この月の稼働はまだありません" description="日報が提出されると、ここに稼働時間が集計されます。" />
            ) : (
              <Card className="divide-y divide-line">
                {rows.map((r) => (
                  <Link key={r.userId} href={`/attendance/${r.userId}?ym=${ym}`} className="tap-row flex items-center gap-3 px-4 py-3">
                    <Avatar name={r.name} color={r.avatarColor} image={r.avatarUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{r.name}</p>
                      {r.kind !== "EMPLOYEE" && <p className="text-[11px] text-ink-muted">{WORKER_KIND_LABEL[r.kind as WorkerKind] ?? r.kind}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-ink tnum">{fmtWorkHours(r.minutes)}</p>
                      <p className="text-[11px] text-ink-muted tnum">{r.days} 日</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            稼働時間は、提出済みの日報の「作業開始〜終了」を足したものです（下書きの日報は入りません）。代理入力した日報も本人の稼働に入ります。
            同じ日に複数の日報がある場合、日数は1日として数えます。
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
