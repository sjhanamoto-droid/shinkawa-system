"use client";

import { useState, useTransition } from "react";
import { Power, Trash2, Loader2 } from "lucide-react";
import { toggleVehicleActive, deleteVehicle } from "./actions";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function VehicleRowActions({ id, active, canDelete }: { id: string; active: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await toggleVehicleActive(id); if (r.error) toast(r.error, { type: "error" }); })}
        className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50", active ? "text-ink-muted hover:bg-surface-sunken" : "bg-emerald-50 text-emerald-700")}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
        {active ? "無効化" : "有効化"}
      </button>
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 3000); return; }
            start(async () => { const r = await deleteVehicle(id); if (r && "error" in r && r.error) toast(r.error, { type: "error" }); });
          }}
          aria-label="削除"
          className={cn("flex h-8 items-center justify-center rounded-lg px-2 text-xs font-semibold", confirm ? "bg-red-600 text-white" : "text-ink-faint hover:bg-red-50 hover:text-status-danger")}
        >
          <Trash2 className="h-4 w-4" />{confirm && "もう一度で削除"}
        </button>
      )}
    </div>
  );
}
