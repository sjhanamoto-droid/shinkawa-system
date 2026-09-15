"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteCustomer } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
      <p className="text-sm font-bold text-red-700">危険な操作</p>
      <p className="mt-1 text-xs leading-relaxed text-red-600/90">物件や予定が紐づいている顧客は削除できません（取引停止にしてください）。</p>
      <Button type="button" variant="danger" size="md" className="mt-3 w-full" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        この顧客を削除
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        title="本当に削除しますか？"
        description={<>「<span className="font-bold">{customerName}</span>」を削除します。この操作は取り消せません。</>}
        confirmLabel="削除する"
        onConfirm={async () => {
          const fd = new FormData();
          fd.set("id", customerId);
          const r = await deleteCustomer(fd);
          if (r && "error" in r && r.error) toast(r.error, { type: "error" });
        }}
      />
    </div>
  );
}
