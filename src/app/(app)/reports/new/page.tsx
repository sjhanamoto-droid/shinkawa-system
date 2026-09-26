import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { jstDateKey, storedDateKey } from "@/lib/date";
import { getAppSettings } from "@/lib/settings";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { canWriteReportFor, isProxyWrite, isReportDue, occurrenceWorkDays, roundTimeToStep } from "@/lib/reports";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReportTarget } from "@/features/reports/queries";
import { ReportForm } from "@/features/reports/report-form";

export const dynamic = "force-dynamic";

function Blocked({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader title="日報を書く" backHref="/reports" />
      <PageContainer size="narrow">
        <EmptyState title={title} description={description} />
        <div className="mt-4 flex justify-center">
          <LinkButton href="/reports" variant="outline">日報へ戻る</LinkButton>
        </div>
      </PageContainer>
    </div>
  );
}

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ occurrenceId?: string; userId?: string; date?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const occurrenceId = sp.occurrenceId ?? "";
  const userId = sp.userId || me.id;
  if (!occurrenceId) redirect("/reports");

  if (!canWriteReportFor(me, userId)) {
    return <Blocked title="この日報は書けません" description="自分の日報だけを書けます。代理入力は最高管理者・事務が行います。" />;
  }
  const target = await loadReportTarget(occurrenceId, userId);
  if (!target) {
    return <Blocked title="予定が見つかりません" description="予定が削除されたか、担当から外れた可能性があります。カレンダーで確認してください。" />;
  }
  const { occurrence: o, worker } = target;
  if (!isReportDue({ date: o.dateKey, status: o.status, category: o.category })) {
    return <Blocked title="この予定に日報は不要です" description="中止になった予定や「休み」には日報はいりません。" />;
  }

  const today = jstDateKey();
  const allDays = occurrenceWorkDays(o.dateKey, o.endDateKey).filter((d) => d <= today);
  if (allDays.length === 0) {
    return <Blocked title="まだ書けません" description={`作業日（${fmtKeyLong(o.dateKey)}）になってから書けます。`} />;
  }
  // すでに日報がある作業日は選択肢から外す（その日はその日報を編集する）
  const existingRows = await db.dailyReport.findMany({
    where: { occurrenceId, userId },
    select: { id: true, workDate: true },
  });
  const existingByDay = new Map(existingRows.map((r) => [storedDateKey(r.workDate), r.id]));
  const requested = sp.date && allDays.includes(sp.date) ? sp.date : null;
  if (requested && existingByDay.has(requested)) redirect(`/reports/${existingByDay.get(requested)}/edit`);
  const workDays = allDays.filter((d) => !existingByDay.has(d));
  if (workDays.length === 0) {
    const last = existingByDay.get(allDays[allDays.length - 1]);
    redirect(last ? `/reports/${last}/edit` : "/reports");
  }
  const workDate = requested ?? (workDays.includes(today) ? today : workDays[workDays.length - 1]);

  const settings = await getAppSettings();

  return (
    <div>
      <PageHeader title="日報を書く" subtitle={fmtKeyLong(workDate)} backHref="/reports" />
      <PageContainer size="narrow">
        <ReportForm
          submitted={false}
          occurrence={{
            id: o.id,
            title: o.title,
            category: o.category,
            propertyName: o.property?.name ?? null,
            address: o.property?.address ?? null,
            startTime: o.startTime,
            endTime: o.endTime,
            note: o.note,
            vehicles: o.vehicles,
          }}
          worker={{ id: worker.id, name: worker.name }}
          proxy={isProxyWrite(me, worker.id)}
          workDays={workDays}
          initial={{
            workDate,
            startTime: roundTimeToStep(o.startTime ?? settings.defaultStartTime, "09:00"),
            endTime: roundTimeToStep(o.endTime ?? settings.defaultEndTime, "17:00"),
            detail: "",
            expenses: [],
            handoverChoice: "",
            handover: "",
          }}
          initialPhotos={[]}
          blobEnabled={isBlobConfigured()}
          ocrEnabled={isAnthropicConfigured()}
        />
      </PageContainer>
    </div>
  );
}
