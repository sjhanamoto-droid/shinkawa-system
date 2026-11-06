import { AlarmClock, CalendarClock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTimeRange, LATE_ENTRY_DAYS, type ReportEntryFlags } from "@/lib/reports";
import { Card } from "@/components/ui/card";

// 日報の「入力の記録」。開始・終了時刻は手で直せるため、いつ入力・提出したか（システムの時刻）と、
// 提出後に時刻を直した履歴を並べて、稼働時間を確認できるようにする。最高管理者・事務だけに出す（呼び出し側で判定）。

/** 年まで入れた日時（日本時間）。入力の記録は年をまたいで見返すことがある */
function fmtStamp(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** 確認したほうがよい点の印（稼働時間の一覧・日報の詳細で使う） */
export function EntryFlagBadges({ flags, className }: { flags: ReportEntryFlags; className?: string }) {
  if (!flags.late && !flags.beforeEnd && flags.timeEdits === 0) return null;
  const badge = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold";
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {flags.late && (
        <span className={cn(badge, "bg-amber-50 text-amber-800")}>
          <CalendarClock className="h-3.5 w-3.5" />
          後から入力（{flags.delayDays}日後）
        </span>
      )}
      {flags.beforeEnd && (
        <span className={cn(badge, "bg-red-50 text-red-700")}>
          <AlarmClock className="h-3.5 w-3.5" />
          終了前に提出
        </span>
      )}
      {flags.timeEdits > 0 && (
        <span className={cn(badge, "bg-violet-50 text-violet-700")}>
          <History className="h-3.5 w-3.5" />
          時刻を修正{flags.timeEdits > 1 ? `（${flags.timeEdits}回）` : ""}
        </span>
      )}
    </span>
  );
}

export type EntryRecordData = {
  createdAt: Date;
  submittedAt: Date | null;
  updatedAt: Date;
  timeLogs: { id: string; from: readonly [string, string]; to: readonly [string, string]; at: Date; by: string }[];
  flags: ReportEntryFlags;
};

export function EntryRecord({ record }: { record: EntryRecordData }) {
  const { flags } = record;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3 px-4 py-2.5 text-sm">
      <span className="w-24 shrink-0 text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 text-ink tnum">{value}</span>
    </div>
  );
  return (
    <div className="space-y-2">
      <Card className="divide-y divide-line overflow-hidden">
        {row("最初の入力", fmtStamp(record.createdAt))}
        {row(
          "提出",
          record.submittedAt ? (
            <>
              {fmtStamp(record.submittedAt)}
              {flags.delayDays !== null && flags.delayDays > 0 && <span className="ml-1.5 text-ink-muted">（作業日の{flags.delayDays}日後）</span>}
            </>
          ) : (
            <span className="text-ink-muted">未提出（下書き）</span>
          ),
        )}
        {row("最終更新", fmtStamp(record.updatedAt))}
        {row(
          "時刻の修正",
          record.timeLogs.length === 0 ? (
            <span className="text-ink-muted">なし</span>
          ) : (
            <ol className="space-y-1.5">
              {record.timeLogs.map((l) => (
                <li key={l.id}>
                  <span className="font-semibold">{fmtTimeRange(l.from[0], l.from[1])}</span>
                  <span className="mx-1 text-ink-muted">→</span>
                  <span className="font-semibold">{fmtTimeRange(l.to[0], l.to[1])}</span>
                  <span className="block text-xs text-ink-muted">
                    {fmtStamp(l.at)}・{l.by}
                  </span>
                </li>
              ))}
            </ol>
          ),
        )}
      </Card>
      <p className="px-1 text-xs text-ink-faint">
        日時はシステムが自動で記録したもので、あとから変えられません。作業日の{LATE_ENTRY_DAYS}日以上あとの提出、当日の終了時刻より前の提出、提出後の時刻の修正に印が付きます。最高管理者・事務だけに表示しています。
      </p>
    </div>
  );
}
