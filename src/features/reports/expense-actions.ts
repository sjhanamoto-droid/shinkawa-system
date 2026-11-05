"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { deleteBlobPaths } from "@/lib/media";
import { parseAndValidatePhotosField } from "@/lib/photos";
import { canEditReport } from "@/lib/reports";

// 日報の詳細から、経費1行だけを直す（金額・領収書の写真）。日報全体の保存（saveReport）とは別に、提出後でも直せる。

export type ExpenseReceiptChange =
  | { mode: "keep" }
  | { mode: "remove" }
  /** 新しい領収書（expense-editor の prepareReceipt が作る形） */
  | { mode: "add"; photo: Record<string, unknown> };

const LEGACY = { "legacy-parking": { field: "parkingFee", category: "PARKING" }, "legacy-train": { field: "trainFare", category: "TRAVEL" } } as const;

export async function updateReportExpense(input: {
  reportId: string;
  /** 経費のID。以前の形式（駐車場代・電車賃の欄）は "legacy-parking" / "legacy-train" */
  key: string;
  amount: number;
  receipt: ExpenseReceiptChange;
}): Promise<{ error?: string }> {
  const me = await requireUser();
  const report = await db.dailyReport.findUnique({
    where: { id: input.reportId },
    select: { id: true, userId: true, createdById: true, propertyId: true, parkingFee: true, trainFare: true },
  });
  if (!report) return { error: "日報が見つかりません（削除された可能性があります）" };
  if (!canEditReport(me, report)) return { error: "この日報の経費を直す権限がありません" };

  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) return { error: "金額は1円以上の整数で入力してください" };

  let added: ReturnType<typeof toNewReceipt> = null;
  if (input.receipt.mode === "add") {
    added = toNewReceipt(input.receipt.photo);
    if (!added || "error" in added) return { error: added && "error" in added ? `領収書：${added.error}` : "領収書の写真を読み込めませんでした" };
  }

  const legacy = input.key in LEGACY ? LEGACY[input.key as keyof typeof LEGACY] : null;
  let removedBlobs: string[] = [];
  try {
    removedBlobs = await db.$transaction(async (tx) => {
      // 対象の経費（以前の形式なら、ここで新しい形式の1行に置き換える）
      let expense: { id: string; amount: number; receiptPhotoId: string | null };
      if (legacy) {
        if (!report[legacy.field]) throw new UserError("この経費は見つかりません（すでに直された可能性があります）");
        const first = await tx.reportExpense.findFirst({ where: { reportId: report.id }, orderBy: { sortOrder: "asc" }, select: { sortOrder: true } });
        expense = await tx.reportExpense.create({
          data: { reportId: report.id, category: legacy.category, label: "", amount: report[legacy.field]!, sortOrder: (first?.sortOrder ?? 0) - 1 },
          select: { id: true, amount: true, receiptPhotoId: true },
        });
        await tx.dailyReport.update({ where: { id: report.id }, data: { [legacy.field]: null } });
      } else {
        const found = await tx.reportExpense.findFirst({ where: { id: input.key, reportId: report.id }, select: { id: true, amount: true, receiptPhotoId: true } });
        if (!found) throw new UserError("この経費は見つかりません（日報が編集された可能性があります）");
        expense = found;
      }

      // 領収書：差し替え・外すときは前の写真を消す
      let receiptPhotoId = expense.receiptPhotoId;
      const gone: { id: string; blobPath: string | null }[] = [];
      if (input.receipt.mode !== "keep" && expense.receiptPhotoId) {
        const old = await tx.photo.findUnique({ where: { id: expense.receiptPhotoId }, select: { id: true, blobPath: true } });
        if (old) gone.push(old);
        receiptPhotoId = null;
      }
      if (added && !("error" in added)) {
        const created = await tx.photo.create({ data: { ...added, reportId: report.id, kind: "RECEIPT", isVideo: false, createdById: me.id }, select: { id: true } });
        receiptPhotoId = created.id;
      }
      // 金額を手で直したら「領収書から読み取り」の表示は外す
      await tx.reportExpense.update({
        where: { id: expense.id },
        data: { amount, receiptPhotoId, ...(amount !== expense.amount ? { ocr: false } : {}) },
      });
      if (gone.length) await tx.photo.deleteMany({ where: { id: { in: gone.map((p) => p.id) } } });
      return gone.flatMap((p) => (p.blobPath ? [p.blobPath] : []));
    });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }

  await deleteBlobPaths(removedBlobs);
  revalidatePath(`/reports/${report.id}`);
  if (report.propertyId) revalidatePath(`/properties/${report.propertyId}`);
  return {};
}

class UserError extends Error {}

/** 新しい領収書の写真を検証して、Photo に保存する形にする（日報の保存と同じ検証） */
function toNewReceipt(photo: Record<string, unknown>) {
  const parsed = parseAndValidatePhotosField(JSON.stringify([{ ...photo, caption: "", kind: "RECEIPT" }]));
  if ("error" in parsed) return { error: parsed.error };
  const p = parsed.added[0];
  if (!p) return null;
  return {
    dataUrl: p.dataUrl ?? null,
    thumbUrl: p.thumbUrl ?? null,
    blobPath: p.blobPath ?? null,
    mimeType: p.mimeType ?? null,
    sizeBytes: p.sizeBytes ?? null,
    width: p.width ?? null,
    height: p.height ?? null,
  };
}
