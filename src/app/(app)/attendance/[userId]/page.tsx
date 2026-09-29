import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jstMonthKey } from "@/lib/date";
import { parseMonthKey } from "@/lib/attendance";
import { fmtWorkHours } from "@/lib/reports";
import { fmtKeyLong } from "@/features/schedule/filters";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { MonthNav } from "@/features/attendance/month-nav";
import { userMonthAttendance } from "@/features/attendance/queries";

export const dynamic = "force-dynamic";

/** 人別の日別内訳（どの予定で何時間働いたか） */
export default async function AttendanceUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const me = await requireUser();
  const { userId } = await params;
  // 他の人の稼働は最高管理者・事務だけ。本人は自分の分を見られる
  const manager = can(me, "attendance.view");
  if (!manager && userId !== me.id) notFound();
  const ym = parseMonthKey((await searchParams).ym, jstMonthKey());
  const data = await userMonthAttendance(userId, ym);
  if (!data) notFound();
  const [y, m] = ym.split("-").map(Number);

  return (
    <div>
      <PageHeader title={manager ? "稼働の内訳" : "自分の稼働時間"} subtitle={data.user.name} backHref={manager ? `/attendance?ym=${ym}` : undefined} />
      <PageContainer size="narrow">
        <div className="space-y-4">
          <MonthNav ym={ym} hrefFor={(k) => `/attendance/${userId}?ym=${k}`} />

          <Card className="flex items-center gap-3 p-4">
            <Avatar name={data.user.name} color={data.user.avatarColor} image={data.user.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{data.user.name}</p>
              <p className="text-xs text-ink-muted">
                {y}年{m}月の稼働
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-ink tnum">{fmtWorkHours(data.totalMinutes)}</p>
              <p className="text-[11px] text-ink-muted tnum">{data.days.length} 日</p>
            </div>
          </Card>

          {data.days.length === 0 ? (
            <EmptyState icon={<Clock className="h-6 w-6" />} title="この月の稼働はまだありません" description="日報が提出されると、日ごとの稼働がここに表示されます。" />
          ) : (
            <div className="space-y-3">
              {data.days.map(([key, d]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-bold text-ink">{fmtKeyLong(key)}</p>
                    <p className="text-sm font-bold text-brand-600 tnum">{fmtWorkHours(d.minutes)}</p>
                  </div>
                  <Card className="divide-y divide-line">
                    {d.rows.map((row) => (
                      <Link key={row.id} href={`/reports/${row.id}`} className="tap-row flex items-center gap-3 px-4 py-3">
                        {row.category && <CategoryBadge category={row.category} short />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">{row.title}</p>
                          <p className="text-[11px] text-ink-muted tnum">
                            {row.start}〜{row.end}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-ink tnum">{fmtWorkHours(row.minutes)}</p>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      </Link>
                    ))}
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
