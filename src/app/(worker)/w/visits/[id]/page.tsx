import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isPlanner } from "@/lib/permissions";
import { fmtHm } from "@/lib/worker";
import { loadVisitInfo } from "@/features/worker/queries";
import { reportHref } from "@/features/worker/links";
import { BackButton, FooterBar, FooterSpacer, PrimaryButton } from "@/features/worker/ui/parts";

export const dynamic = "force-dynamic";

/**
 * 予定の情報。現場のある予定は、現場タブと同じ現場の詳細（/w/sites/[id]?visit=）で見せる。
 * ここに残るのは現場が決まっていない予定だけ（予定のメモと日報を書くボタン）。
 */
export default async function VisitInfoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const v = await loadVisitInfo(id, me.id, isPlanner(me), sp.date);
  if (!v) notFound();
  if (v.property) redirect(`/w/sites/${v.property.id}?visit=${v.occurrenceId}&date=${v.dateKey}`);
  const sent = v.report?.status === "SUBMITTED";

  return (
    <div className="min-h-dvh bg-white">
      <header className="bg-[var(--w-primary)] px-5 pb-6 text-white w-safe-top">
        <p className="text-[15px] text-[var(--w-primary-soft)]">
          {v.customerName && <span className="mr-3">{v.customerName}</span>}
          {v.startTime ? `${fmtHm(v.startTime)}${v.endTime ? `〜${fmtHm(v.endTime)}` : ""}` : "時間未定"}
        </p>
        <h1 className="mt-1 break-words text-[28px] font-medium leading-[38px]">{v.siteName}</h1>
        <p className="text-[17px] text-[#d1fae5]">{v.workLabel}</p>
      </header>

      <div className="space-y-3 px-5 py-4">
        <p className="rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-4 text-[16px] text-[var(--w-text-sub)]">この予定には現場が登録されていません。場所や入り方は事務所に確認してください。</p>
        {v.note && (
          <div className="rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-4">
            <p className="text-[14px] font-semibold text-[var(--w-text-sub)]">メモ</p>
            <p className="mt-1 whitespace-pre-wrap text-[17px] leading-7">{v.note}</p>
          </div>
        )}
      </div>

      <FooterSpacer />
      <FooterBar wide>
        <BackButton href="/w">閉じる</BackButton>
        {sent ? (
          <PrimaryButton disabled>提出済み</PrimaryButton>
        ) : v.assigned ? (
          <PrimaryButton href={reportHref({ occurrenceId: v.occurrenceId, dateKey: v.dateKey, reportId: v.report?.id ?? null })}>{v.report ? "日報の続きを書く" : "日報を書く"}</PrimaryButton>
        ) : (
          <PrimaryButton disabled>担当ではありません</PrimaryButton>
        )}
      </FooterBar>
    </div>
  );
}
