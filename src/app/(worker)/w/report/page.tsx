import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { getAppSettings } from "@/lib/settings";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { isPhotoKind } from "@/lib/constants";
import { catLabel } from "@/lib/categories";
import { getCategories } from "@/lib/categories-server";
import { canEditReport, canWriteReportFor, isProxyWrite, isReportDue, occurrenceWorkDays } from "@/lib/reports";
import { fromSavedTimes } from "@/lib/worker";
import { findPropertyOnlyReport, loadReport, loadReportTarget } from "@/features/reports/queries";
import { ReportWizard, type WizardProps } from "@/features/worker/report/wizard";
import { fromSavedExpenses, type WizardValues } from "@/features/worker/report/model";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function Blocked({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 text-white">
      <h1 className="text-[27px] font-medium leading-[38px]">{title}</h1>
      <p className="mt-3 text-[17px] leading-7 text-[var(--w-primary-soft)]">{description}</p>
      <Link href="/w" className="mt-8 flex h-16 items-center justify-center rounded-xl bg-white text-[18px] font-semibold text-[var(--w-primary)]">
        ホームに戻る
      </Link>
    </div>
  );
}

const EMPTY: Omit<WizardValues, "startMin" | "endMin"> = {
  transport: "",
  tolls: [],
  train: { on: false, amount: "" },
  receipts: [],
  detail: "",
  handover: "",
  handoverText: "",
};

