"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { changePropertyCustomer } from "./actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { CustomerChoice } from "./property-form";

/** 「その他」の現場を、既存の顧客か新しい顧客に振り分ける */
export function ChangeCustomerButton({ propertyId, customers }: { propertyId: string; customers: CustomerChoice[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const ready = mode === "existing" ? !!customerId : !!newName.trim();

  async function submit() {
    setPending(true);
    try {
      const r = await changePropertyCustomer(propertyId, mode === "existing" ? { customerId } : { newName });
      if (r.error) {
        toast(r.error, { type: "error" });
        return;
      }
      toast(`顧客を「${r.customerName}」に変更しました`);
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const tab = (m: "existing" | "new", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={cn(
        "min-h-[44px] flex-1 rounded-lg text-sm font-semibold transition-colors",
        mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowRightLeft className="h-4 w-4" />顧客を変更
      </Button>
      <Modal open={open} onClose={pending ? () => {} : () => setOpen(false)} title="顧客を変更">
        <p className="mb-4 text-sm leading-relaxed text-ink-soft">この現場と、その作業・予定の顧客を変更します。</p>
        <div className="mb-4 flex gap-1 rounded-xl bg-surface-subtle p-1">
          {tab("existing", "登録済みの顧客から選ぶ")}
          {tab("new", "新しい顧客を登録")}
        </div>
        {mode === "existing" ? (
          <Field label="顧客" htmlFor="change-customer" hint="名前・ふりがなで検索">
            <SearchSelect
              id="change-customer"
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              options={customers.map((c) => ({ value: c.id, label: c.name, keywords: c.kana ?? null }))}
              placeholder="顧客名を入力して検索"
              emptyLabel="選択を解除"
            />
          </Field>
        ) : (
          <Field label="顧客名" htmlFor="change-customer-name" hint="住所・電話などは後で顧客の編集から入れられます">
            <Input id="change-customer-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="株式会社○○不動産" maxLength={100} />
          </Field>
        )}
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>
            キャンセル
          </Button>
          <Button type="button" className="flex-1" onClick={submit} disabled={!ready || pending}>
            {pending ? "変更中..." : "変更する"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
