import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { addMonthsKey, jstMonthKey } from "@/lib/date";
import { parseMonthKey } from "@/lib/attendance";
import { fmtHm, fmtYenShort } from "@/lib/worker";
import { loadStatement } from "@/features/worker/queries";
import { BackButton, FooterSpacer } from "@/features/worker/ui/parts";

export const dynamic = "force-dynamic";

/** 勤務表・経費精算書（本人の分だけ。提出済みの日報から） */
export default async function StatementPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const me = await requireUser();
  const thisMonth = jstMonthKey();
  const ym = parseMonthKey((await searchParams).ym, thisMonth);
  const s = await loadStatement(me.id, ym);
  const [y, m] = ym.split("-").map(Number);
  const hours = Math.round((s.minutes / 60) * 10) / 10;

  return (
    <div className="min-h-dvh bg-[#f7f8fb]">
      <header className="bg-[var(--w-primary)] px-5 pb-6 text-white w-safe-top">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[17px]">
            {y}年{m}月 勤務表・経費精算書
          </p>
          <div className="flex gap-1">
            <Link href={`/w/statement?ym=${addMonthsKey(ym, -1)}`} aria-label="前の月" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/40">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            {ym < thisMonth && (
              <Link href={`/w/statement?ym=${addMonthsKey(ym, 1)}`} aria-label="次の月" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/40">
                <ChevronRight className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>
        <p className="mt-3 text-[15px] text-[var(--w-primary-soft)]">立替の合計</p>
        <p className="text-[46px] leading-[56px]">{fmtYenShort(s.total)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tile label="勤務日数" value={`${s.workDays}日`} />
          <Tile label="勤務時間" value={`${hours}h`} />
          <Tile label="領収書" value={`${s.receipts}枚`} />
        </div>
      </header>

      <div className="px-4 py-5">
        <h2 className="px-1 text-[20px] font-semibold">日ごとの内容</h2>
        {s.days.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white px-4 py-6 text-center text-[16px] text-[var(--w-text-muted)]">この月に提出した日報はまだありません</p>
        ) : (
          <div className="mt-3 divide-y divide-[var(--w-divider)] overflow-hidden rounded-2xl border border-[var(--w-divider)] bg-white">
            {s.days.map((d) => {
              const [, dm, dd] = d.dateKey.split("-").map(Number);
              return (
                <Link key={d.reportId} href={`/w/reports/${d.reportId}`} className="flex min-h-[68px] items-center gap-3 px-4 py-3 active:bg-[var(--w-soft-bg)]">
                  <span className="w-[50px] shrink-0 text-[18px] font-semibold">
                    {dm}/{dd}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px]">{d.place}</span>
                    <span className="block text-[15px] text-[var(--w-text-muted)]">
                      {fmtHm(d.startTime)}〜{fmtHm(d.endTime)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[18px]">{d.amount > 0 ? fmtYenShort(d.amount) : "—"}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[var(--w-primary)]" aria-hidden />
                </Link>
              );
            })}
          </div>
        )}
        <p className="mt-3 px-1 text-[13px] text-[var(--w-text-muted)]">提出した日報の作業時間と経費を集計しています。</p>
      </div>

      <FooterSpacer />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white px-4 pt-3 w-footer-safe">
        <BackButton href="/w/reports">戻る</BackButton>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white/[.16] px-3 py-2.5">
      <p className="text-[14px] text-[var(--w-primary-soft)]">{label}</p>
      <p className="text-[26px] leading-[34px]">{value}</p>
    </div>
  );
}
