import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronRight, FileText, Pencil, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/permissions";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { canWriteReportFor } from "@/lib/reports";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/badge";
import { fmtKeyLong } from "@/features/schedule/filters";
import { findPropertyOnlyReport, loadPropertyOccurrencesOn } from "@/features/reports/queries";
import { LateReportPicker } from "@/features/reports/late-report-picker";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 現場詳細から日報を後から追加する：作業日・作業者を選び、その日の予定に紐付けるか（無ければ現場の日報）を選ぶ */
export default async function PropertyLateReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; userId?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const today = jstDateKey();
  const date = sp.date && DATE_RE.test(sp.date) && storedDateKey(dateFromKey(sp.date)) === sp.date && sp.date <= today ? sp.date : today;
  const manager = isManager(me);
  const requestedUser = sp.userId && canWriteReportFor(me, sp.userId) ? sp.userId : me.id;

  const [property, workers] = await Promise.all([
    db.property.findUnique({ where: { id }, select: { id: true, name: true, address: true } }),
    manager
      ? db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
      : Promise.resolve(null),
  ]);
  if (!property) notFound();
  const userId = workers && !workers.some((w) => w.id === requestedUser) ? me.id : requestedUser;
  const workerName = workers?.find((w) => w.id === userId)?.name ?? me.name;

  const [occurrences, propertyOnlyId] = await Promise.all([
    loadPropertyOccurrencesOn(id, date, userId),
    findPropertyOnlyReport(id, userId, date),
  ]);
  const q = (extra: Record<string, string>) => new URLSearchParams({ userId, date, ...extra }).toString();

  const optionClass = "flex items-center gap-3 px-4 py-3.5 hover:bg-surface-sunken";

  return (
    <div>
      <PageHeader title="日報を追加" subtitle={property.name} backHref={`/properties/${id}`} />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <p className="text-sm text-ink-muted">
            書き忘れた日報や、担当に入れ忘れていた日の日報を、あとから追加できます。普段の日報と同じ画面で、作業時間・作業内容・経費・写真を入力します。
          </p>

          <Card className="p-4">
            <LateReportPicker date={date} maxDate={today} userId={userId} workers={workers} />
          </Card>

          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-5 w-5" />
                {fmtKeyLong(date)}の予定
              </span>
            </SectionTitle>
            {occurrences.length > 0 ? (
              <p className="-mt-1 px-1 text-xs text-ink-muted">日報を紐付ける予定を選んでください。</p>
            ) : (
              <p className="-mt-1 px-1 text-xs text-ink-muted">この日のこの現場の予定はありません。現場の日報として追加します。</p>
            )}
            <Card className="divide-y divide-line overflow-hidden">
              {occurrences.map((o) =>
                o.existingReportId ? (
                  <Link key={o.id} href={`/reports/${o.existingReportId}/edit`} className={optionClass}>
                    <OccurrenceLabel o={o} />
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand-600">
                      <Pencil className="h-3.5 w-3.5" />
                      日報あり・編集
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </Link>
                ) : !o.assigned && o.ongoing ? (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-3.5 opacity-60">
                    <OccurrenceLabel o={o} />
                    <span className="shrink-0 text-xs text-ink-muted">まだ続いている予定のため、カレンダーで担当に追加してください</span>
                  </div>
                ) : (
                  <Link key={o.id} href={`/reports/new?${q({ occurrenceId: o.id, late: "1" })}`} className={optionClass}>
                    <OccurrenceLabel o={o} />
                    {!o.assigned && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                        <UserPlus className="h-3.5 w-3.5" />
                        担当に追加されます
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </Link>
                ),
              )}
              <Link
                href={propertyOnlyId ? `/reports/${propertyOnlyId}/edit` : `/reports/new?${q({ propertyId: id })}`}
                className={optionClass}
              >
                <FileText className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{occurrences.length > 0 ? "予定に紐付けない" : "現場の日報として書く"}</span>
                  <span className="block text-xs text-ink-muted">カレンダーの予定とは別に、この現場の日報として残します</span>
                </span>
                {propertyOnlyId && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand-600">
                    <Pencil className="h-3.5 w-3.5" />
                    日報あり・編集
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              </Link>
            </Card>
            {userId !== me.id && <p className="px-1 text-xs text-violet-700">{workerName} さんの分を代理入力します。</p>}
          </section>
        </div>
      </PageContainer>
    </div>
  );
}

function OccurrenceLabel({ o }: { o: { title: string; category: string; startTime: string | null; endTime: string | null; multiDay: boolean } }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <CategoryBadge category={o.category} short />
        {o.multiDay && <span className="text-xs text-ink-muted">複数日</span>}
      </span>
      <span className="mt-0.5 block truncate font-bold text-ink">{o.title}</span>
      {o.startTime && (
        <span className="block text-xs text-ink-muted tnum">
          {o.startTime}
          {o.endTime ? `〜${o.endTime}` : ""}
        </span>
      )}
    </span>
  );
}