/** スタッフ画面の日報。新規（予定×日／現場×日）と、書きかけ・提出済みの修正 */
export default async function WorkerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ reportId?: string; occurrenceId?: string; propertyId?: string; userId?: string; date?: string; late?: string; step?: string; single?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = jstDateKey();
  const step = Math.min(5, Math.max(0, Number(sp.step) || 0));
  const common = { blobEnabled: isBlobConfigured(), aiEnabled: isAnthropicConfigured() };
  const categories = await getCategories();

  // ── 書きかけ・提出済みの日報を直す ──
  if (sp.reportId) {
    const r = await loadReport(sp.reportId, me);
    if (!r) return <Blocked title="日報が見つかりません" description="削除された可能性があります。" />;
    if (!canEditReport(me, r)) redirect(`/w/reports/${r.id}`);
    const [property, occ] = await Promise.all([
      r.propertyId ? db.property.findUnique({ where: { id: r.propertyId }, select: { name: true, address: true } }) : null,
      r.occurrence ? db.occurrence.findUnique({ where: { id: r.occurrence.id }, select: { startTime: true, endTime: true } }) : null,
    ]);
    const saved = fromSavedExpenses(r.expenses, { parkingFee: r.parkingFee, trainFare: r.trainFare });
    const submitted = r.status === "SUBMITTED";
    const t = fromSavedTimes(r.startTime, r.endTime);
    const props: WizardProps = {
      ...common,
      reportId: r.id,
      userId: r.user.id,
      workerName: r.user.name,
      proxy: isProxyWrite(me, r.user.id),
      workDate: r.workDateKey,
      site: {
        name: property?.name ?? r.occurrenceTitle,
        customerName: r.property?.customer?.name ?? null,
        workLabel: r.occurrence ? catLabel(categories, r.occurrence.category) : "現場の日報",
        startTime: occ?.startTime ?? null,
        endTime: occ?.endTime ?? null,
        address: property?.address ?? null,
      },
      submitted,
      initial: {
        ...EMPTY,
        ...saved,
        startMin: t.startMin,
        endMin: t.endMin,
        transport: saved.tolls.length || saved.train.on ? "used" : submitted ? "none" : "",
        detail: r.detail ?? "",
        handover: r.handover ? "yes" : r.handoverNone ? "no" : "",
        handoverText: r.handover ?? "",
      },
      initialPhotos: r.photos.map((p) => ({
        id: p.id,
        caption: p.caption ?? "",
        kind: isPhotoKind(p.kind) ? p.kind : "WORK",
        isVideo: p.isVideo,
        duration: p.duration ?? undefined,
        width: p.width ?? undefined,
        height: p.height ?? undefined,
      })),
      initialStep: sp.step ? step : submitted ? 5 : 0,
      // 日別の詳細の「修正する」から：その1画面だけを直して確定する
      single: sp.single === "1" && step >= 1 && step <= 4,
      storageKey: `shinkawa:worker-report:v1:edit:${r.id}`,
      exitHref: submitted || sp.single === "1" ? `/w/reports/${r.id}` : "/w",
    };
    return <ReportWizard {...props} />;
  }

  const userId = sp.userId || me.id;
  if (!canWriteReportFor(me, userId)) return <Blocked title="この日報は書けません" description="自分の日報だけを書けます。" />;
  const settings = await getAppSettings();

  // ── 予定に紐付かない現場の日報（現場から後で追加） ──
  if (!sp.occurrenceId) {
    if (!sp.propertyId || !sp.date || !DATE_RE.test(sp.date) || storedDateKey(dateFromKey(sp.date)) !== sp.date) redirect("/w");
    if (sp.date > today) return <Blocked title="まだ書けません" description="未来の日付では日報を作成できません。" />;
    const [property, worker] = await Promise.all([
      db.property.findUnique({ where: { id: sp.propertyId }, select: { id: true, name: true, address: true, customer: { select: { name: true } } } }),
      db.user.findFirst({ where: { id: userId, active: true }, select: { id: true, name: true } }),
    ]);
    if (!property || !worker) return <Blocked title="現場が見つかりません" description="削除された可能性があります。" />;
    const existing = await findPropertyOnlyReport(property.id, userId, sp.date);
    if (existing) redirect(`/w/report?reportId=${existing}`);
    const t = fromSavedTimes(settings.defaultStartTime, settings.defaultEndTime);
    return (
      <ReportWizard
        {...common}
        propertyId={property.id}
        userId={worker.id}
        workerName={worker.name}
        proxy={isProxyWrite(me, worker.id)}
        workDate={sp.date}
        site={{ name: property.name, customerName: property.customer?.name ?? null, workLabel: "現場の日報", startTime: null, endTime: null, address: property.address }}
        submitted={false}
        initial={{ ...EMPTY, startMin: t.startMin, endMin: t.endMin }}
        initialPhotos={[]}
        initialStep={0}
        storageKey={`shinkawa:worker-report:v1:new:property:${property.id}:${worker.id}:${sp.date}`}
        exitHref={`/w/sites/${property.id}`}
      />
    );
  }

  // ── 予定×作業日 ──
  const late = sp.late === "1";
  const target = await loadReportTarget(sp.occurrenceId, userId, { allowUnassigned: late });
  if (!target) return <Blocked title="予定が見つかりません" description="予定が削除されたか、担当から外れた可能性があります。" />;
  const { occurrence: o, worker } = target;
  if (!isReportDue({ date: o.dateKey, status: o.status, category: o.category })) {
    return <Blocked title="この予定に日報は不要です" description="中止になった予定や「休み」には日報はいりません。" />;
  }
  const days = occurrenceWorkDays(o.dateKey, o.endDateKey).filter((d) => d <= today);
  const workDate = sp.date && days.includes(sp.date) ? sp.date : days.includes(today) ? today : days[days.length - 1];
  if (!workDate) return <Blocked title="まだ書けません" description="作業日になってから書けます。" />;
  const existing = await db.dailyReport.findUnique({
    where: { occurrenceId_userId_workDate: { occurrenceId: o.id, userId, workDate: dateFromKey(workDate) } },
    select: { id: true },
  });
  if (existing) redirect(`/w/report?reportId=${existing.id}`);
  const t = fromSavedTimes(o.startTime ?? settings.defaultStartTime, o.endTime ?? settings.defaultEndTime);

  return (
    <ReportWizard
      {...common}
      occurrenceId={o.id}
      addAssignee={late && !target.assigned}
      userId={worker.id}
      workerName={worker.name}
      proxy={isProxyWrite(me, worker.id)}
      workDate={workDate}
      site={{
        name: o.property?.name ?? o.title,
        customerName: null,
        workLabel: catLabel(categories, o.category),
        startTime: o.startTime,
        endTime: o.endTime,
        address: o.property?.address ?? null,
      }}
      submitted={false}
      initial={{ ...EMPTY, startMin: t.startMin, endMin: t.endMin }}
      initialPhotos={[]}
      initialStep={0}
      storageKey={`shinkawa:worker-report:v1:new:${o.id}:${worker.id}:${workDate}`}
      exitHref="/w"
    />
  );
}
