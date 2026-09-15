"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Send, Loader2 } from "lucide-react";
import { addHandover, resolveHandover, reopenHandover } from "./handover-actions";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { jstDateTimeLabel } from "@/lib/date";
import { cn } from "@/lib/utils";

export type HandoverRow = {
  id: string;
  content: string;
  createdAt: string;
  createdByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
};

export function HandoverPanel({ propertyId, items }: { propertyId: string; items: HandoverRow[] }) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const open = items.filter((h) => !h.resolvedAt);
  const closed = items.filter((h) => h.resolvedAt);

  function submit() {
    const t = draft.trim();
    if (!t) return;
    start(async () => {
      const r = await addHandover(propertyId, t);
      if (r?.error) toast(r.error, { type: "error" });
      else setDraft("");
    });
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="次に入る人への申し送り（例：3階の廊下、電球切れ。管理会社へ連絡済み）" className="min-h-[72px]" maxLength={1000} />
        <button type="button" onClick={submit} disabled={pending || !draft.trim()} className={buttonClass({ size: "sm", className: "w-full" })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          引き継ぎを残す
        </button>
      </Card>
      {open.length === 0 ? (
        <p className="px-1 text-xs text-ink-muted">未解決の引き継ぎはありません</p>
      ) : (
        <div className="space-y-2">
          {open.map((h) => (
            <div key={h.id} className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm text-ink">{h.content}</p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {h.createdByName ?? "—"} ・ {jstDateTimeLabel(h.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => start(async () => void (await resolveHandover(h.id)))}
                disabled={pending}
                className={cn("flex h-9 shrink-0 items-center gap-1 rounded-lg bg-surface px-2.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50")}
              >
                <CheckCircle2 className="h-4 w-4" />
                確認して停止
              </button>
            </div>
          ))}
        </div>
      )}
      {closed.length > 0 && (
        <details className="group rounded-xl border border-line bg-surface text-xs">
          <summary className="cursor-pointer list-none px-3 py-2 font-bold text-ink-muted [&::-webkit-details-marker]:hidden">解決済み（{closed.length}）</summary>
          <div className="divide-y divide-line border-t border-line">
            {closed.map((h) => (
              <div key={h.id} className="flex items-start gap-2 px-3 py-2 text-ink-muted">
                <p className="min-w-0 flex-1 whitespace-pre-wrap line-through decoration-ink-faint">{h.content}</p>
                <button type="button" onClick={() => start(async () => void (await reopenHandover(h.id)))} className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-faint hover:text-ink-soft">
                  <RotateCcw className="h-3 w-3" />
                  戻す
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
