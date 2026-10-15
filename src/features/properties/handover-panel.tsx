"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, History, RotateCcw, Send, Loader2 } from "lucide-react";
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
      <Card className="space-y-2.5 p-4">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="次に入る人への申し送り（例：3階の廊下、電球切れ。管理会社へ連絡済み）" className="min-h-[80px] text-[15px]" maxLength={1000} />
        <button type="button" onClick={submit} disabled={pending || !draft.trim()} className={buttonClass({ size: "md", className: "w-full" })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          引き継ぎを残す
        </button>
      </Card>
      {open.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">未解決の引き継ぎはありません</p>
      ) : (
        <ol className="space-y-3">
          {open.map((h) => (
            <li key={h.id} className="card overflow-hidden border-l-4 border-l-amber-400">
              <div className="px-4 pb-3 pt-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  未解決
                </p>
                {/* 未解決の引き継ぎは長文でも畳まず全文を出す */}
                <p className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed text-ink">{h.content}</p>
                <p className="mt-2 text-xs text-ink-muted tnum">
                  {h.createdByName ?? "—"} ・ {jstDateTimeLabel(h.createdAt)}
                </p>
              </div>
              <div className="border-t border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => start(async () => void (await resolveHandover(h.id)))}
                  disabled={pending}
                  className={buttonClass({ variant: "outline", size: "md", className: "w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300" })}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  確認して停止
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {closed.length > 0 && (
        <details className="card group overflow-hidden">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-ink-soft hover:bg-surface-subtle [&::-webkit-details-marker]:hidden">
            <History className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            解決済み
            <span className="rounded-full bg-surface-sunken px-1.5 text-xs font-bold text-ink-muted tnum">{closed.length}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {closed.map((h) => (
              <li key={h.id} className="flex items-start gap-2 px-4 py-3">
                <ClampedText text={h.content} className="text-sm leading-relaxed text-ink-muted line-through decoration-ink-faint" toggleClassName="text-brand-600" />
                <button type="button" onClick={() => start(async () => void (await reopenHandover(h.id)))} className="-my-1.5 flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink-soft">
                  <RotateCcw className="h-3.5 w-3.5" />
                  戻す
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 4行を超える長文は畳み、「全文を表示」で開く（長い文章で画面が埋まらないように） */
export function ClampedText({ text, className, toggleClassName }: { text: string; className?: string; toggleClassName?: string }) {
  const [expanded, setExpanded] = useState(false);
  // 行数は折り返し幅に依存するので、改行数と文字数でおおよそ判定する
  const long = text.split(/\r?\n/).length > 4 || text.length > 120;
  return (
    <div className="min-w-0 flex-1">
      <p className={cn("whitespace-pre-wrap break-words", long && !expanded && "line-clamp-4", className)}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn("mt-1 inline-flex min-h-[32px] items-center gap-0.5 text-xs font-bold", toggleClassName)}
        >
          {expanded ? "たたむ" : "全文を表示"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
        </button>
      )}
    </div>
  );
}
