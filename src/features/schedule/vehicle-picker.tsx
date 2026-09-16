"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VehicleOption, VehicleRef, VehicleUsage } from "./types";

// 使用車両の複数選択（チップをタップでトグル）。
// usage を渡すと「同じ日に他の予定でも使う車両」に印を付け、選択中なら注意文を出す（ブロックはしない。
// 午前・午後で使い回すことがあるため）。
export function VehiclePicker({
  vehicles,
  value,
  onChange,
  department,
  current = [],
  usage = null,
  loadingUsage = false,
}: {
  vehicles: VehicleOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** 指定すると、その部門（または共用）の車両を先頭に出す */
  department?: string | null;
  /** いま予定に付いている車両。無効化済みで選択肢に無いものも外せるように出す */
  current?: VehicleRef[];
  usage?: VehicleUsage | null;
  loadingUsage?: boolean;
}) {
  const items = useMemo(() => {
    const known = new Set(vehicles.map((v) => v.id));
    const extra = current.filter((c) => !known.has(c.id)).map((c) => ({ ...c, plateNumber: null, vehicleType: null, department: null, inactive: true }));
    const list = [...vehicles.map((v) => ({ ...v, inactive: false })), ...extra];
    return list.sort((a, b) => {
      const ad = department && a.department && a.department !== department ? 1 : 0;
      const bd = department && b.department && b.department !== department ? 1 : 0;
      return ad - bd;
    });
  }, [vehicles, current, department]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        車両が登録されていません。<Link href="/vehicles" className="font-bold text-brand-600">車両マスタ</Link>から追加できます。
      </p>
    );
  }

  const conflicts = value.filter((id) => (usage?.[id]?.length ?? 0) > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((v) => {
          const on = value.includes(v.id);
          const used = usage?.[v.id] ?? [];
          const otherDept = department && v.department && v.department !== department;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => toggle(v.id)}
              title={[v.vehicleType, v.plateNumber, used.length ? `同日: ${used.map((u) => u.title).join("・")}` : null].filter(Boolean).join(" / ") || undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border py-1 pl-2 pr-2.5 text-xs font-semibold transition-colors",
                on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
                otherDept && !on && "opacity-60",
                v.inactive && "border-dashed",
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: v.color }} />
              {v.name}
              {v.inactive && <span className="text-[10px] text-ink-faint">無効</span>}
              {used.length > 0 && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">同日{used.length}</span>}
              {on && <Check className="h-3 w-3" />}
            </button>
          );
        })}
      </div>
      {loadingUsage && (
        <p className="flex items-center gap-1 text-[11px] text-ink-faint">
          <Loader2 className="h-3 w-3 animate-spin" />
          同じ日の使用状況を確認中...
        </p>
      )}
      {conflicts.length > 0 && usage && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {conflicts.map((id) => {
            const v = items.find((x) => x.id === id);
            const list = usage[id] ?? [];
            return (
              <p key={id} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-bold">{v?.name ?? id}</span> は同じ日に
                  {list.map((u) => `「${u.startTime ? `${u.startTime} ` : ""}${u.title}」`).join("")}
                  でも使う予定です
                </span>
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
