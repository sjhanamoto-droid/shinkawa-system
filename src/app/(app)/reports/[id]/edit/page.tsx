import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { canEditReport, isExpenseCategory, isProxyWrite, roundTimeToStep } from "@/lib/reports";
import type { ExpenseRow } from "@/features/reports/expense-editor";
import { isPhotoKind } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReport } from "@/features/reports/queries";
import { ReportForm } from "@/features/reports/report-form";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 以前の形式（駐車場代・電車賃の欄）で入っている金額は、経費の行として引き継ぐ */
function legacyRows(parkingFee: number | null, trainFare: number | null): ExpenseRow[] {
  const rows: ExpenseRow[] = [];
  if (parkingFee && parkingFee > 0) rows.push({ key: "legacy-parking", category: "PARKING", label: "", amount: String(parkingFee), ocr: false, receipt: null });
  if (trainFare && trainFare > 0) rows.push({ key: "legacy-train", category: "TRAVEL", label: "", amount: String(trainFare), ocr: false, receipt: null });
  return rows;
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
            startTime: roundTimeToStep(r.startTime, "09:00"),
            endTime: roundTimeToStep(r.endTime, "17:00"),
            detail: r.detail ?? "",
            expenses: [
              ...legacyRows(r.parkingFee, r.trainFare),
              ...r.expenses.map((e) => ({
                key: e.id,
                category: isExpenseCategory(e.category) ? e.category : ("" as const),
                label: e.label,
                amount: e.amount > 0 ? String(e.amount) : "",
                ocr: e.ocr,
                receipt: e.receiptPhotoId ? { id: e.receiptPhotoId } : null,
              })),
            ],
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
          ocrEnabled={isAnthropicConfigured()}
        />
      </PageContainer>
    </div>
  );
}
