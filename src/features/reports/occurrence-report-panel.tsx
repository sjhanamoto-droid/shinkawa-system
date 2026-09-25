"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardList, Loader2, UserCheck } from "lucide-react";
import type { Actor } from "@/lib/permissions";
import { canViewAllReports, canWriteReportFor, REPORT_STATUS_LABEL } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { fmtKeyShort } from "@/features/schedule/filters";
import { getOccurrenceReportState } from "./actions";
import type { OccurrenceReportState } from "./queries";

// カレンダーの予定詳細に出す「日報」欄。担当者ごとに 提出済／下書き／未提出 と、書く・見るボタン。
export function OccurrenceReportPanel({ occurrenceId, me, refreshKey }: { occurrenceId: string; me: Actor; refreshKey: string }) {
  const [state, setState] = useState<OccurrenceReportState | null>(null);
  const [loading, start] = useTransition();

  useEffect(() => {
    start(async () => {
      const r = await getOccurrenceReportState(occurrenceId);
      setState(r.ok ? r.data.state : null);
    });
  }, [occurrenceId, refreshKey]);

  const viewAll = canViewAllReports(me);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-ink">
        <ClipboardList className="h-4 w-4 text-ink-muted" />
        日報
      </p>
      {loading && !state ? (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          読み込み中...
        </p>
      ) : !state || state.rows.length === 0 ? (
        <p className="rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-muted">担当者が決まると、担当者ごとに日報を書けます</p>
      ) : state.workDays.length === 0 ? (
        <p className="rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-muted">作業日になると日報を書けます</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {state.rows.flatMap((row) =>
            row.days.map((d) => {
              const mine = row.userId === me.id;
              const canWrite = canWriteReportFor(me, row.userId);
              const status = d.report?.status ?? null;
              let action: { href: string; label: string } | null = null;
              if (d.report && (mine || viewAll || canWrite)) {
                action = d.report.status === "DRAFT" && canWrite ? { href: `/reports/${d.report.id}/edit`, label: "続きを書く" } : { href: `/reports/${d.report.id}`, label: "見る" };
              } else if (!d.report && canWrite) {
                action = {
                  href: `/reports/new?occurrenceId=${occurrenceId}&userId=${row.userId}&date=${d.workDate}`,
                  label: mine ? "日報を書く" : "代理で書く",
                };
              }
              return (
                <li key={`${row.userId}-${d.workDate}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-ink">{row.userName}</span>
                    {!row.canLogin && <UserCheck className="ml-1 inline h-3.5 w-3.5 text-ink-faint" aria-label="ログインなし" />}
                    {state.workDays.length > 1 && <span className="ml-1.5 text-xs tnum text-ink-muted">{fmtKeyShort(d.workDate)}</span>}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      status === "SUBMITTED" ? "bg-emerald-50 text-emerald-700" : status === "DRAFT" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600",
                    )}
                  >
                    {status ? REPORT_STATUS_LABEL[status] : "未提出"}
                  </span>
                  {action && (
                    <Link
                      href={action.href}
                      className={cn(
                        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold",
                        d.report ? "text-brand-600 hover:bg-brand-50" : "bg-brand-600 text-white",
                      )}
                    >
                      {action.label}
                    </Link>
                  )}
                </li>
              );
            }),
          )}
        </ul>
      )}
    </div>
  );
}
