"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteAnnouncement } from "./actions";

/** 取り消し（後ろの画面に重ねる確認モーダルで確かめてから取り消す） */
export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-muted hover:bg-red-50 hover:text-status-danger"
      >
        <Trash2 className="h-4 w-4" />
        取り消す
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="この連絡を取り消しますか？"
        description="送った相手の通知からも消えます。この操作は元に戻せません。"
        confirmLabel="取り消す"
        onConfirm={async () => {
          const r = await deleteAnnouncement(id);
          if (r?.error) toast(r.error, { type: "error" });
        }}
      />
    </>
  );
}
