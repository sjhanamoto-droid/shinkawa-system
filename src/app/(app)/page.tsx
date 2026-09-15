import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, Inbox, AlertTriangle, Clock3, Users } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canViewAmounts, isPlanner } from "@/lib/permissions";
import { dayRangeForKey, jstDateKey, jstMonthKey, addDaysKey } from "@/lib/date";
import { DEPARTMENT_LABEL } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { occurrenceSelect, loadPersonMap, toOccurrenceView } from "@/features/schedule/query";
import { OccurrenceCard } from "@/features/schedule/occurrence-card";
import { fmtKeyLong } from "@/features/schedule/filters";
import { notificationMeta } from "@/features/notifications/notification-meta";

export const dynamic = "force-dynamic";

function StatCard({ href, label, value, tone, icon }: { href: string; label: string; value: number; tone: "brand" | "amber" | "rose" | "sky"; icon: React.ReactNode }) {
  const toneClass = { brand: "text-brand-700", amber: "text-amber-700", rose: "text-red-600", sky: "text-sky-700" }[tone];
  return (
    <Link href={href} className="card flex items-center gap-3 p-3.5 transition-all hover:shadow-float">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken ${toneClass}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-ink-muted">{label}</span>
        <span className={`block text-2xl font-black tnum ${toneClass}`}>{value}</span>
      </span>
      <ChevronRight className="ml-auto h-4 w-4 text-ink-faint" />
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

  const [todayRows, tomorrowRows, people, unread, unassignedCount, tentativeCount, noWorkerCount] = await Promise.all([
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
    db.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, body: true, href: true, createdAt: true },
    }),
    planner ? db.occurrence.count({ where: { date: null, targetMonth: { lte: month }, status: "UNASSIGNED" } }) : Promise.resolve(0),
    planner ? db.occurrence.count({ where: { targetMonth: month, status: "TENTATIVE" } }) : Promise.resolve(0),
    planner
      ? db.occurrence.count({ where: { date: { gte: dayRangeForKey(today).gte }, status: { in: ["UNASSIGNED", "TENTATIVE", "CONFIRMED"] }, category: { not: "OFF" }, assignments: { none: {} } } })
      : Promise.resolve(0),
  ]);

  const todayItems = todayRows.map((r) => toOccurrenceView(r, people, showAmount));
  const tomorrowItems = tomorrowRows.map((r) => toOccurrenceView(r, people, showAmount));
  const byDept = { CLEANING: todayItems.filter((o) => o.department === "CLEANING").length, CONSTRUCTION: todayItems.filter((o) => o.department === "CONSTRUCTION").length };
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).format(new Date()));
  const greeting = hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "お疲れさまです";

  return (
    <div>
      <PageHeader title={`${greeting}、${user.name}さん`} subtitle={fmtKeyLong(today)} />
      <PageContainer>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            {planner && (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <StatCard href={`/schedule?view=day&d=${today}`} label="今日の予定" value={todayItems.length} tone="brand" icon={<CalendarDays className="h-5 w-5" />} />
                <StatCard href={`/schedule?view=week&d=${today}`} label="未割当（今月まで）" value={unassignedCount} tone="amber" icon={<Inbox className="h-5 w-5" />} />
                <StatCard href={`/schedule?view=week&d=${today}&status=TENTATIVE`} label="仮の予定（今月）" value={tentativeCount} tone="sky" icon={<Clock3 className="h-5 w-5" />} />
                <StatCard href={`/schedule?view=board&d=${today}`} label="担当未定（今日以降）" value={noWorkerCount} tone="rose" icon={<AlertTriangle className="h-5 w-5" />} />
              </div>
            )}

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <SectionTitle>
                  {planner ? "今日の予定" : "今日のあなたの予定"}{" "}
                  <span className="text-ink-faint">
                    {todayItems.length}件
                    {planner && todayItems.length > 0 && `（${DEPARTMENT_LABEL.CLEANING} ${byDept.CLEANING} ・ ${DEPARTMENT_LABEL.CONSTRUCTION} ${byDept.CONSTRUCTION}）`}
                  </span>
                </SectionTitle>
                <Link href={`/schedule?view=day&d=${today}`} className="text-xs font-bold text-brand-600">
                  カレンダーで見る
                </Link>
              </div>
              {todayItems.length === 0 ? (
                <p className="card p-5 text-center text-sm text-ink-muted">今日の予定はありません</p>
              ) : (
                <div className="space-y-2">
                  {(planner ? todayItems.slice(0, 10) : todayItems).map((o) => (
                    <Link key={o.id} href={`/schedule?view=day&d=${today}${planner ? "" : "&mine=1"}`} className="block">
                      <OccurrenceCard occurrence={o} variant="card" />
                    </Link>
                  ))}
                  {planner && todayItems.length > 10 && (
                    <Link href={`/schedule?view=day&d=${today}`} className="block py-2 text-center text-sm font-bold text-brand-600">
                      残り {todayItems.length - 10} 件を見る
                    </Link>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-2.5">
              <SectionTitle>
                明日の予定 <span className="text-ink-faint">{tomorrowItems.length}件</span>
              </SectionTitle>
              {tomorrowItems.length === 0 ? (
                <p className="card p-4 text-center text-sm text-ink-muted">明日の予定はありません</p>
              ) : (
                <div className="card divide-y divide-line">
                  {tomorrowItems.map((o) => (
                    <Link key={o.id} href={`/schedule?view=day&d=${tomorrow}${planner ? "" : "&mine=1"}`} className="block px-3 py-2 hover:bg-surface-subtle">
                      <OccurrenceCard occurrence={o} variant="chip" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Bell className="h-4 w-4" />
                    未読の通知
                  </span>
                </SectionTitle>
                <Link href="/notifications" className="text-xs font-bold text-brand-600">
                  すべて見る
                </Link>
              </div>
              {unread.length === 0 ? (
                <p className="card p-4 text-center text-xs text-ink-muted">未読の通知はありません</p>
              ) : (
                <div className="card divide-y divide-line">
                  {unread.map((n) => {
                    const meta = notificationMeta(n.type);
                    return (
                      <Link key={n.id} href={n.href ?? "/notifications"} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-surface-subtle">
                        <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-ink">{n.title}</span>
                          {n.body && <span className="block truncate text-xs text-ink-muted">{n.body}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {planner && (
              <section className="space-y-2.5">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    よく使う
                  </span>
                </SectionTitle>
                <div className="card divide-y divide-line">
                  {[
                    { href: `/schedule?view=week&d=${today}`, label: "週ビュー（未割当レーンから配置）" },
                    { href: `/schedule?view=board&d=${today}`, label: "担当者ボード（空き枠を見る）" },
                    { href: "/jobs", label: "案件（定期契約・翌月分の生成）" },
                    { href: "/properties", label: "現場（物件）一覧" },
                  ].map((l) => (
                    <Link key={l.href} href={l.href} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-subtle">
                      <span className="flex-1">{l.label}</span>
                      <ChevronRight className="h-4 w-4 text-ink-faint" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}
