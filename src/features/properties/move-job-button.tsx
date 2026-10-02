"use client";

import { useState } from "react";
import { Split } from "lucide-react";
import { moveJobToCopiedProperty } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** 統合前に1つの現場へ複数登録された作業を、現場のコピーへ移す */
export function MoveJobButton({ jobId, jobName }: { jobId: string; jobName: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Split className="h-4 w-4" />別の現場に分ける
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="別の現場に分ける"
        description={<>この現場の住所・キーBOX・入館メモをコピーした新しい現場を作り、「{jobName}」とその予定・日報を移します。写真とメモは元の現場に残ります。</>}
        confirmLabel="分ける"
        onConfirm={async () => {
          const r = await moveJobToCopiedProperty(jobId);
          if (r && "error" in r && r.error) toast(r.error, { type: "error" });
        }}
      />
    </>
  );
}
