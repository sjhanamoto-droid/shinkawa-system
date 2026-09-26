"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { AUDIENCE_ROLE_OPTIONS } from "@/lib/announcements";
import { cn } from "@/lib/utils";

export const chipClass = (on: boolean) =>
  cn(
    "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors",
    on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-subtle",
  );

/**
 * 宛先の選択（全員／役割を複数）。hidden input name="audience" を出す。
 * roleCounts: 役割ごとの届く人数。onChange で合計人数と「何か選んでいるか」を返す。
 */
export function AudiencePicker({
  roleCounts,
  onChange,
}: {
  roleCounts: Record<Role, number>;
  onChange: (count: number, selected: boolean) => void;
}) {
  const [all, setAll] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const total = AUDIENCE_ROLE_OPTIONS.reduce((s, r) => s + roleCounts[r], 0);
  const count = all ? total : roles.reduce((s, r) => s + roleCounts[r], 0);
  const selected = all || roles.length > 0;

  useEffect(() => {
    onChange(count, selected);
  }, [count, selected, onChange]);

  function toggleRole(r: Role) {
    setAll(false);
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setAll(true); setRoles([]); }} className={chipClass(all)} aria-pressed={all}>
          全員<span className="text-xs font-semibold opacity-80">{total}名</span>
        </button>
        {AUDIENCE_ROLE_OPTIONS.map((r) => {
          const on = !all && roles.includes(r);
          return (
            <button key={r} type="button" onClick={() => toggleRole(r)} className={chipClass(on)} aria-pressed={on}>
              {ROLE_LABEL[r]}
              <span className="text-xs font-semibold opacity-80">{roleCounts[r]}名</span>
            </button>
          );
        })}
      </div>
      {all ? <input type="hidden" name="audience" value="ALL" /> : roles.map((r) => <input key={r} type="hidden" name="audience" value={r} />)}
    </>
  );
}
