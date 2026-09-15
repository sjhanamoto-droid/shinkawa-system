"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { generateOccurrences } from "@/features/schedule/generate-actions";
import { useToast } from "@/components/ui/toast";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GenerateButton({
  months,
  jobId,
  department,
  size = "sm",
}: {
  months: { ym: string; label: string }[];
  jobId?: string;
  department?: string;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  function run(ym: string) {
    start(async () => {
      const r = await generateOccurrences({ month: ym, jobId, department });
      if (!r.ok) {
        toast(r.error, { type: "error" });
        return;
      }
      const msg = `${ym.replace("-", "年")}月分：${r.data.created}件を生成${r.data.skipped ? `（${r.data.skipped}件は生成済み）` : ""}`;
      setLast(msg);
      toast(msg);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {months.map((m) => (
        <button key={m.ym} type="button" disabled={pending} onClick={() => run(m.ym)} className={cn(buttonClass({ variant: "outline", size }))}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {m.label}
        </button>
      ))}
      {last && <span className="text-xs text-ink-muted">{last}</span>}
    </div>
  );
}
