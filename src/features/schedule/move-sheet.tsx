"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Inbox } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { AssigneePicker, useWorkerUsage } from "./assignee-picker";
import { shiftKey, fmtKeyShort } from "./filters";
import type { MoveInput, OccurrenceView, WorkerOption } from "./types";

// スマホ向け「移動」シート（PC でも使える）。日付・担当を変えて moveOccurrence を呼ぶ。
export function MoveSheet({
  open,
  occurrence,
  workers,
  today,
  onClose,
  onSubmit,
  pending = false,
}: {
  open: boolean;
  occurrence: OccurrenceView | null;
  workers: WorkerOption[];
  today: string;
  onClose: () => void;
  onSubmit: (move: MoveInput) => void;
  pending?: boolean;
}) {
  const [date, setDate] = useState<string>("");
  const [unassign, setUnassign] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState(""); // 日付未定の工事・スポットを期間で入れるときの終了日（任意）
  const workerUsage = useWorkerUsage(occurrence && !unassign ? date : null, occurrence?.id ?? null);

  useEffect(() => {
    if (!occurrence) return;
    setDate(occurrence.date ?? today);
    setUnassign(!occurrence.date);
    setAssignees(occurrence.assignees.map((a) => a.id));
    setReason("");
    setEndDate("");
  }, [occurrence, today]);

  if (!occurrence) return null;
  const base = occurrence.date ?? today;
  const quick: { label: string; key: string }[] = [
    { label: "−1日", key: shiftKey(base, -1) },
    { label: "＋1日", key: shiftKey(base, 1) },
    { label: "翌週", key: shiftKey(base, 7) },
    { label: "今日", key: today },
    { label: "明日", key: shiftKey(today, 1) },
  ];
  const before = occurrence.assignees.map((a) => a.id);
  const workerAdd = assignees.filter((id) => !before.includes(id));
  const workerRemove = before.filter((id) => !assignees.includes(id));

  const canPeriod = !occurrence.date && !occurrence.ruleKind && !unassign;
  function submit() {
    onSubmit({
      date: unassign ? null : date,
      endDate: canPeriod && endDate && endDate > date ? endDate : null,
      workerAdd,
      workerRemove,
      scope: "ONE",
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="予定を移動" className="sm:max-w-lg">
      <div className="mb-4 rounded-xl bg-surface-subtle p-3">
        <p className="break-words text-base font-bold leading-snug text-ink">{occurrence.title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">現在：{occurrence.date ? fmtKeyShort(occurrence.date) : "日付未定"}</p>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setUnassign(false);
                  setDate(q.key);
                }}
                className={cn(
                  "h-11 rounded-full border px-3.5 text-sm font-bold",
                  !unassign && date === q.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft",
                )}
              >
                {q.label}
                <span className="ml-1 text-xs font-normal tnum text-ink-muted">{q.key.slice(5).replace("-", "/")}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUnassign((v) => !v)}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold",
                unassign ? "border-amber-500 bg-amber-50 text-amber-700" : "border-line-strong bg-surface text-ink-soft",
              )}
            >
              <Inbox className="h-4 w-4" />
              未割当へ戻す
            </button>
          </div>
          {!unassign && (
            <Field label="日付" htmlFor="move-date">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-9" />
              </div>
            </Field>
          )}
          {canPeriod && (
            <Field label="終了日" htmlFor="move-end" hint="期間で入れるとき（任意）。1日ずつの予定に分かれます">
              <Input id="move-end" type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          )}
        </div>

        <Field label="担当者" hint={`${assignees.length}名`}>
          <AssigneePicker workers={workers} value={assignees} onChange={setAssignees} department={occurrence.department} compact usage={workerUsage.usage} loadingUsage={workerUsage.loading} />
        </Field>

        <Field label="理由" htmlFor="move-reason" hint="任意。履歴と通知に残ります">
          <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：人員の組み替え／お客様都合" maxLength={200} />
        </Field>
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        <Button type="button" className="flex-1" onClick={submit} disabled={pending || (!unassign && !/^\d{4}-\d{2}-\d{2}$/.test(date))}>
          {pending ? "移動中..." : "移動する"}
        </Button>
      </div>
    </Modal>
  );
}
