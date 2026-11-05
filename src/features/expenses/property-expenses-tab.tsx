"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Printer, Receipt, X } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui/card";
import { PhotoLightbox } from "@/components/photo-lightbox";
import type { PhotoData } from "@/components/photo-grid";
import { buttonClass } from "@/components/ui/button";
import { fmtMonthLabel, summarizeExpenses, type ExpenseItem } from "@/lib/expenses";
import { fmtExpenseDate } from "@/lib/reports";
import { fmtKeyShort } from "@/features/schedule/filters";
import { cn, fmtYen } from "@/lib/utils";

/** 現場詳細「経費」タブ。最高管理者・事務だけに出す（呼び出し側で判定） */
export function PropertyExpensesTab({ propertyId, items }: { propertyId: string; items: ExpenseItem[] }) {
  const [ym, setYm] = useState<string | null>(null);
  const all = useMemo(() => summarizeExpenses(items), [items]);
  const view = useMemo(() => (ym ? summarizeExpenses(items, ym) : all), [items, ym, all]);
  const maxMonth = Math.max(1, ...all.byMonth.map((m) => m.total));
  const printHref = `/properties/${propertyId}/expenses/print${ym ? `?ym=${ym}` : ""}`;
  const lastDate = items.length ? items[items.length - 1].workDateKey : null;
  // 明細は新しい順。領収書は明細と同じ順で並べ、ビューアで左右に切り替える
  const rows = useMemo(() => [...view.items].reverse(), [view.items]);
  const receipts = useMemo<PhotoData[]>(
    () =>
      rows
        .filter((i) => i.receiptPhotoId)
        .map((i) => ({ id: i.receiptPhotoId!, kind: "RECEIPT", isVideo: false, caption: `${fmtKeyShort(i.workDateKey)} ${i.categoryLabel} ${fmtYen(i.amount)}${i.label ? `（${i.label}）` : ""}` })),
    [rows],
  );
  const [receiptIndex, setReceiptIndex] = useState<number | null>(null);

  const emptyBox = (text: string) => (
    <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-sm font-medium text-ink-muted">{text}</div>
  );

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            <Link href={printHref} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Printer className="h-4 w-4" />
              報告書を出力
            </Link>
          }
        >
          <span className="flex items-baseline gap-2">
            経費{ym ? `（${fmtMonthLabel(ym)}）` : "（累計）"}
          </span>
        </SectionTitle>
        <Card className="flex flex-wrap items-end justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold text-ink-muted">{ym ? "この月の合計" : "これまでの合計"}</p>
            <p className="text-3xl font-black text-ink tnum">{fmtYen(view.total)}</p>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <p className="tnum">{view.items.length}件</p>
            {!ym && lastDate && <p>最終計上 {fmtKeyShort(lastDate)}</p>}
            {ym && (
              <button type="button" onClick={() => setYm(null)} className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 font-semibold text-ink-soft">
                <X className="h-3.5 w-3.5" />
                累計に戻す
              </button>
            )}
          </div>
        </Card>
        <p className="px-1 text-xs text-ink-faint">提出済みの日報に入力された経費だけを、日報の作業日で集計しています。</p>
      </section>

      {items.length === 0 ? (
        emptyBox("この現場の経費はまだありません")
      ) : (
        <>
          {/* 月別 */}
          <section className="space-y-2.5">
            <SectionTitle>月別</SectionTitle>
            <Card className="divide-y">
              {all.byMonth.map((m) => {
                const active = m.ym === ym;
                return (
                  <button
                    key={m.ym}
                    type="button"
                    onClick={() => setYm(active ? null : m.ym)}
                    aria-pressed={active}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", active ? "bg-brand-50 dark:bg-brand-900/30" : "hover:bg-surface-sunken")}
                  >
                    <span className="w-24 shrink-0 text-sm font-bold text-ink">{fmtMonthLabel(m.ym)}</span>
                    <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (m.total / maxMonth) * 100)}%` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-sm font-bold text-ink tnum">{fmtYen(m.total)}</span>
                    <span className="w-10 shrink-0 text-right text-xs text-ink-muted tnum">{m.count}件</span>
                  </button>
                );
              })}
            </Card>
            <p className="px-1 text-xs text-ink-faint">月をタップすると、その月だけの集計と明細に切り替わります。</p>
          </section>

          {/* 科目別 */}
          <section className="space-y-2.5">
            <SectionTitle>科目別</SectionTitle>
            <Card className="divide-y">
              {view.byCategory.map((c) => (
                <div key={c.category || "unset"} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.label}</span>
                  <span className="text-xs text-ink-muted tnum">{c.count}件</span>
                  <span className="w-28 text-right text-sm font-bold text-ink tnum">{fmtYen(c.total)}</span>
                </div>
              ))}
            </Card>
          </section>

          {/* 明細 */}
          <section className="space-y-2.5">
            <SectionTitle>
              <span className="flex items-baseline gap-2">
                明細<span className="text-sm font-normal text-ink-muted tnum">{view.items.length}件</span>
              </span>
            </SectionTitle>
            {receipts.length > 0 && <p className="-mt-1 px-1 text-xs text-ink-muted">領収書のある行を押すと写真が開きます（左右にスワイプで切り替え）。</p>}
            <Card className="divide-y">
              {rows.map((i) => {
                const body = (
                  <>
                    <div className="w-20 shrink-0 whitespace-nowrap text-sm font-bold text-ink tnum">{fmtKeyShort(i.workDateKey)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {i.categoryLabel}
                        {i.label && <span className="font-normal text-ink-soft">　{i.label}</span>}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {i.userName}
                        {i.paidOn && `・領収書 ${fmtExpenseDate(i.paidOn)}`}
                      </p>
                    </div>
                    <span className="w-4 shrink-0">{i.receiptPhotoId && <Receipt className="h-4 w-4 text-brand-600" aria-label="領収書あり" />}</span>
                    <span className="w-24 shrink-0 text-right text-sm font-bold text-ink tnum">{fmtYen(i.amount)}</span>
                  </>
                );
                // 領収書あり：行を押すと領収書の写真、右端から日報へ。なし：行全体で日報へ
                return i.receiptPhotoId ? (
                  <div key={i.key} className="flex items-center hover:bg-surface-sunken">
                    <button
                      type="button"
                      onClick={() => setReceiptIndex(receipts.findIndex((r) => r.id === i.receiptPhotoId))}
                      aria-label={`${i.categoryLabel}の領収書を見る`}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                    >
                      {body}
                    </button>
                    <Link href={`/reports/${i.reportId}`} aria-label="日報を開く" className="flex h-12 w-11 shrink-0 items-center justify-center text-ink-faint hover:text-ink-soft">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                ) : (
                  <Link key={i.key} href={`/reports/${i.reportId}`} className="flex items-center gap-3 py-3 pl-4 hover:bg-surface-sunken">
                    {body}
                    <span className="flex w-11 shrink-0 justify-center text-ink-faint">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                );
              })}
            </Card>
          </section>
        </>
      )}

      {/* data-noswipe：領収書を左右にスワイプしても、現場詳細のタブが切り替わらないように */}
      {receiptIndex !== null && receipts[receiptIndex] && (
        <div data-noswipe>
          <PhotoLightbox photos={receipts} index={receiptIndex} onIndexChange={setReceiptIndex} onClose={() => setReceiptIndex(null)} />
        </div>
      )}
    </div>
  );
}
