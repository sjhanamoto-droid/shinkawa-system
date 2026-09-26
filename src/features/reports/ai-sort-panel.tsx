"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Sparkles, X } from "lucide-react";
import { Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { VoiceInputButton } from "./voice-input-button";
import { sortReportMemo } from "./ai-sort";

/** 「AIでまとめる」を押したときだけ開く欄。話した・書いたメモを作業内容と引き継ぎ事項に分け、確認してから入れる */
export function AiSortPanel({
  onApply,
  onClose,
}: {
  onApply: (r: { detail: string; handover: string }) => void;
  onClose: () => void;
}) {
  const [memo, setMemo] = useState("");
  const [result, setResult] = useState<{ detail: string; handover: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    setResult(null);
    startTransition(async () => {
      const r = await sortReportMemo(memo);
      if (r.ok) setResult({ detail: r.detail, handover: r.handover });
      else setMessage(r.message);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-700">
          <Sparkles className="h-4 w-4" />
          AIでまとめる
        </p>
        <button type="button" onClick={onClose} aria-label="閉じる" className="-m-1 rounded-lg p-1 text-ink-muted hover:bg-surface-sunken">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-ink-muted">やったことや伝えたいことを話すか書いてください。AIが「作業内容」と「引き継ぎ事項」に分けます。</p>

      <Textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="例）今日は3階まで共用部の床洗浄とワックス。エントランスのガラスも拭いた。3階廊下の電球が切れてたので次の人は替えの電球を持ってきてください。"
        className="min-h-[110px] bg-surface"
        maxLength={4000}
        disabled={pending}
      />

      <div className="flex flex-wrap items-center gap-2">
        <VoiceInputButton onAppend={(t) => setMemo((prev) => (prev ? `${prev}${/[。、\s]$/.test(prev) ? "" : "。"}${t}` : t))} />
        <button type="button" onClick={run} disabled={pending || !memo.trim()} className={buttonClass({ size: "sm", className: "ml-auto" })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {pending ? "振り分け中..." : "振り分ける"}
        </button>
      </div>

      {message && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {message}
        </p>
      )}

      {result && (
        <div className="space-y-2">
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink-soft">作業内容</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{result.detail || <span className="text-ink-muted">なし</span>}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink-soft">引き継ぎ事項</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{result.handover || <span className="text-ink-muted">なし</span>}</p>
          </div>
          <button type="button" onClick={() => onApply(result)} className={buttonClass({ size: "sm", className: "w-full" })}>
            <Check className="h-4 w-4" />
            この内容を各欄に入れる
          </button>
          <p className="text-[11px] text-ink-faint">入れたあとも各欄で直せます。すでに書いてある内容は消さずに、後ろに足します。</p>
        </div>
      )}
    </div>
  );
}
