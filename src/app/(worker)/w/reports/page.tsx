import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { addDaysKey, jstDateKey, jstMonthKey } from "@/lib/date";
import { MISSING_LOOKBACK_DAYS } from "@/lib/reports";
import { fmtDayLabel, fmtYenShort } from "@/lib/worker";
import { loadMyRecentReports } from "@/features/reports/queries";
import { loadMonthExpenseTotal, loadMyVisits } from "@/features/worker/queries";
import { reportHref } from "@/features/worker/links";
import { WorkerTabBar } from "@/features/worker/ui/tab-bar";
import { SentStamp, StatePill } from "@/features/worker/ui/parts";

export const dynamic = "force-dynamic";

/** 日報タブ：まだの日報、今月の立替合計、提出した日報 */
export default async function WorkerReportsPage() {
  const me = await requireUser();
  const today = jstDateKey();
  const [visits, total, recent, unreadCount] = await Promise.all([
    loadMyVisits(me.id, addDaysKey(today, -MISSING_LOOKBACK_DAYS), today),
    loadMonthExpenseTotal(me.id, jstMonthKey()),
    loadMyRecentReports(me.id, 30),
    db.notification.count({ where: { userId: me.id, read: false } }),
  ]);
  // まだの日報：今日の分は作業が終わる頃から（それまではホームの「これから」）、過去の日は提出していないもの
  const due = visits.filter((v) => v.state === "due").sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  const [first, ...rest] = due;
  const sent = recent.filter((r) => r.status === "SUBMITTED");

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 text-white w-safe-top">
      <h1 className="text-[30px] font-medium leading-[42px]">{due.length > 0 ? `まだの日報が${due.length}件あります` : "まだの日報はありません"}</h1>

      {first && (
        <div className="w-ticket mt-5 text-[var(--w-text)]">
          <div className="px-[22px] pb-6 pt-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[17px] text-[var(--w-text-sub)]">{fmtDayLabel(first.dateKey)}</p>
              <StatePill state="due" />
            </div>
            <p className="mt-3 break-words text-[30px] leading-[40px]">{first.siteName}</p>
            <p className="text-[18px] text-[var(--w-text-sub)]">{first.workLabel}</p>
          </div>
          <div className="w-ticket-cut px-4 pb-4 pt-[18px]">
            <Link href={reportHref(first)} className="flex h-[72px] items-center justify-center rounded-xl bg-[var(--w-primary)] text-[21px] font-semibold text-white">
              {first.reportStatus === "DRAFT" ? "日報の続きを書く" : "日報を書く"}
            </Link>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-3 space-y-3">
          {rest.map((v) => (
            <Link key={`${v.occurrenceId}|${v.dateKey}`} href={reportHref(v)} className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[var(--w-text)]">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-[var(--w-text-muted)]">{fmtDayLabel(v.dateKey)}</p>
                <p className="truncate text-[20px]">{v.siteName}</p>
              </div>
              <StatePill state="due" />
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      <Link href="/w/statement" className="mt-5 flex items-center justify-between rounded-[18px] bg-[var(--w-tile)] px-5 py-4">
        <span>
          <span className="block text-[15px] text-[var(--w-primary-soft)]">今月の立替 合計</span>
          <span className="block text-[32px] leading-[42px]">{fmtYenShort(total)}</span>
        </span>
        <span className="text-[17px] font-semibold">精算書を見る</span>
      </Link>

      <h2 className="mt-8 text-[20px] font-medium">提出した日報</h2>
      {sent.length === 0 ? (
        <p className="mt-3 text-[16px] text-[var(--w-primary-soft)]">まだありません</p>
      ) : (
        <div className="mt-3 space-y-3">
          {sent.map((r) => (
            <Link key={r.id} href={`/w/reports/${r.id}`} className="flex min-h-[84px] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[var(--w-text)]">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-[var(--w-text-muted)]">{fmtDayLabel(r.workDateKey)}</p>
                <p className="truncate text-[20px]">{r.propertyName ?? r.title}</p>
              </div>
              <SentStamp />
            </Link>
          ))}
        </div>
      )}
      <WorkerTabBar unreadCount={unreadCount} />
    </div>
  );
}
