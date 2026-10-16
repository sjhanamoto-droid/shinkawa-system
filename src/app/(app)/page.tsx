import Link from "next/link";
import { CalendarDays, ChevronRight, Inbox, AlertTriangle, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canViewAmounts, isManager, isPlanner } from "@/lib/permissions";
import { dayRangeForKey, jstDateKey, jstMonthKey, addDaysKey } from "@/lib/date";
import { DEPARTMENT_LABEL } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { occurrenceSelect, loadPersonMap, toOccurrenceView } from "@/features/schedule/query";
import { SiteVisitCard } from "@/features/schedule/site-visit-card";
import { getCategories } from "@/lib/categories-server";
import { catColor } from "@/lib/categories";
import { WEEKDAY_JA, weekdayOfKey } from "@/features/schedule/filters";
import { toneText } from "@/features/schedule/day-heading";
import { loadMyReportTodo, loadProxyTodo } from "@/features/reports/queries";
import { DueRow } from "@/features/reports/report-items";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 見出し右の小さな導線（「カレンダーで見る ›」など） */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-my-2 flex min-h-11 shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-600">
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

/** ホームの見出し（20px）＋下のアクセントライン（左に短いブランド色、右へ薄い線）。right は見出しの右に置くリンク等 */
function SectionHeading({ title, count, right }: { title: React.ReactNode; count?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xl font-bold leading-tight text-ink">
          {title}
          {count != null && <span className="text-sm font-semibold text-ink-muted tnum">{count}</span>}
        </h2>
        {right}
      </div>
      <div className="relative mt-2.5 h-[3px]" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div className="absolute left-0 top-0 h-[3px] w-11 rounded-full bg-brand-600" />
      </div>
    </div>
  );
}

/** 予定がないときの控えめなカード */
function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="card px-4 py-6">
      <p className="text-[15px] text-ink-muted">{children}</p>
    </div>
  );
}

