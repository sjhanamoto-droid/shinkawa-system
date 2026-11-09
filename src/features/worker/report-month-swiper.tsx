"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDayLabel } from "@/lib/worker";
import { SentStamp } from "./ui/parts";

// 提出した日報を月ごとに並べ、横にスライドして月を移動する（右端が今月。左へスライドすると前の月）。
// 矢印でも移動できる。スクロールのスナップで1か月ずつ止まる。

export type MonthReports = {
  ym: string; // YYYY-MM
  reports: { id: string; workDateKey: string; place: string }[];
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

export function ReportMonthSwiper({ months }: { months: MonthReports[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(months.length - 1);

  // 最初は今月（右端）を見せる
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.max(0, Math.min(months.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  }

  function go(i: number) {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const current = months[index];
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[20px] font-medium">
          提出した日報
          <span className="ml-2 text-[16px] text-[var(--w-primary-soft)]">
            {current ? `${monthLabel(current.ym)}・${current.reports.length}件` : ""}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index <= 0}
          aria-label="前の月"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/40 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= months.length - 1}
          aria-label="次の月"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/40 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={ref}
        onScroll={onScroll}
        className="-mx-5 mt-3 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {months.map((mo) => (
          <section key={mo.ym} aria-label={monthLabel(mo.ym)} className="w-full shrink-0 snap-start px-5">
            {mo.reports.length === 0 ? (
              <p className="rounded-2xl border border-white/20 px-4 py-6 text-center text-[16px] text-[var(--w-primary-soft)]">
                {monthLabel(mo.ym)}に提出した日報はありません
              </p>
            ) : (
              <div className="space-y-3">
                {mo.reports.map((r) => (
                  <Link key={r.id} href={`/w/reports/${r.id}`} className="flex min-h-[84px] items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[var(--w-text)]">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-[var(--w-text-muted)]">{fmtDayLabel(r.workDateKey)}</p>
                      <p className="truncate text-[20px]">{r.place}</p>
                    </div>
                    <SentStamp />
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      {months.length > 1 && <p className="mt-3 text-center text-[14px] text-[var(--w-primary-soft)]">横にスライドすると前の月に移れます</p>}
    </div>
  );
}
