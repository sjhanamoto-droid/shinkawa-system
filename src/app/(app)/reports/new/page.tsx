import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { getAppSettings } from "@/lib/settings";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { canWriteReportFor, isProxyWrite, isReportDue, occurrenceWorkDays, roundTimeToStep } from "@/lib/reports";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { fmtKeyLong } from "@/features/schedule/filters";
import { findPropertyOnlyReport, loadReportTarget } from "@/features/reports/queries";
import { ReportForm } from "@/features/reports/report-form";

export const dynamic = "force-dynamic";

function Blocked({ title, description, backHref = "/reports" }: { title: string; description: string; backHref?: string }) {
  return (
    <div>
      <PageHeader title="日報を書く" backHref={backHref} />
      <PageContainer size="narrow">
        <EmptyState title={title} description={description} />
        <div className="mt-4 flex justify-center">
          <LinkButton href={backHref} variant="outline">{backHref === "/reports" ? "日報へ戻る" : "戻る"}</LinkButton>
        </div>
      </PageContainer>
    </div>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ occurrenceId?: string; propertyId?: string; userId?: string; date?: string; late?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const occurrenceId = sp.occurrenceId ?? "";
  const userId = sp.userId || me.id;
  // late：現場詳細からの後追加（担当に入っていなくても書け、保存時に担当へ追加する）
  const late = sp.late === "1";
  if (!occurrenceId && !sp.propertyId) redirect("/reports");

  if (!canWriteReportFor(me, userId)) {
    return <Blocked title="この日報は書けません" description="自分の日報だけを書けます。代理入力は最高管理者・事務が行います。" />;
  }
  if (!occurrenceId) return <PropertyOnlyReport me={me} propertyId={sp.propertyId!} userId={userId} date={sp.date} />;

  const target = await loadReportTarget(occurrenceId, userId, { allowUnassigned: late });
  if (!target) {
    return <Blocked title="予定が見つかりません" description="予定が削除されたか、担当から外れた可能性があります。カレンダーで確認してください。" />;
  }
  const { occurrence: o, worker } = target;
  const backHref = late && o.propertyId ? lateBackHref(o.propertyId, userId, sp.date) : "/reports";
  if (!isReportDue({ date: o.dateKey, status: o.status, category: o.category })) {
    return <Blocked title="この予定に日報は不要です" description="中止になった予定や「休み」には日報はいりません。" backHref={backHref} />;
  }

  const today = jstDateKey();
  const allDays = occurrenceWorkDays(o.dateKey, o.endDateKey).filter((d) => d <= today);
  if (allDays.length === 0) {
    return <Blocked title="まだ書けません" description={`作業日（${fmtKeyLong(o.dateKey)}）になってから書けます。`} backHref={backHref} />;
  }
  // すでに日報がある作業日は選択肢から外す（その日はその日報を編集する）
  const existingRows = await db.dailyReport.findMany({
    where: { occurrenceId, userId },
    select: { id: true, workDate: true },
  });
  const existingByDay = new Map(existingRows.map((r) => [storedDateKey(r.workDate), r.id]));
  const requested = sp.date && allDays.includes(sp.date) ? sp.date : null;
  if (requested && existingByDay.has(requested)) redirect(`/reports/${existingByDay.get(requested)}/edit`);
  // 後追加は選んだ日に固定（担当外の人が、ほかの日の分まで書かないように）
  const workDays = (late && requested ? [requested] : allDays).filter((d) => !existingByDay.has(d));
  if (workDays.length === 0) {
    const last = existingByDay.get(allDays[allDays.length - 1]);
    redirect(last ? `/reports/${last}/edit` : "/reports");
  }
  const workDate = requested ?? (workDays.includes(today) ? today : workDays[workDays.length - 1]);

  const settings = await getAppSettings();

  return (
    <div>
      <PageHeader title="日報を書く" subtitle={fmtKeyLong(workDate)} backHref={backHref} />
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
          addAssignee={late && !target.assigned}
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
          aiEnabled={isAnthropicConfigured()}
        />
      </PageContainer>
    </div>
  );
}

function lateBackHref(propertyId: string, userId: string, date: string | undefined) {
  const p = new URLSearchParams({ userId, ...(date && DATE_RE.test(date) ? { date } : {}) });
  return `/properties/${propertyId}/reports/new?${p.toString()}`;
}

/** 予定に紐付かない、現場の日報（現場詳細からの後追加） */
async function PropertyOnlyReport({ me, propertyId, userId, date }: { me: CurrentUser; propertyId: string; userId: string; date: string | undefined }) {
  const backHref = lateBackHref(propertyId, userId, date);
  const today = jstDateKey();
  if (!date || !DATE_RE.test(date) || storedDateKey(dateFromKey(date)) !== date) return <Blocked title="作業日を選んでください" description="現場の画面から、作業日を選んで日報を追加してください。" backHref={backHref} />;
  if (date > today) return <Blocked title="まだ書けません" description="未来の日付では日報を作成できません。" backHref={backHref} />;
  const [property, worker] = await Promise.all([
    db.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true, address: true } }),
    db.user.findFirst({ where: { id: userId, active: true }, select: { id: true, name: true } }),
  ]);
  if (!property || !worker) return <Blocked title="現場または作業者が見つかりません" description="削除された可能性があります。" backHref={backHref} />;
  const existingId = await findPropertyOnlyReport(propertyId, userId, date);
  if (existingId) redirect(`/reports/${existingId}/edit`);
  const settings = await getAppSettings();

  return (
    <div>
      <PageHeader title="日報を書く" subtitle={fmtKeyLong(date)} backHref={backHref} />
      <PageContainer size="narrow">
        <ReportForm
          submitted={false}
          occurrence={{
            id: "",
            title: property.name,
            category: "OTHER",
            propertyName: property.name,
            address: property.address,
            startTime: null,
            endTime: null,
            note: null,
            vehicles: [],
          }}
          propertyId={property.id}
          worker={worker}
          proxy={isProxyWrite(me, worker.id)}
          workDays={[date]}
          initial={{
            workDate: date,
            startTime: roundTimeToStep(settings.defaultStartTime, "09:00"),
            endTime: roundTimeToStep(settings.defaultEndTime, "17:00"),
            detail: "",
            expenses: [],
            handoverChoice: "",
            handover: "",
          }}
          initialPhotos={[]}
          blobEnabled={isBlobConfigured()}
          aiEnabled={isAnthropicConfigured()}
        />
      </PageContainer>
    </div>
  );
}