function StatCard({ href, label, sub, value, tone, icon }: { href: string; label: string; sub?: string; value: number; tone: "brand" | "amber" | "rose" | "sky"; icon: React.ReactNode }) {
  const toneClass = { brand: "text-brand-700", amber: "text-amber-700", rose: "text-red-600", sky: "text-sky-700" }[tone];
  return (
    <Link href={href} className="card tap-row flex min-h-[72px] flex-col gap-2 p-4 transition-all hover:border-line-strong hover:shadow-float">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-sm font-semibold leading-snug text-ink-muted">{label}</span>
          {sub && <span className="block whitespace-nowrap text-xs text-ink-faint">{sub}</span>}
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken ${toneClass}`}>{icon}</span>
      </span>
      <span className={`block text-2xl font-bold leading-tight tnum ${toneClass}`}>{value}</span>
    </Link>
  );
}

export default async function HomePage() {
  const user = await requireUser();
  const today = jstDateKey();
  const tomorrow = addDaysKey(today, 1);
  const month = jstMonthKey();
  const planner = isPlanner(user);
  const showAmount = canViewAmounts(user);
  const select = occurrenceSelect(showAmount);
  const mineWhere = planner ? {} : { assignments: { some: { userId: user.id } } };

  const [reportTodo, proxyTodo] = await Promise.all([
    loadMyReportTodo(user.id),
    isManager(user) ? loadProxyTodo() : Promise.resolve([]),
  ]);
  const [todayRows, tomorrowRows, people, unassignedCount, noWorkerCount] = await Promise.all([
    db.occurrence.findMany({
      where: { date: dayRangeForKey(today), status: { notIn: ["CANCELLED"] }, ...mineWhere },
      select,
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    }),
    db.occurrence.findMany({
      where: { date: dayRangeForKey(tomorrow), status: { notIn: ["CANCELLED"] }, ...mineWhere },
      select,
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
      take: planner ? 8 : 50,
    }),
    loadPersonMap(),
    planner ? db.occurrence.count({ where: { date: null, targetMonth: { lte: month }, status: "UNASSIGNED" } }) : Promise.resolve(0),
    planner
      ? db.occurrence.count({ where: { date: { gte: dayRangeForKey(today).gte }, status: { notIn: ["DONE", "CANCELLED"] }, category: { not: "OFF" }, assignments: { none: {} } } })
      : Promise.resolve(0),
  ]);

  const categories = await getCategories();
  const todayItems = todayRows.map((r) => toOccurrenceView(r, people, showAmount));
  const tomorrowItems = tomorrowRows.map((r) => toOccurrenceView(r, people, showAmount));
  const byDept = { CLEANING: todayItems.filter((o) => o.department === "CLEANING").length, CONSTRUCTION: todayItems.filter((o) => o.department === "CONSTRUCTION").length };
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).format(new Date()));
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";

  const todayDow = weekdayOfKey(today);
  const todayTone = toneText(today, "") || null;
  const [, todayM, todayD] = today.split("-").map(Number);

  return (
    <div>
      <PageHeader title={`${greeting}、${user.name}さん`} />
      <PageContainer size="narrow">
        <div className="space-y-6">
          {/* ── 今日の日付（タップでその日のカレンダー） ── */}
          <Link
            href={`/schedule?view=day&d=${today}${planner ? "" : "&mine=1"}`}
            className="-mb-1 flex min-h-11 w-fit items-center gap-2 pl-1 pr-2 active:opacity-70"
          >
            <CalendarDays className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <span className={cn("text-lg font-bold tnum", todayTone ?? "text-ink")}>
              {todayM}月{todayD}日
            </span>
            <span className={cn("text-sm", todayTone ?? "text-ink-muted")}>{WEEKDAY_JA[todayDow]}曜日</span>
          </Link>

          {planner && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard href={`/schedule?view=day&d=${today}`} label="今日の予定" value={todayItems.length} tone="brand" icon={<CalendarDays className="h-5 w-5" />} />
              <StatCard href={`/schedule?view=week&d=${today}`} label="未割当" sub="今月まで" value={unassignedCount} tone="amber" icon={<Inbox className="h-5 w-5" />} />
              <StatCard href={`/schedule?view=board&d=${today}`} label="担当未定" sub="今日以降" value={noWorkerCount} tone="rose" icon={<AlertTriangle className="h-5 w-5" />} />
            </div>
          )}

          {(reportTodo.today.length > 0 || reportTodo.missing.length > 0 || proxyTodo.length > 0) && (
            <section className="space-y-4">
              <SectionHeading title="今日の日報" right={<SectionLink href="/reports" label="日報へ" />} />
              {reportTodo.today.length > 0 && (
                <div className="card divide-y divide-line overflow-hidden">
                  {reportTodo.today.map((i) => (
                    <DueRow key={`${i.occurrenceId}-${i.workDate}`} item={i} />
                  ))}
                </div>
              )}
              {reportTodo.missing.length > 0 && (
                <Link href="/reports" className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 active:opacity-80 dark:border-red-900/60 dark:bg-red-950/30">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-red-600 dark:bg-red-950/60 dark:text-red-300">
                    <Inbox className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-bold text-red-700 dark:text-red-200">未提出の日報が {reportTodo.missing.length} 件あります</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-red-600 dark:text-red-300" aria-hidden />
                </Link>
              )}
              {proxyTodo.length > 0 && (
                <Link href="/reports" className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5 active:opacity-80 dark:border-violet-900/60 dark:bg-violet-950/30">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
                    <UserCheck className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-[15px] font-bold text-violet-700 dark:text-violet-200">
                    代理入力が必要な日報が {proxyTodo.length} 件あります
                    <span className="mt-0.5 block text-xs font-medium text-violet-600/90 dark:text-violet-300/80">ログインしない作業者の分</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
                </Link>
              )}
            </section>
          )}

          <section className="space-y-4">
            <SectionHeading
              title={planner ? "今日の予定" : "今日のあなたの予定"}
              count={
                <>
                  {todayItems.length}件
                  {planner && todayItems.length > 0 && `（${DEPARTMENT_LABEL.CLEANING} ${byDept.CLEANING} ・ ${DEPARTMENT_LABEL.CONSTRUCTION} ${byDept.CONSTRUCTION}）`}
                </>
              }
              right={<SectionLink href={`/schedule?view=day&d=${today}`} label="カレンダーで見る" />}
            />
            {todayItems.length === 0 ? (
              <EmptyCard>今日の予定はありません</EmptyCard>
            ) : (
              <div className="space-y-3">
                {(planner ? todayItems.slice(0, 10) : todayItems).map((o) => (
                  <SiteVisitCard key={o.id} o={o} color={catColor(categories, o.category)} calendarHref={`/schedule?view=day&d=${today}${planner ? "" : "&mine=1"}`} />
                ))}
                {planner && todayItems.length > 10 && (
                  <Link href={`/schedule?view=day&d=${today}`} className="flex min-h-11 items-center justify-center gap-0.5 text-sm font-semibold text-brand-600">
                    残り {todayItems.length - 10} 件を見る
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHeading
              title="明日の予定"
              count={`${tomorrowItems.length}件`}
            />
            {tomorrowItems.length === 0 ? (
              <EmptyCard>明日の予定はありません</EmptyCard>
            ) : (
              <>
                <p className="-mt-1 px-1 text-sm text-ink-muted">タップすると現場情報を開きます</p>
                <div className="space-y-3">
                  {tomorrowItems.map((o) => (
                    <SiteVisitCard key={o.id} o={o} color={catColor(categories, o.category)} collapsed calendarHref={`/schedule?view=day&d=${tomorrow}${planner ? "" : "&mine=1"}`} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
