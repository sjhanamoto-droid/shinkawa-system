import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canEditReport, workMinutes } from "@/lib/reports";
import { photoSrc } from "@/lib/photos";
import { catLabel } from "@/lib/categories";
import { getCategories } from "@/lib/categories-server";
import { fmtDayLabel, fmtDuration, fmtHm, fmtYenShort } from "@/lib/worker";
import { loadReport } from "@/features/reports/queries";
import { fromSavedExpenses, receiptKindLabel, tollRouteLabel, tollSubLabel } from "@/features/worker/report/model";
import { BackButton, FooterBar, FooterSpacer, PrimaryButton } from "@/features/worker/ui/parts";

export const dynamic = "force-dynamic";

/** 日別の詳細（日報1件）。直せる人は「修正する」で日報の該当ステップへ */
export default async function WorkerReportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const { done } = await searchParams;
  const r = await loadReport(id, me);
  if (!r) notFound();
  const categories = await getCategories();
  const canEdit = canEditReport(me, r);
  const ex = r.showExpenses ? fromSavedExpenses(r.expenses, { parkingFee: r.parkingFee, trainFare: r.trainFare }) : null;
  const train = ex?.train.on ? Number(ex.train.amount) || 0 : 0;
  // 「修正する」は、その項目の1画面だけを直して確定する
  const edit = (step: number) => (canEdit ? `/w/report?reportId=${r.id}&step=${step}&single=1` : null);
  const minutes = workMinutes(r.startTime, r.endTime);

  return (
    <div className="min-h-dvh bg-white">
      <header className="bg-[var(--w-primary)] px-5 pb-6 text-white w-safe-top">
        <p className="text-[15px] text-[var(--w-primary-soft)]">
          {fmtDayLabel(r.workDateKey)}
          {r.status === "DRAFT" && <span className="ml-2 rounded-full bg-[#fde68a] px-2 py-0.5 text-[13px] text-[#713f12]">下書き</span>}
        </p>
        <h1 className="mt-1 break-words text-[28px] font-medium leading-[38px]">{r.property?.name ?? r.occurrenceTitle}</h1>
        <p className="text-[17px] text-[#d1fae5]">{r.occurrence ? catLabel(categories, r.occurrence.category) : "現場の日報"}</p>
      </header>

      {done && <p className="mx-5 mt-4 rounded-xl bg-[var(--w-primary-soft)] px-4 py-3 text-[16px] font-semibold text-[var(--w-primary-dark)]">修正を保存しました</p>}
      <div className="px-5 py-2">
        <Line label="時間" value={`${fmtHm(r.startTime)}〜${fmtHm(r.endTime)}（${fmtDuration(minutes)}）`} href={edit(1)} />
        {ex && (
          <>
            {ex.tolls.map((t) => (
              <Line key={t.key} label="高速代" value={fmtYenShort(t.amount)} sub={`${tollRouteLabel(t)}・${tollSubLabel(t)}`} href={edit(2)} />
            ))}
            {train > 0 && <Line label="電車・バス代" value={fmtYenShort(train)} href={edit(2)} />}
          </>
        )}
        <Line label="作業内容" value={r.detail ? "" : "未入力"} sub={r.detail ?? undefined} href={edit(4)} />
        <Line label="引き継ぎ" value={r.handover ? "あり" : r.handoverNone ? "なし" : "未選択"} sub={r.handover ?? undefined} href={edit(4)} />
      </div>

      {ex && (
        <section className="px-5 pb-4">
          <div className="flex items-baseline justify-between border-b border-[var(--w-divider)] py-4">
            <span className="text-[18px] font-semibold">立替の合計</span>
            <span className="text-[30px] text-[var(--w-primary)]">{fmtYenShort(r.expenseTotal)}</span>
          </div>
          <h2 className="mt-4 text-[18px] font-semibold">経費</h2>
          {ex.receipts.length === 0 ? (
            <p className="mt-2 rounded-xl bg-[var(--w-soft-bg)] px-4 py-4 text-[16px] text-[var(--w-text-muted)]">この日の経費はありません</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {ex.receipts.map((e) => (
                <div key={e.key} className="overflow-hidden rounded-[14px] border border-[var(--w-divider)]">
                  <div className="flex h-28 items-center justify-center bg-[var(--w-disabled-bg)]">
                    {e.receipt && "id" in e.receipt ? (
                      <a href={photoSrc(e.receipt.id)} target="_blank" rel="noreferrer" className="h-full w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoSrc(e.receipt.id, true)} alt="領収書" className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <span className="text-center text-[13px] text-[var(--w-text-muted)]">
                        写真なし
                        <br />
                        手入力
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <p className="truncate text-[15px] text-[var(--w-text-sub)]">{e.kind === "OTHER" && e.memo ? e.memo : receiptKindLabel(e.kind)}</p>
                    <p className="text-[19px]">{e.amount ? fmtYenShort(e.amount) : "未入力"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <Link href={`/w/report?reportId=${r.id}&step=3&single=1`} className="mt-3 flex h-14 items-center justify-center rounded-xl border border-dashed border-[#94a3b8] text-[17px] text-[var(--w-primary-dark)]">
              ＋ 経費を追加・修正する
            </Link>
          )}
        </section>
      )}

      <FooterSpacer />
      {canEdit && r.status === "DRAFT" ? (
        <FooterBar wide>
          <BackButton href="/w/reports">戻る</BackButton>
          <PrimaryButton href={`/w/report?reportId=${r.id}`}>続きを書いて提出</PrimaryButton>
        </FooterBar>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white px-4 pt-3 w-footer-safe">
          <BackButton href="/w/reports">戻る</BackButton>
        </div>
      )}
    </div>
  );
}

function Line({ label, value, sub, href }: { label: string; value: string; sub?: string; href: string | null }) {
  const body = (
    <>
      <span className="w-24 shrink-0 text-[16px] text-[var(--w-text-muted)]">{label}</span>
      <span className="min-w-0 flex-1">
        {value && <span className="block text-[18px] font-semibold">{value}</span>}
        {sub && <span className="block whitespace-pre-wrap break-words text-[15px] text-[var(--w-text-sub)]">{sub}</span>}
      </span>
      {href && <span className="shrink-0 text-[15px] font-semibold text-[var(--w-primary)]">修正する</span>}
    </>
  );
  const cls = "flex min-h-[64px] items-center gap-3 border-b border-[var(--w-divider)] py-3";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
