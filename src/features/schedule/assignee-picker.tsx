"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { WORKER_KIND_LABEL, WORKER_KIND_OPTIONS, type WorkerKind } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getWorkerUsage } from "./actions";
import type { WorkerOption, WorkerUsage } from "./types";

/** その日に各作業者が入っている予定を取りに行く（date が無ければ取らない）。excludeId＝編集中の予定 */
export function useWorkerUsage(date: string | null, excludeId: string | null): { usage: WorkerUsage | null; loading: boolean } {
  const [usage, setUsage] = useState<WorkerUsage | null>(null);
  const [loading, start] = useTransition();
  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setUsage(null);
      return;
    }
    start(async () => {
      const r = await getWorkerUsage(date, excludeId);
      setUsage(r.ok ? r.data.usage : null);
    });
  }, [date, excludeId]);
  return { usage, loading };
}

// 担当者の複数選択（アバターをタップでトグル）。区分ごとにグループ、名前・タグで絞り込み。
// usage を渡すと、同じ日にすでに予定（休みを含む）が入っている人を赤枠で示す。1日2現場や夜勤もあるので選択は止めない。
export function AssigneePicker({
  workers,
  value,
  onChange,
  department,
  compact = false,
  usage = null,
  loadingUsage = false,
}: {
  workers: WorkerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** 指定すると、その部門（または部門なし）の作業者を先頭に出す */
  department?: string | null;
  compact?: boolean;
  usage?: WorkerUsage | null;
  loadingUsage?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim();
    const list = workers.filter((w) => !t || w.name.includes(t) || w.tags.some((x) => x.includes(t)) || (w.partnerName ?? "").includes(t));
    return list.sort((a, b) => {
      const ad = department && a.department && a.department !== department ? 1 : 0;
      const bd = department && b.department && b.department !== department ? 1 : 0;
      return ad - bd;
    });
  }, [workers, q, department]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const busySelected = value.filter((id) => (usage?.[id]?.length ?? 0) > 0);
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? id;

  const groups = WORKER_KIND_OPTIONS.map((k) => ({ kind: k, items: filtered.filter((w) => w.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2">
        <Search className="h-3.5 w-3.5 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前・タグ・会社名で絞り込み"
          className="h-full min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
        />
        {value.length > 0 && <span className="text-[11px] font-bold text-brand-600">{value.length}名</span>}
      </div>
      <div className={cn("space-y-2 overflow-y-auto", compact ? "max-h-56" : "max-h-72")}>
        {groups.map((g) => (
          <div key={g.kind}>
            <p className="mb-1 text-[11px] font-bold text-ink-faint">{WORKER_KIND_LABEL[g.kind as WorkerKind]}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((w) => {
                const on = value.includes(w.id);
                const otherDept = department && w.department && w.department !== department;
                const busy = usage?.[w.id] ?? [];
                const off = busy.some((u) => u.off);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => toggle(w.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-semibold transition-colors",
                      on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
                      busy.length > 0 && "border-red-400 ring-1 ring-red-400",
                      otherDept && !on && "opacity-60",
                    )}
                    title={[w.partnerName, busy.length ? `同日: ${busy.map((u) => `${u.startTime ? `${u.startTime} ` : ""}${u.title}`).join("・")}` : null].filter(Boolean).join(" / ") || undefined}
                  >
                    <Avatar name={w.name} color={w.avatarColor} image={w.avatarUrl} size="sm" className="!h-6 !w-6 !text-[10px]" />
                    {w.name}
                    {busy.length > 0 && (
                      <span className="rounded bg-red-100 px-1 text-[10px] font-bold text-red-600">{off ? "休み" : `現場${busy.length}`}</span>
                    )}
                    {on && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-xs text-ink-muted">該当する作業者がいません</p>}
      </div>
      {loadingUsage && (
        <p className="flex items-center gap-1 text-[11px] text-ink-faint">
          <Loader2 className="h-3 w-3 animate-spin" />
          同じ日の予定を確認中...
        </p>
      )}
      {usage && busySelected.length > 0 && (
        <div className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {busySelected.map((id) => (
            <p key={id} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-bold">{nameOf(id)}</span> は同じ日に
                {(usage[id] ?? []).map((u) => `「${u.startTime ? `${u.startTime} ` : ""}${u.title}」`).join("")}
                が入っています
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
