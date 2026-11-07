import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/session";
import { addDaysKey, jstDateKey } from "@/lib/date";
import { fmtDayLabel, fmtHm, pickFocus } from "@/lib/worker";
import { loadMyReportTodo } from "@/features/reports/queries";
import { loadMyVisits, type WorkerVisit } from "@/features/worker/queries";
import { WorkerTabBar } from "@/features/worker/ui/tab-bar";
import { SentStamp, StatePill } from "@/features/worker/ui/parts";
import { db } from "@/lib/db";
import { reportHref, visitHref } from "@/features/worker/links";

export const dynamic = "force-dynamic";

export default async function WorkerHome() {
  const me = await requireUser();
  const today = jstDateKey();
  const tomorrow = addDaysKey(today, 1);
  const [visits, tomorrowVisits, todo, unreadCount] = await Promise.all([
    loadMyVisits(me.id, today, today),
    loadMyVisits(me.id, tomorrow, tomorrow),
    loadMyReportTodo(me.id),
    db.notification.count({ where: { userId: me.id, read: false } }),
  ]);
  const focus = pickFocus(visits);
  const others = visits.filter((v) => v !== focus);
  const allSent = visits.length > 0 && visits.every((v) => v.state === "sent");
  const next = tomorrowVisits[0];
  const missing = todo.missing.length;

  let heading: [string, string];
  if (visits.length === 0) heading = ["今日の現場は", "ありません"];
  else if (allSent) heading = ["お疲れ様でした", "日報はすべて提出済み"];
  else if (focus?.state === "due") heading = [`${focus.siteName}の`, "日報を書きましょう"];
  else heading = ["今日の現場は", `${focus?.siteName ?? ""}です`];

  return (
    <div className="flex min-h-dvh flex-col text-white">
      <div className="flex-1 px-5 pb-4 w-safe-top">
        <p className="text-[15px] leading-6 text-[var(--w-primary-soft)]">{fmtDayLabel(today)}</p>
        <h1 className="mb-5 mt-2 text-[27px] font-medium leading-[38px]">
          {heading[0]}
          <br />
          {heading[1]}
        </h1>

        {focus && <FocusCard v={focus} />}

        {others.length > 0 && (
          <div className="mt-4 space-y-3">
            {others.map((v) => (
              <OtherCard key={`${v.occurrenceId}|${v.dateKey}`} v={v} first={others.length === 1 && !!focus} />
            ))}
          </div>
        )}

        {missing > 0 && (
          <Link href="/w/reports" className="mt-4 flex min-h-[56px] items-center justify-between rounded-2xl bg-[#fde68a] px-4 text-[16px] text-[#713f12]">
            <span>前の日の日報が {missing}件 まだです</span>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        )}
      </div>

      {next && (
        <p className="px-6 pb-4 text-[16px] text-[var(--w-primary-soft)]">
          明日は {next.startTime ? `${fmtHm(next.startTime)} から` : ""}
          {next.siteName}です
        </p>
      )}
      <WorkerTabBar unreadCount={unreadCount} />
    </div>
  );
}

function FocusCard({ v }: { v: WorkerVisit }) {
  const due = v.state === "due";
  const primary = due ? { href: reportHref(v), label: v.reportStatus === "DRAFT" ? "日報の続きを書く" : "日報を書く" } : { href: visitHref(v), label: "現場の情報を見る" };
  const secondary = due ? { href: visitHref(v), label: "現場の情報を見る" } : { href: reportHref(v), label: "日報を書く" };
  return (
    <div className="w-ticket text-[var(--w-text)]">
      <div className="px-[22px] pb-[26px] pt-[34px]">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[42px] font-medium leading-[50px] text-[var(--w-primary)]">
            {v.startTime ? fmtHm(v.startTime) : "時間未定"}
            {v.endTime && <span className="text-[18px]">〜{fmtHm(v.endTime)}</span>}
          </p>
          {v.customerName && <p className="mb-1 min-w-0 truncate text-[15px] text-[var(--w-text-muted)]">{v.customerName}</p>}
        </div>
        <p className="mt-5 break-words text-[33px] leading-[44px]">{v.siteName}</p>
        <p className="text-[18px] text-[var(--w-text-sub)]">{v.workLabel}</p>
      </div>
      <div className="w-ticket-cut px-4 pb-4 pt-[18px]">
        <div className={due ? "rounded-2xl bg-[var(--w-primary-soft)] p-2" : ""}>
          <Link
            href={primary.href}
            className={`flex h-[74px] items-center justify-center rounded-xl bg-[var(--w-primary)] text-[21px] font-semibold text-white active:bg-[var(--w-primary-dark)] ${due ? "w-call" : ""}`}
          >
            {primary.label}
          </Link>
        </div>
        <Link href={secondary.href} className="mt-1 flex h-14 items-center justify-center text-[17px] font-semibold text-[var(--w-primary-dark)]">
          {secondary.label}
        </Link>
      </div>
    </div>
  );
}

function OtherCard({ v, first }: { v: WorkerVisit; first: boolean }) {
  const sent = v.state === "sent";
  const href = v.state === "due" ? reportHref(v) : visitHref(v);
  return (
    <Link
      href={href}
      className={`flex min-h-[84px] items-center gap-3 rounded-2xl px-4 py-3 ${sent ? "bg-white text-[var(--w-text)]" : "bg-[var(--w-tile)] text-white"}`}
    >
      <div className="min-w-0 flex-1">
        {first && !sent && <p className="text-[13px] opacity-80">次の現場</p>}
        <p className="text-[15px] opacity-80">
          {v.startTime ? fmtHm(v.startTime) : "時間未定"}
          {v.endTime ? `〜${fmtHm(v.endTime)}` : ""}
        </p>
        <p className="truncate text-[21px] leading-8">{v.siteName}</p>
      </div>
      {sent ? <SentStamp /> : <StatePill state={v.state} onGreen />}
    </Link>
  );
}
