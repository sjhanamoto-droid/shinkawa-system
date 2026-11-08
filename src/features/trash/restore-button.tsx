"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { restoreMedia } from "./actions";

export function RestoreButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const r = await restoreMedia(id);
            if (r.error) setError(r.error);
            else {
              toast("元に戻しました");
              router.refresh();
            }
          })
        }
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-brand-700 hover:bg-surface-subtle disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        元に戻す
      </button>
      {error && <p className="mt-1 max-w-[12rem] text-xs font-semibold text-status-danger">{error}</p>}
    </div>
  );
}
