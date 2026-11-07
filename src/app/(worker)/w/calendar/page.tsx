import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { addDaysKey, dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { fmtDayLabel, fmtHm } from "@/lib/worker";
import { loadMyVisits } from "@/features/worker/queries";
import { reportHref, visitHref } from "@/features/worker/links";
import { WorkerTabBar } from "@/features/worker/ui/tab-bar";
import { StatePill } from "@/features/worker/ui/parts";

export const dynamic = "force-dynamic";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** 月曜はじまりの週の初日 */
function mondayOf(key: string): string {
  const dow = new Date(dateFromKey(key)).getDay();
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

/** カレンダー：週の日付と、選んだ日の自分の現場 */
export default async function WorkerCalendar({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const me = await requireUser();
  const today = jstDateKey();
  const sp = await searchParams;
  const selected = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) && storedDateKey(dateFromKey(sp.d)) === sp.d ? sp.d : today;
  const start = mondayOf(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  const [visits, unreadCount] = await Promise.all([loadMyVisits(me.id, days[0], days[6]), db.notification.count({ where: { userId: me.id, read: false } })]);
  const count = (d: string) => visits.filter((v) => v.dateKey === d).length;
  const list = visits.filter((v) => v.dateKey === selected);
  const [y, m] = selected.split("-").map(Number);

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 text-white w-safe-top">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-medium">
          {y}年{m}月
        </h1>
        <div className="flex gap-2">
          <Link href={`/w/calendar?d=${addDaysKey(start, -7)}`} aria-label="前の週" className="flex h-14 w-16 items-center justify-center rounded-xl border border-white/50">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <Link href={`/w/calendar?d=${addDaysKey(start, 7)}`} aria-label="次の週" className="flex h-14 w-16 items-center justify-center rounded-xl border border-white/50">
            <ChevronRight className="h-6 w-6" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const sel = d === selected;
          const n = count(d);
          const dow = new Date(dateFromKey(d)).getDay();
          return (
            <Link
              key={d}
              href={`/w/calendar?d=${d}`}
              aria-current={sel ? "date" : undefined}
              className={`flex h-[84px] flex-col items-center justify-center rounded-xl ${sel ? "bg-white text-[var(--w-primary)]" : "bg-white/[.16]"}`}
            >
              <span className="text-[14px]">{DOW[dow]}</span>
              <span className={`text-[24px] leading-8 ${d === today && !sel ? "underline underline-offset-4" : ""}`}>{Number(d.slice(8, 10))}</span>
              <span className="h-4 text-[12px]">{n > 0 ? `${n}件` : ""}</span>
            </Link>
          );
        })}
      </div>

      <h2 className="mt-6 text-[20px]">{fmtDayLabel(selected)}の現場</h2>
      {list.length === 0 ? (
        <p className="mt-3 text-[16px] text-[var(--w-primary-soft)]">この日の現場はありません</p>
      ) : (
        <div className="mt-3 space-y-3">
          {list.map((v) => (
            <Link
              key={`${v.occurrenceId}|${v.dateKey}`}
              href={v.state === "due" ? reportHref(v) : visitHref(v)}
              className="flex min-h-[110px] items-stretch overflow-hidden rounded-[18px] bg-white text-[var(--w-text)]"
            >
              <span className="flex w-[110px] shrink-0 flex-col justify-center border-r-2 border-dashed border-[var(--w-border)] px-4">
                <span className="text-[24px] text-[var(--w-primary)]">{v.startTime ? fmtHm(v.startTime) : "未定"}</span>
                {v.endTime && <span className="text-[15px] text-[var(--w-text-sub)]">〜{fmtHm(v.endTime)}</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
                <span className="truncate text-[21px]">{v.siteName}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] text-[var(--w-text-sub)]">{v.workLabel}</span>
                  {v.dateKey <= today && <StatePill state={v.state} />}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <WorkerTabBar unreadCount={unreadCount} />
    </div>
  );
}
