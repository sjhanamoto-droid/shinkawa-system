"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, PenLine, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";
import { EXPENSE_CATEGORY_LABEL, EXPENSE_CATEGORY_OPTIONS, type ExpenseCategory } from "@/lib/reports";
import { readReceipt } from "./receipt-ocr";

// 日報の経費。1行＝領収書1枚が目安。
// 「領収書を読み取る」＝写真から科目・金額・店名を自動入力（本人が確認して直す）
// 「手入力で追加」＝カメラが使えない・読み取れないときに手で入れる（あとから写真だけ付けることもできる）

/** 保存用の領収書（既存＝id のみ／新規＝Blob パス or 圧縮済み dataUrl） */
export type ReceiptRef =
  | { id: string }
  | { dataUrl: string; thumbUrl: string; width: number; height: number }
  | { blobPath: string; mimeType: string; sizeBytes: number; thumbUrl: string; width: number; height: number };

export type ExpenseRow = {
  key: string;
  category: ExpenseCategory | "";
  label: string;
  amount: string;
  ocr: boolean;
  receipt: ReceiptRef | null;
  /** 画面だけの状態 */
  status?: "working" | "read" | "failed";
  message?: string;
};

let seq = 0;
export function newExpenseKey(): string {
  seq += 1;
  return `e${Date.now().toString(36)}${seq}`;
}

/** hidden input に載せる形（画面だけの状態は外す） */
export function serializeExpenses(rows: ExpenseRow[]): string {
  return JSON.stringify(rows.map((r) => ({ category: r.category, label: r.label, amount: r.amount, ocr: r.ocr, receipt: r.receipt })));
}

function previewOf(r: ReceiptRef | null): string | null {
  if (!r) return null;
  if ("id" in r) return photoSrc(r.id, true);
  return r.thumbUrl;
}

// ── 画像の圧縮（本体 1600px・サムネイル 288px の JPEG） ──
const MAX_DIM = 1600;
const THUMB_DIM = 288;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function draw(img: HTMLImageElement, max: number, quality: number): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** 写真を圧縮して保存用の形にする。Blob が使えればアップロードまで済ませる */
async function prepareReceipt(file: File, blobEnabled: boolean): Promise<{ receipt: ReceiptRef; dataUrl: string }> {
  const img = await loadImage(file);
  const main = draw(img, MAX_DIM, 0.8);
  const thumb = draw(img, THUMB_DIM, 0.6);
  if (!blobEnabled) {
    return { receipt: { dataUrl: main.dataUrl, thumbUrl: thumb.dataUrl, width: main.width, height: main.height }, dataUrl: main.dataUrl };
  }
  const body = await dataUrlToBlob(main.dataUrl);
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg", sizeBytes: body.size }),
  });
  if (!res.ok) throw new Error("upload-url");
  const { uploadUrl, blobPath } = (await res.json()) as { uploadUrl: string; blobPath: string };
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body });
  if (!put.ok) throw new Error("upload");
  return {
    receipt: { blobPath, mimeType: "image/jpeg", sizeBytes: body.size, thumbUrl: thumb.dataUrl, width: main.width, height: main.height },
    dataUrl: main.dataUrl,
  };
}

