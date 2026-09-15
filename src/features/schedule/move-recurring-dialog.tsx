"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtKeyShort } from "./filters";
import type { OccurrenceView } from "./types";

// 定期の実施回を動かしたときの確認：この回だけ／以降の定期も。既定は「この回だけ」。
export function MoveRecurringDialog({
  open,
  occurrence,
  toDate,
  onClose,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  occurrence: OccurrenceView | null;
  toDate: string | null;
  onClose: () => void;
  onConfirm: (scope: "ONE" | "FOLLOWING") => void;
  pending?: boolean;
}) {
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  if (!occurrence) return null;
  const from = occurrence.date ? fmtKeyShort(occurrence.date) : "日付未定";
  const to = toDate ? fmtKeyShort(toDate) : "日付未定";

  const options: { key: "ONE" | "FOLLOWING"; title: string; desc: string }[] = [
    { key: "ONE", title: "この回だけ", desc: "今回の実施回だけを動かします。定期のルールと他の回は変わりません。" },
    {
      key: "FOLLOWING",
      title: "以降の定期も",
      desc: `定期のルールを新しい日付に合わせて更新し、以降の未確定（未割当・仮）の回も同じ規則で動かします。確定済み・完了の回は変わりません。`,
    },
  ];

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title="定期の予定を移動">
      <div className="mb-3 rounded-xl bg-surface-subtle p-3 text-sm">
        <p className="flex items-center gap-1.5 font-bold text-ink">
          <Repeat className="h-4 w-4 text-ink-muted" />
          {occurrence.title}
          {occurrence.ruleSummary && <span className="text-xs font-semibold text-ink-muted">（{occurrence.ruleSummary}）</span>}
        </p>
        <p className="mt-1 text-ink-soft">
          {from} → <span className="font-bold text-ink">{to}</span>
        </p>
      </div>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
              scope === o.key ? "border-brand-500 bg-brand-50" : "border-line hover:bg-surface-subtle",
            )}
          >
            <input type="radio" name="scope" checked={scope === o.key} onChange={() => setScope(o.key)} className="mt-1 h-4 w-4 text-brand-600" />
            <span>
              <span className="block text-sm font-bold text-ink">{o.title}</span>
              <span className="block text-xs leading-relaxed text-ink-muted">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
          キャンセル
        </Button>
        <Button type="button" className="flex-1" onClick={() => onConfirm(scope)} disabled={pending}>
          {pending ? "移動中..." : "移動する"}
        </Button>
      </div>
    </Modal>
  );
}
