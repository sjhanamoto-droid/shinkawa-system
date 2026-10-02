"use client";

import { useState, useTransition } from "react";
import { Trash2, Archive, ArchiveRestore } from "lucide-react";
import { deleteProperty, setPropertyStatus } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function DeletePropertyButton({ propertyId, propertyName, status }: { propertyId: string; propertyName: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const inactive = status === "INACTIVE";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-bold text-ink">{inactive ? "終了した現場" : "取引が終わったら"}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          {inactive ? "再開するとカレンダーの現場候補に戻ります。" : "「終了」にするとカレンダーの現場候補から外れます（過去の予定・写真は残ります）。"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="mt-3 w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setPropertyStatus(propertyId, inactive ? "ACTIVE" : "INACTIVE");
              if (r.error) toast(r.error, { type: "error" });
              else toast(inactive ? "再開しました" : "終了にしました");
            })
          }
        >
          {inactive ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {inactive ? "現場を再開する" : "現場を終了にする"}
        </Button>
      </div>
      <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
        <p className="text-sm font-bold text-red-700">危険な操作</p>
        <p className="mt-1 text-xs leading-relaxed text-red-600/90">予定が紐づいている現場は削除できません。写真・メモも消えます。取り消せません。</p>
        <Button type="button" variant="danger" size="md" className="mt-3 w-full" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" />
          この現場を削除
        </Button>
        <ConfirmDialog
          open={open}
          onClose={() => setOpen(false)}
          danger
          title="本当に削除しますか？"
          description={<>「<span className="font-bold">{propertyName}</span>」を完全に削除します。</>}
          confirmLabel="削除する"
          onConfirm={async () => {
            const r = await deleteProperty(propertyId);
            if (r && "error" in r && r.error) toast(r.error, { type: "error" });
          }}
        />
      </div>
    </div>
  );
}
