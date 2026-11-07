import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { findPropertyOnlyReport, loadPropertyOccurrencesOn } from "@/features/reports/queries";

export const dynamic = "force-dynamic";

/**
 * 現場から日報を後から追加：その日のこの現場の予定があれば紐付け（担当に入っていなければ保存時に担当へ追加）、
 * なければ現場の日報として書く。すでに日報があればそれを開く。
 */
export default async function LateReportRedirect({ searchParams }: { searchParams: Promise<{ propertyId?: string; date?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = jstDateKey();
  const date = sp.date ?? "";
  if (!sp.propertyId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || storedDateKey(dateFromKey(date)) !== date || date > today) redirect("/w/sites");

  const occs = await loadPropertyOccurrencesOn(sp.propertyId, date, me.id);
  // 自分の日報がある予定 → 自分が担当の予定 → まだ続いていない予定（担当に足せる）の順
  const withReport = occs.find((o) => o.existingReportId);
  if (withReport) redirect(`/w/report?reportId=${withReport.existingReportId}`);
  const mine = occs.find((o) => o.assigned);
  if (mine) redirect(`/w/report?occurrenceId=${mine.id}&date=${date}`);
  const addable = occs.find((o) => !o.ongoing);
  if (addable) redirect(`/w/report?occurrenceId=${addable.id}&date=${date}&late=1`);

  const existing = await findPropertyOnlyReport(sp.propertyId, me.id, date);
  if (existing) redirect(`/w/report?reportId=${existing}`);
  redirect(`/w/report?propertyId=${sp.propertyId}&date=${date}`);
}
