import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isBlobConfigured } from "@/lib/media";
import { canEditReport, isProxyWrite } from "@/lib/reports";
import { isPhotoKind } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReport } from "@/features/reports/queries";
import { ReportForm } from "@/features/reports/report-form";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function choiceOf(fee: number | null): "" | "yes" | "no" {
  return fee == null ? "" : fee > 0 ? "yes" : "no";
}

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const r = await loadReport(id, me);
  if (!r) notFound();
  if (!canEditReport(me, r)) redirect(`/reports/${id}`);

  const property = r.propertyId
    ? await db.property.findUnique({ where: { id: r.propertyId }, select: { name: true, address: true } })
    : null;
  const occ = r.occurrence
    ? await db.occurrence.findUnique({ where: { id: r.occurrence.id }, select: { startTime: true, endTime: true, note: true } })
    : null;

  return (
    <div>
      <PageHeader title="日報を編集" subtitle={fmtKeyLong(r.workDateKey)} backHref={`/reports/${id}`} />
      <PageContainer size="narrow">
        <ReportForm
          reportId={r.id}
          submitted={r.status === "SUBMITTED"}
          occurrence={{
            id: r.occurrence?.id ?? "",
            title: r.occurrenceTitle,
            category: r.occurrence?.category ?? "OTHER",
            propertyName: property?.name ?? null,
            address: property?.address ?? null,
            startTime: occ?.startTime ?? null,
            endTime: occ?.endTime ?? null,
            note: occ?.note ?? null,
            vehicles: r.occurrence?.vehicles.map((v) => v.vehicle) ?? [],
          }}
          worker={{ id: r.user.id, name: r.user.name }}
          proxy={isProxyWrite(me, r.user.id)}
          workDays={[r.workDateKey]}
          initial={{
            workDate: r.workDateKey,
            startTime: r.startTime,
            endTime: r.endTime,
            detail: r.detail ?? "",
            parkingChoice: choiceOf(r.parkingFee),
            parkingFee: r.parkingFee ? String(r.parkingFee) : "",
            trainChoice: choiceOf(r.trainFare),
            trainFare: r.trainFare ? String(r.trainFare) : "",
            expenses: r.expenses.map((e) => ({ label: e.label, amount: String(e.amount) })),
            handoverChoice: r.handover ? "yes" : r.handoverNone ? "no" : "",
            handover: r.handover ?? "",
          }}
          initialPhotos={r.photos.map((p) => ({
            id: p.id,
            caption: p.caption ?? "",
            kind: isPhotoKind(p.kind) ? p.kind : "WORK",
            isVideo: p.isVideo,
            duration: p.duration ?? undefined,
            width: p.width ?? undefined,
            height: p.height ?? undefined,
          }))}
          blobEnabled={isBlobConfigured()}
        />
      </PageContainer>
    </div>
  );
}
