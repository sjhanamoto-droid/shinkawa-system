import { dayTone, holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";
import { WEEKDAY_JA, weekdayOfKey } from "./filters";

// 日付の文字色：祝日・日曜＝赤、土曜＝青（祝日は土曜でも赤）。平日は fallback
const TONE_TEXT = {
  holiday: "text-red-500",
  sunday: "text-red-500",
  saturday: "text-blue-500",
} as const;

export function toneText(dateKey: string, fallback: string): string {
  const tone = dayTone(dateKey, weekdayOfKey(dateKey));
  return tone ? TONE_TEXT[tone] : fallback;
}

// 祝日名のピル（赤）
export function HolidayPill({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300",
        className,
      )}
    >
      {name}
    </span>
  );
}

// 「今日」の印
export function TodayPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300",
        className,
      )}
    >
      今日
    </span>
  );
}

// 日付見出し（「10月2日 金曜日」＋祝日名＋今日）。日表示の見出しで使う。
export function DayHeading({ dateKey, isToday, className }: { dateKey: string; isToday: boolean; className?: string }) {
  const [, m, d] = dateKey.split("-").map(Number);
  const holiday = holidayName(dateKey);
  return (
    <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("text-xl font-bold tnum", toneText(dateKey, "text-ink"))}>
        {m}月{d}日
      </span>
      <span className={cn("text-sm font-semibold", toneText(dateKey, "text-ink-muted"))}>{WEEKDAY_JA[weekdayOfKey(dateKey)]}曜日</span>
      {holiday && <HolidayPill name={holiday} className="self-center" />}
      {isToday && <TodayPill className="self-center" />}
    </div>
  );
}
