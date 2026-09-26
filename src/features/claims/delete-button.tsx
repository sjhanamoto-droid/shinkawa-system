"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { deleteClaim } from "./actions";

/** 削除（1回目で確認表示、もう一度押すと削除） */
export function DeleteClaimButton({ id }: { id: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm) {
          setConfirm(true);
          setTimeout(() => setConfirm(false), 3000);
          return;
        }
        start(async () => {
          const r = await deleteClaim(id);
          if (r?.error) toast(r.error, { type: "error" });
        });
      }}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50",
        confirm ? "bg-red-600 text-white" : "text-ink-muted hover:bg-red-50 hover:text-status-danger",
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      {confirm ? "もう一度押すと削除します" : "削除"}
    </button>
  );
}
