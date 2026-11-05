"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Pencil, RefreshCw, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { photoSrc } from "@/lib/photos";
import { fmtYen } from "@/lib/utils";
import { prepareReceipt, type ReceiptRef } from "./expense-editor";
import { updateReportExpense, type ExpenseReceiptChange } from "./expense-actions";
import type { ExpenseLine } from "./queries";

/** 日報詳細の経費一覧。編集できる人は、1行ずつ金額と領収書の写真を直せる（提出後も可） */
export function ReportExpenseList({
  reportId,
  lines,
  total,
  canEdit,
  blobEnabled,
}: {
  reportId: string;
  lines: ExpenseLine[];
  total: number;
  canEdit: boolean;
  blobEnabled: boolean;
}) {
  const [editing, setEditing] = useState<ExpenseLine | null>(null);

  return (
    <>
      <Card className="divide-y divide-line overflow-hidden text-sm">
        {lines.length === 0 && <p className="px-4 py-3 text-ink-muted">経費はありません</p>}
        {lines.map((e) => (
          <div key={e.key} className="flex items-center gap-3 px-4 py-3">
            {e.receiptPhotoId ? (
              <a href={photoSrc(e.receiptPhotoId)} target="_blank" rel="noreferrer" className="shrink-0" aria-label="領収書を開く">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(e.receiptPhotoId, true)} alt="領収書" className="h-12 w-10 rounded border border-line object-cover" />
              </a>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(e)}
                aria-label={`${e.categoryLabel}に領収書を追加`}
                className="flex h-12 w-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-line-strong text-ink-faint hover:bg-surface-subtle"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="text-[9px] font-semibold">追加</span>
              </button>
            ) : (
              <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink-faint">なし</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{e.categoryLabel}</span>
              {(e.paidOn || e.label || e.ocr) && (
                <span className="block truncate text-xs text-ink-muted">
                  {e.paidOn && <span className="mr-1.5 tnum">{e.paidOn}</span>}
                  {e.label}
                  {e.ocr && <span className="ml-1 text-emerald-700">（領収書から読み取り）</span>}
                </span>
              )}
            </span>
            <span className="font-semibold tnum text-ink">{fmtYen(e.amount)}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(e)}
                aria-label={`${e.categoryLabel}を直す`}
                className="-mr-2 flex h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-brand-600 hover:bg-surface-sunken"
              >
                <Pencil className="h-3.5 w-3.5" />
                修正
              </button>
            )}
          </div>
        ))}
        <div className="flex justify-between bg-surface-subtle px-4 py-3 font-bold">
          <span>合計</span>
          <span className="tnum">{fmtYen(total)}</span>
        </div>
      </Card>
      {editing && <ExpenseEditModal reportId={reportId} line={editing} blobEnabled={blobEnabled} onClose={() => setEditing(null)} />}
    </>
  );
}

function ExpenseEditModal({ reportId, line, blobEnabled, onClose }: { reportId: string; line: ExpenseLine; blobEnabled: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(String(line.amount));
  /** 新しく付けた写真（未保存）。null＝変更なし */
  const [added, setAdded] = useState<Exclude<ReceiptRef, { id: string }> | null>(null);
  const [removed, setRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = added ? added.thumbUrl : !removed && line.receiptPhotoId ? photoSrc(line.receiptPhotoId, true) : null;
  const amountNum = Number(amount);
  const amountOk = Number.isInteger(amountNum) && amountNum >= 1 && amountNum <= 1_000_000;
  const busy = uploading || saving;

  async function onPick(files: FileList | null) {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { receipt } = await prepareReceipt(file, blobEnabled);
      if ("id" in receipt) return;
      setAdded(receipt);
      setRemoved(false);
    } catch {
      setError("写真を保存できませんでした。電波の良い場所でもう一度お試しください");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!amountOk) {
      setError("金額は1円以上の整数で入力してください");
      return;
    }
    const receipt: ExpenseReceiptChange = added ? { mode: "add", photo: added } : removed ? { mode: "remove" } : { mode: "keep" };
    setSaving(true);
    setError("");
    try {
      const r = await updateReportExpense({ reportId, key: line.key, amount: amountNum, receipt });
      if (r.error) {
        setError(r.error);
        return;
      }
      toast("経費を直しました");
      onClose();
      router.refresh();
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`${line.categoryLabel}を直す`}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPick(e.target.files)} />
      <div className="space-y-4">
        {(line.label || line.paidOn) && (
          <p className="text-sm text-ink-muted">
            {line.paidOn && <span className="mr-1.5 tnum">{line.paidOn}</span>}
            {line.label}
          </p>
        )}

        <Field label="金額" htmlFor="expense-amount">
          <div className="flex items-center gap-2">
            <Input
              id="expense-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              inputMode="numeric"
              min={1}
              className="h-12 w-40 text-lg font-bold tnum"
              disabled={busy}
            />
            <span className="text-sm text-ink-soft">円</span>
            {amountOk && amountNum !== line.amount && <span className="text-xs text-ink-muted tnum">（元 {fmtYen(line.amount)}）</span>}
          </div>
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink-soft">領収書の写真</p>
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="領収書" className="h-28 w-[5.5rem] rounded-lg border border-line object-cover" />
            ) : (
              <div className="flex h-28 w-[5.5rem] items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-ink-faint">
                なし
              </div>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-bold text-ink-soft hover:bg-surface-subtle disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : preview ? <RefreshCw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? "写真を保存しています..." : preview ? "写真を差し替える" : "写真を追加"}
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={() => {
                    setAdded(null);
                    setRemoved(true);
                  }}
                  disabled={busy}
                  className="flex h-10 items-center gap-1 rounded-xl px-1 text-sm font-semibold text-ink-muted hover:text-ink-soft disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  写真を外す
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-ink-muted">撮影するか、保存してある写真を選んでください。</p>
        </div>

        {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
            キャンセル
          </Button>
          <Button type="button" className="flex-1" onClick={() => void save()} disabled={busy || !amountOk}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存する
          </Button>
        </div>
      </div>
    </Modal>
  );
}
