"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BackButton, FullSheet, PrimaryButton, TwoTapDelete } from "../ui/parts";
import { RECEIPT_CHIPS, receiptKindLabel, type ReceiptItem, type ReceiptKind } from "./model";

// 領収書の「内容を修正する」／「手入力で追加」。金額が空のまま確定すると黄色（確認が必要）のまま残る

export function ReceiptSheet({
  open,
  item,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  /** 修正するとき（null は手入力で追加） */
  item: ReceiptItem | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (patch: Pick<ReceiptItem, "kind" | "amount" | "paidOn" | "memo">) => void;
  onDelete?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(defaultDate);
  const [kind, setKind] = useState<ReceiptKind>("PARKING");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(item?.amount ? String(item.amount) : "");
    setPaidOn(item?.paidOn || defaultDate);
    setKind(item?.kind ?? "PARKING");
    setMemo(item?.memo ?? "");
  }, [open, item, defaultDate]);

  const n = Number(amount);
  const amountOk = amount === "" || (Number.isInteger(n) && n >= 1 && n <= 1_000_000);
  const chips = RECEIPT_CHIPS.some((c) => c.value === kind) ? RECEIPT_CHIPS : [...RECEIPT_CHIPS, { value: kind, label: receiptKindLabel(kind) }];

  return (
    <FullSheet open={open}>
      <header className="bg-[var(--w-primary)] px-5 pb-10 text-white w-safe-top">
        <h2 className="text-[28px] font-medium leading-[40px]">{item ? "内容を修正する" : "手入力で追加"}</h2>
      </header>
      <div className="-mt-5 flex-1 rounded-t-[20px] bg-white px-5 pt-5">
        <div className="space-y-5">
          <label className="block">
            <span className="text-[15px] font-semibold">金額（円）</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="金額を入力"
              className={cn(
                "mt-2 h-[72px] w-full rounded-xl border-2 px-4 text-[32px] outline-none",
                amount === "" ? "border-[var(--w-check-border)] bg-[var(--w-check-bg)]" : "border-[#94a3b8]",
              )}
            />
            {!amountOk && <span className="mt-1 block text-[14px] text-[var(--w-danger)]">1円以上の整数で入力してください</span>}
          </label>
          <label className="block">
            <span className="text-[15px] font-semibold">日付</span>
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="mt-2 h-14 w-full rounded-xl border border-[#94a3b8] px-4 text-[18px] outline-none" />
          </label>
          <div>
            <p className="text-[15px] font-semibold">項目</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setKind(c.value)}
                  aria-pressed={kind === c.value}
                  className={cn("h-[54px] rounded-xl border-2 text-[17px] font-semibold", kind === c.value ? "border-[var(--w-primary)] bg-[var(--w-primary)] text-white" : "border-[var(--w-border)] text-[var(--w-text-sub)]")}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {kind === "OTHER" && (
            <label className="block">
              <span className="text-[15px] font-semibold">その他の内容</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={50} placeholder="例）駐輪場代、消耗品など" className="mt-2 h-14 w-full rounded-xl border border-[#94a3b8] px-4 text-[18px] outline-none" />
            </label>
          )}
          {item && onDelete && (
            <TwoTapDelete onDelete={onDelete} className="flex h-[52px] w-full items-center justify-center rounded-xl border border-[#fecaca] bg-[#fef2f2] text-[17px] font-semibold" />
          )}
        </div>
      </div>
      <div className="h-[calc(100px+env(safe-area-inset-bottom))]" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white px-4 pt-3 w-footer-safe">
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <BackButton onClick={onClose}>閉じる</BackButton>
          <PrimaryButton
            disabled={!amountOk}
            onClick={() => onSave({ kind, amount: amount === "" ? null : n, paidOn, memo: kind === "OTHER" ? memo.trim() : item?.memo ?? "" })}
            className="text-[19px]"
          >
            確定
          </PrimaryButton>
        </div>
      </div>
    </FullSheet>
  );
}
