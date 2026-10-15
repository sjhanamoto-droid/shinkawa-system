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
      <div className="flex items-center gap-2">
        <p className="text-xl font-bold text-ink tnum">
          {y}年{m}月
        </p>
        {ym === jstMonthKey() && (
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
            今月
          </span>
        )}
      </div>
      <Link href={hrefFor(addMonthsKey(ym, 1))} aria-label="翌月" className={buttonClass({ variant: "outline", size: "icon" })}>
        <ChevronRight className="h-5 w-5" />
      </Link>
    </div>
  );
}
