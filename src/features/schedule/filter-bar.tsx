"use client";

import { useCategories } from "@/components/category-provider";
import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  DEPARTMENT_LABEL,
  OCCURRENCE_STATUS_LABEL,
  OCCURRENCE_STATUS_FILTER_OPTIONS,
  WORKER_KIND_LABEL,
  type WorkerKind,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CustomerOption, FilterState, WorkerOption } from "./types";

const selectClass =
  "h-10 min-w-0 rounded-xl border border-line-strong bg-surface px-2.5 text-sm font-semibold text-ink-soft focus:border-brand-400 focus:outline-none";

export function FilterBar({
  filters,
  workers,
  customers,
  onChange,
  showMine,
}: {
  filters: FilterState;
  workers: WorkerOption[];
  customers: CustomerOption[];
  onChange: (patch: Partial<FilterState>) => void;
  showMine: boolean;
}) {
  const categories = useCategories();
  const [q, setQ] = useState(filters.q);
  const active =
    !!filters.worker || !!filters.category || !!filters.customer || !!filters.status || !!filters.q;

  const kinds = Array.from(new Set(workers.map((w) => w.kind)));

  return (
    <div className="space-y-2">
      {/* 部門タブ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface-sunken p-1">
          {(["ALL", "CLEANING", "CONSTRUCTION"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ dept: d })}
              className={cn(
                "h-9 rounded-full px-3.5 text-sm font-bold transition-colors",
                filters.dept === d ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft",
              )}
            >
              {d === "ALL" ? "全体" : DEPARTMENT_LABEL[d]}
            </button>
          ))}
        </div>
        {showMine && (
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-ink-soft">
            <input
              type="checkbox"
              checked={filters.mine}
              onChange={(e) => onChange({ mine: e.target.checked })}
              className="h-4 w-4 rounded border-line-strong text-brand-600"
            />
            自分の予定
          </label>
        )}
        <form
          className="flex h-11 min-w-[12rem] flex-1 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 focus-within:border-brand-400 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ q: q.trim() });
          }}
        >
          <Search className="h-4 w-4 shrink-0 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="顧客名・物件名で検索"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {q && (
            <button
              type="button"
              aria-label="クリア"
              onClick={() => {
                setQ("");
                onChange({ q: "" });
              }}
              className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-ink-faint hover:text-ink-soft"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass} value={filters.worker ?? ""} onChange={(e) => onChange({ worker: e.target.value || null })} aria-label="担当者">
          <option value="">担当者：すべて</option>
          {kinds.map((k) => (
            <optgroup key={k} label={WORKER_KIND_LABEL[k as WorkerKind] ?? k}>
              {workers
                .filter((w) => w.kind === k)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.partnerName ? `（${w.partnerName}）` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select className={selectClass} value={filters.category ?? ""} onChange={(e) => onChange({ category: e.target.value || null })} aria-label="種別">
          <option value="">種別：すべて</option>
          {categories.filter((c) => c.active || c.key === filters.category).map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "max-w-[180px]")} value={filters.customer ?? ""} onChange={(e) => onChange({ customer: e.target.value || null })} aria-label="顧客">
          <option value="">顧客：すべて</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={selectClass} value={filters.status ?? ""} onChange={(e) => onChange({ status: e.target.value || null })} aria-label="状態">
          <option value="">状態：すべて</option>
          {OCCURRENCE_STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {OCCURRENCE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              onChange({ worker: null, category: null, customer: null, status: null, q: "" });
            }}
            className="h-10 rounded-xl px-3 text-sm font-semibold text-brand-600 hover:bg-surface-sunken"
          >
            絞り込みを解除
          </button>
        )}
      </div>
    </div>
  );
}
