import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { addMonthsKey, jstMonthKey } from "@/lib/date";

/** 前月・翌月の切り替え */
export function MonthNav({ ym, hrefFor }: { ym: string; hrefFor: (ym: string) => string }) {
  const [y, m] = ym.split("-").map(Number);
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={hrefFor(addMonthsKey(ym, -1))} aria-label="前月" className={buttonClass({ variant: "outline", size: "icon" })}>
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <div className="text-center leading-tight">
        <p className="text-base font-bold text-ink tnum md:text-lg">
          {y}年{m}月
        </p>
        {ym === jstMonthKey() && <p className="text-[11px] font-semibold text-brand-600">今月</p>}
      </div>
      <Link href={hrefFor(addMonthsKey(ym, 1))} aria-label="翌月" className={buttonClass({ variant: "outline", size: "icon" })}>
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}