export function ExpenseEditor({
  rows,
  onChange,
  blobEnabled,
  ocrEnabled,
  onBusyChange,
  error,
}: {
  rows: ExpenseRow[];
  onChange: (updater: (prev: ExpenseRow[]) => ExpenseRow[]) => void;
  blobEnabled: boolean;
  ocrEnabled: boolean;
  onBusyChange: (busy: boolean) => void;
  error?: string;
}) {
  const scanRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachFor, setAttachFor] = useState<string | null>(null);
  const busy = rows.some((r) => r.status === "working");

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const patch = (key: string, p: Partial<ExpenseRow>) => onChange((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));

  /** 領収書を読み取る：行を追加 → 写真の保存と読み取りを並行して行う */
  async function onScan(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (scanRef.current) scanRef.current.value = "";
    for (const file of list) {
      const key = newExpenseKey();
      onChange((prev) => [
        ...prev,
        { key, category: "", label: "", amount: "", ocr: false, receipt: null, status: "working", message: ocrEnabled ? "領収書を読み取っています..." : "写真を保存しています..." },
      ]);
      try {
        const { receipt, dataUrl } = await prepareReceipt(file, blobEnabled);
        patch(key, { receipt });
        if (!ocrEnabled) {
          patch(key, { status: "failed", message: "自動読み取りは準備中です。科目と金額を入力してください" });
          continue;
        }
        const r = await readReceipt(dataUrl);
        if (r.ok) {
          patch(key, {
            category: r.reading.category,
            amount: r.reading.amount != null ? String(r.reading.amount) : "",
            label: [r.reading.vendor, r.reading.date ? r.reading.date.slice(5).replace("-", "/") : null].filter(Boolean).join(" "),
            ocr: true,
            status: "read",
            message: r.reading.amount != null ? "読み取りました。内容が合っているか確認してください" : "金額を読み取れませんでした。金額を入力してください",
          });
        } else {
          patch(key, { status: "failed", message: r.message });
        }
      } catch {
        patch(key, { status: "failed", message: "写真を保存できませんでした。電波の良い場所でもう一度お試しください（手入力もできます）" });
      }
    }
  }

  /** 手入力の行に写真だけ付ける（読み取りはしない） */
  async function onAttach(files: FileList | null) {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (attachRef.current) attachRef.current.value = "";
    const key = attachFor;
    setAttachFor(null);
    if (!file || !key) return;
    patch(key, { status: "working", message: "写真を保存しています..." });
    try {
      const { receipt } = await prepareReceipt(file, blobEnabled);
      patch(key, { receipt, status: undefined, message: undefined });
    } catch {
      patch(key, { status: "failed", message: "写真を保存できませんでした。もう一度お試しください" });
    }
  }

  return (
    <div className="space-y-3">
      <input ref={scanRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onScan(e.target.files)} />
      <input ref={attachRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onAttach(e.target.files)} />

      {rows.length === 0 && <p className="rounded-xl bg-surface-subtle px-3 py-3 text-sm text-ink-muted">経費がなければ、このまま提出できます。</p>}

      {rows.map((r) => {
        const preview = previewOf(r.receipt);
        return (
          <div key={r.key} className={cn("space-y-2 rounded-xl border p-3", r.status === "failed" ? "border-amber-300 bg-amber-50/40" : "border-line bg-surface")}>
            <div className="flex gap-3">
              {/* 領収書の写真 */}
              <div className="shrink-0">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="領収書" className="h-20 w-16 rounded-lg border border-line object-cover" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachFor(r.key);
                      attachRef.current?.click();
                    }}
                    disabled={r.status === "working"}
                    className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-ink-faint hover:bg-surface-subtle"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">写真</span>
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={r.category}
                    onChange={(e) => patch(r.key, { category: e.target.value as ExpenseCategory })}
                    className="h-11"
                    wrapperClassName="flex-1"
                    aria-label="科目"
                    disabled={r.status === "working"}
                  >
                    <option value="">科目を選ぶ</option>
                    {EXPENSE_CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {EXPENSE_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => onChange((prev) => prev.filter((x) => x.key !== r.key))}
                    disabled={r.status === "working"}
                    aria-label="この経費を削除"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={r.label}
                    onChange={(e) => patch(r.key, { label: e.target.value })}
                    placeholder="内容（店名・区間など）"
                    aria-label="内容"
                    className="h-11 flex-1"
                    maxLength={50}
                    disabled={r.status === "working"}
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={r.amount}
                      onChange={(e) => patch(r.key, { amount: e.target.value })}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="金額"
                      aria-label="金額"
                      className="h-11 w-28"
                      disabled={r.status === "working"}
                    />
                    <span className="text-sm text-ink-soft">円</span>
                  </div>
                </div>
              </div>
            </div>
            {r.message && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold",
                  r.status === "working" ? "text-ink-muted" : r.status === "read" ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {r.status === "working" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : r.status === "read" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <TriangleAlert className="h-3.5 w-3.5" />
                )}
                {r.message}
              </p>
            )}
            {preview && r.status !== "working" && (
              <button type="button" onClick={() => patch(r.key, { receipt: null })} className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink-soft">
                <X className="h-3.5 w-3.5" />
                写真を外す
              </button>
            )}
          </div>
        );
      })}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => scanRef.current?.click()}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {ocrEnabled ? <Sparkles className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {ocrEnabled ? "領収書を読み取る" : "領収書の写真を付ける"}
        </button>
        <button
          type="button"
          onClick={() => onChange((prev) => [...prev, { key: newExpenseKey(), category: "", label: "", amount: "", ocr: false, receipt: null }])}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-bold text-ink-soft hover:bg-surface-subtle disabled:opacity-50"
        >
          <PenLine className="h-4 w-4" />
          手入力で追加
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        {ocrEnabled
          ? "領収書を撮影（または写真を選択）すると、科目・金額・店名を自動で入れます。内容を確認して、違っていれば直してください。"
          : "領収書の写真を付けて、科目と金額を入力してください。"}
        カメラが使えないときや写真がないときは「手入力で追加」から入れられます。
      </p>
      {error && <p className="text-xs font-semibold text-status-danger">{error}</p>}
    </div>
  );
}
