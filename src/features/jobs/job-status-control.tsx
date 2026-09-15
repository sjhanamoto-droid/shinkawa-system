"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setJobStatus, deleteJob } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { JOB_STATUS_LABEL, JOB_STATUS_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function JobStatusControl({ jobId, status, jobName }: { jobId: string; status: string; jobName: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {JOB_STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending || s === status}
            onClick={() => start(async () => { const r = await setJobStatus(jobId, s); if (r.error) toast(r.error, { type: "error" }); else toast(`${JOB_STATUS_LABEL[s]}にしました`); })}
            className={cn("h-9 rounded-full border px-3 text-xs font-bold", s === status ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle")}
          >
            {JOB_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-muted">「休止」「終了」にすると翌月分の自動生成から外れます（既に生成済みの実施回は残ります）。</p>
      <Button type="button" variant="ghost" size="sm" className="text-status-danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />この案件を削除
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="案件を削除"
        description={<>「{jobName}」を削除します。実施回が1件でもあると削除できません。</>}
        confirmLabel="削除する"
        onConfirm={async () => {
          const r = await deleteJob(jobId);
          if (r && "error" in r && r.error) toast(r.error, { type: "error" });
        }}
      />
    </div>
  );
}
