"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Inbox } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { AssigneePicker } from "./assignee-picker";
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

  useEffect(() => {
    if (!occurrence) return;
    setDate(occurrence.date ?? today);
    setUnassign(!occurrence.date);
    setAssignees(occurrence.assignees.map((a) => a.id));
    setReason("");
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

  function submit() {
    onSubmit({
      date: unassign ? null : date,
      workerAdd,
      workerRemove,
      scope: "ONE",
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="予定を移動" className="sm:max-w-lg">
      <p className="mb-3 text-sm font-bold text-ink">
        {occurrence.title}
        <span className="ml-2 text-xs font-semibold text-ink-muted">現在：{occurrence.date ? fmtKeyShort(occurrence.date) : "日付未定"}</span>
      </p>

      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setUnassign(false);
                  setDate(q.key);
                }}
                className={cn(
                  "h-9 rounded-full border px-3 text-xs font-bold",
                  !unassign && date === q.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft",
                )}
              >
                {q.label}
                <span className="ml-1 font-normal text-ink-faint">{q.key.slice(5).replace("-", "/")}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUnassign((v) => !v)}
              className={cn(
                "flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-bold",
                unassign ? "border-amber-500 bg-amber-50 text-amber-700" : "border-line-strong bg-surface text-ink-soft",
              )}
            >
              <Inbox className="h-3.5 w-3.5" />
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
        </div>

        <Field label="担当者" hint={`${assignees.length}名`}>
          <AssigneePicker workers={workers} value={assignees} onChange={setAssignees} department={occurrence.department} compact />
        </Field>

        <Field label="理由" htmlFor="move-reason" hint="任意。履歴と通知に残ります">
          <Input id="move-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：人員の組み替え／お客様都合" maxLength={200} />
        </Field>
      </div>

      <div className="mt-4 flex gap-2">
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
