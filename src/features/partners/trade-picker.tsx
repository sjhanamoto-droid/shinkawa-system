"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 業種の複数選択。タップで切り替え、一覧に無い業種は入力して追加できる（name="trades" に JSON で送る） */
export function TradePicker({ options, defaultValue = [] }: { options: string[]; defaultValue?: string[] }) {
  const [value, setValue] = useState<string[]>(defaultValue);
  const [extra, setExtra] = useState<string[]>(() => defaultValue.filter((t) => !options.includes(t)));
  const [text, setText] = useState("");
  const all = [...options, ...extra];

  function toggle(t: string) {
    setValue((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  }
  function add() {
    const t = text.trim().slice(0, 20);
    if (!t) return;
    if (!all.includes(t)) setExtra((e) => [...e, t]);
    setValue((v) => (v.includes(t) ? v : [...v, t]));
    setText("");
  }

  return (
    <div className="space-y-2.5">
      <input type="hidden" name="trades" value={JSON.stringify(value)} />
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = value.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              aria-pressed={on}
              className={cn(
                "flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-sm font-semibold transition-colors",
                on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
              )}
            >
              {t}
              {on && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="一覧に無い業種を入力（例：防水）"
          maxLength={20}
          aria-label="業種を追加"
        />
        <Button type="button" variant="outline" onClick={add} disabled={!text.trim()} className="shrink-0">
          <Plus className="h-4 w-4" />追加
        </Button>
      </div>
    </div>
  );
}
