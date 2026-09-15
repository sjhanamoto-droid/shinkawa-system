"use client";

import { useState, useTransition } from "react";
import { Zap, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { quickEntry } from "./quick-entry-actions";
import type { OccurrenceView } from "./types";

// 電話の速報メモを1行で仮登録。「9/24 直井さん 1人」→ 仮予定（日付が無ければ未割当）。
export function QuickEntry({ onCreated }: { onCreated: (o: OccurrenceView, unresolvedCustomer: boolean) => void }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  function submit() {
    const t = text.trim();
    if (!t || pending) return;
    start(async () => {
      const r = await quickEntry(t);
      if (!r.ok) {
        toast(r.error, { type: "error" });
        return;
      }
      setText("");
      const o = r.data.occurrence;
      toast(`${o.date ? o.date.slice(5).replace("-", "/") : "日付未定"} ${o.title} を${o.date ? "仮登録" : "未割当に追加"}しました`);
      onCreated(o, r.data.unresolvedCustomer);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface pl-3 pr-1 shadow-sm focus-within:border-brand-400"
    >
      <Zap className="h-4 w-4 shrink-0 text-amber-500" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="速報メモから仮登録：例「9/24 直井さん 1人」"
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        disabled={pending}
        maxLength={300}
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="flex h-8 items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        仮登録
      </button>
    </form>
  );
}
