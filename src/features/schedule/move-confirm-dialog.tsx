"use client";

import { useEffect, useState } from "react";
import { Repeat, ArrowRight, UserPlus, UserMinus, Inbox } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { fmtKeyShort } from "./filters";
import type { MoveInput, OccurrenceView, WorkerOption } from "./types";

// ドラッグ＆ドロップで動かしたときの確認ダイアログ。
// - 定期以外：日付・担当の変更内容を示して「移動する」を確認する
// - 定期（日付変更あり）：加えて「この回だけ／以降の定期も」を選ぶ（既定：この回だけ）
export function MoveConfirmDialog({
  open,
  occurrence,
  move,
  workers,
  onClose,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  occurrence: OccurrenceView | null;
  move: MoveInput | null;
  workers: WorkerOption[];
  onClose: () => void;
  onConfirm: (scope: "ONE" | "FOLLOWING", reason?: string) => void;
  pending?: boolean;
}) {
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setScope("ONE");
      setReason("");
    }
  }, [open]);

  if (!occurrence || !move) return null;
  const o = occurrence;
  const dateChanged = move.date !== o.date;
  const recurring = dateChanged && !!move.date && !!o.ruleKind && !!o.jobId;
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? id;
  const adds = (move.workerAdd ?? []).map(nameOf);
  const removes = (move.workerRemove ?? []).map(nameOf);

  const options: { key: "ONE" | "FOLLOWING"; title: string; desc: string }[] = [
    { key: "ONE", title: "この回だけ", desc: "今回の実施回だけを動かします。定期のルールと他の回は変わりません。" },
    {
      key: "FOLLOWING",
      title: "以降の定期も",
      desc: "定期のルールを新しい日付に合わせて更新し、以降の未確定（未割当・仮）の回も同じ規則で動かします。確定済み・完了の回は変わりません。",
    },
  ];

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title={recurring ? "定期の予定を移動" : "予定を移動しますか？"}>
      <div className="mb-3 rounded-xl bg-surface-subtle p-3 text-sm">
        <p className="flex items-center gap-1.5 font-bold text-ink">
          {o.ruleKind && <Repeat className="h-4 w-4 text-ink-muted" />}
          {o.title}
          {o.ruleSummary && <span className="text-xs font-semibold text-ink-muted">（{o.ruleSummary}）</span>}
        </p>
        {dateChanged && (
          <p className="mt-1 flex items-center gap-1.5 text-ink-soft">
            {o.date ? fmtKeyShort(o.date) : "日付未定"}
            <ArrowRight className="h-3.5 w-3.5 text-ink-faint" />
            {move.date ? (
              <span className="font-bold text-ink">{fmtKeyShort(move.date)}</span>
            ) : (
              <span className="flex items-center gap-1 font-bold text-amber-700">
                <Inbox className="h-3.5 w-3.5" />
                未割当へ戻す
              </span>
            )}
          </p>
        )}
        {adds.length > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-ink-soft">
            <UserPlus className="h-3.5 w-3.5 text-emerald-600" />
            担当に追加：<span className="font-bold text-ink">{adds.join("・")}</span>
          </p>
        )}
        {removes.length > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-ink-soft">
            <UserMinus className="h-3.5 w-3.5 text-red-500" />
            担当から外す：<span className="font-bold text-ink">{removes.join("・")}</span>
          </p>
        )}
        {o.assignees.length > 0 && dateChanged && (
          <p className="mt-1 text-xs text-ink-muted">担当者（{o.assignees.map((a) => a.name).join("・")}）に通知されます</p>
        )}
      </div>

      {recurring && (
        <div className="mb-3 space-y-2">
          {options.map((opt) => (
            <label
              key={opt.key}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                scope === opt.key ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-subtle",
              )}
            >
              <input type="radio" name="scope" checked={scope === opt.key} onChange={() => setScope(opt.key)} className="mt-1 h-4 w-4 text-brand-600" />
              <span>
                <span className="block text-sm font-bold text-ink">{opt.title}</span>
                <span className="block text-xs leading-relaxed text-ink-muted">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由（任意。履歴と通知に残ります）" maxLength={200} className="mb-4" />

      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        <Button type="button" className="flex-1" onClick={() => onConfirm(recurring ? scope : "ONE", reason.trim() || undefined)} disabled={pending}>
          {pending ? "移動中..." : "移動する"}
        </Button>
      </div>
    </Modal>
  );
}
