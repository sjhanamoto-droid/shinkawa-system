"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// 検索して選ぶセレクト（顧客300社・物件600件など、<select> では探せない件数向け）。
// - 入力すると label / sub / keywords を部分一致で絞り込む（ひらがな・カタカナ・大小文字・空白の違いは無視）
// - ↑↓ で移動、Enter で確定、Esc で閉じる。× で解除
// - フォーム送信用に hidden input を出す（name）

export type SearchOption = {
  value: string;
  label: string;
  sub?: string | null;
  keywords?: string | null;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]/g, "")
    // カタカナ → ひらがな
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    // 全角英数 → 半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

const MAX_SHOWN = 60;

export function SearchSelect({
  id,
  name,
  options,
  value,
  onChange,
  placeholder = "名前で検索",
  emptyLabel = "未選択",
  required = false,
  disabled = false,
  className,
}: {
  id?: string;
  name?: string;
  options: SearchOption[];
  value: string;
  onChange: (value: string, option: SearchOption | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options.slice(0, MAX_SHOWN);
    const scored = options
      .map((o) => {
        const label = normalize(o.label);
        const sub = normalize(o.sub ?? "");
        const kw = normalize(o.keywords ?? "");
        let score = -1;
        if (label.startsWith(q)) score = 3;
        else if (label.includes(q)) score = 2;
        else if (sub.includes(q) || kw.includes(q)) score = 1;
        return { o, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_SHOWN).map((x) => x.o);
  }, [options, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(o: SearchOption | null) {
    onChange(o?.value ?? "", o);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const showText = open ? query : (selected?.label ?? "");

  return (
    <div ref={wrapRef} className={cn("relative w-full min-w-0", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="relative">
        {open ? (
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        ) : null}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={showText}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border border-line-strong bg-surface pr-16 text-[16px] text-ink placeholder:text-ink-faint transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-sunken disabled:text-ink-muted",
            open ? "pl-10" : "pl-3.5",
            !open && !selected && "text-ink-faint",
          )}
        />
        {/* 必須のネイティブ検証用（表示しない） */}
        {required && (
          <input
            tabIndex={-1}
            aria-hidden
            required
            value={value}
            onChange={() => {}}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
        )}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {selected && !disabled && (
            <button
              type="button"
              aria-label="選択を解除"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                choose(null);
                inputRef.current?.focus();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:bg-surface-sunken hover:text-ink-soft"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="pointer-events-none h-4 w-4 text-ink-muted" />
        </div>
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-float"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(null)}
              className={cn("flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-subtle", value === "" && "font-bold")}
            >
              {emptyLabel}
            </button>
          </li>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-muted">「{query}」に一致するものがありません</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    i === active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-surface-subtle",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-ink-muted">{o.sub}</span>}
                  </span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            ))
          )}
          {options.length > MAX_SHOWN && filtered.length >= MAX_SHOWN && (
            <li className="px-3 py-1.5 text-[11px] text-ink-faint">先頭 {MAX_SHOWN} 件を表示中。入力して絞り込んでください</li>
          )}
        </ul>
      )}
    </div>
  );
}
