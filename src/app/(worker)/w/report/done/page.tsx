import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/session";
import { jstDateKey, jstMonthKey } from "@/lib/date";
import { fmtYenShort } from "@/lib/worker";
import { loadMonthExpenseTotal, loadMyVisits } from "@/features/worker/queries";
import { reportHref } from "@/features/worker/links";

export const dynamic = "force-dynamic";

/** 提出完了。今月の立替合計と、まだの日報があれば次の日報へ */
export default async function ReportDonePage({ searchParams }: { searchParams: Promise<{ id?: string; done?: string; completed?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const today = jstDateKey();
  const [total, todays] = await Promise.all([loadMonthExpenseTotal(me.id, jstMonthKey()), loadMyVisits(me.id, today, today)]);
  const nextDue = todays.find((v) => v.state === "due");
  const remaining = todays.filter((v) => v.state !== "sent").length;
  const draft = sp.done === "draft";

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 text-white w-safe-top">
      <CheckCircle2 className="mt-6 h-16 w-16 text-[var(--w-primary-soft)]" aria-hidden />
      <h1 className="mt-6 text-[30px] font-medium leading-[42px]">
        {draft ? "下書きを保存しました" : remaining > 0 ? "日報が提出されました" : "今日の日報が提出されました"}
      </h1>
      <p className="mt-2 text-[18px] text-[var(--w-primary-soft)]">
        {draft ? "あとで続きを書いて提出してください" : remaining > 0 ? `まだの日報があと${remaining}件あります` : "お疲れ様でした"}
      </p>

      <Link href="/w/statement" className="mt-8 flex items-center justify-between rounded-[18px] bg-[var(--w-tile)] px-5 py-4">
        <span>
          <span className="block text-[15px] text-[var(--w-primary-soft)]">今月の立替 合計</span>
          <span className="block text-[34px] leading-[44px]">{fmtYenShort(total)}</span>
        </span>
        <span className="text-[16px] font-semibold">精算書を見る</span>
      </Link>

      <div className="mt-auto space-y-3 pt-8">
        {nextDue && (
          <Link href={reportHref(nextDue)} className="flex h-[72px] items-center justify-center rounded-xl bg-white text-[20px] font-semibold text-[var(--w-primary)]">
            次の日報を書く（{nextDue.siteName}）
          </Link>
        )}
        <Link href="/w/statement" className="flex h-16 items-center justify-center rounded-xl border border-white/60 text-[18px]">
          今月の精算書を見る
        </Link>
        <Link href="/w" className="flex h-16 items-center justify-center rounded-xl text-[18px] text-[var(--w-primary-soft)]">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
