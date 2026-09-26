"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { requireUser } from "@/lib/session";
import { getAnthropic } from "@/lib/anthropic";
import { EXPENSE_CATEGORY_OPTIONS, type ExpenseCategory } from "@/lib/reports";

// 領収書・レシートの写真から「科目・金額・店名・日付」を読み取る。
// 読み取り結果は下書きとしてフォームに入れ、本人が確認・修正してから提出する。

const receiptSchema = z.object({
  isReceipt: z.boolean().describe("領収書・レシート・利用明細として読める画像なら true"),
  category: z.enum(EXPENSE_CATEGORY_OPTIONS).describe("科目"),
  amount: z.number().int().nullable().describe("支払った合計金額（税込・円）。読めなければ null"),
  vendor: z.string().nullable().describe("店名・発行者（駐車場名、駅名・区間、スタンド名など）。読めなければ null"),
  date: z.string().nullable().describe("支払日 YYYY-MM-DD。読めなければ null"),
});

export type ReceiptReading = {
  category: ExpenseCategory;
  amount: number | null;
  vendor: string | null;
  date: string | null;
};

export type ReadReceiptResult =
  | { ok: true; reading: ReceiptReading }
  | { ok: false; reason: "disabled" | "unreadable" | "error"; message: string };

const SYSTEM = [
  "あなたは清掃・工事会社の経理担当です。現場スタッフが撮った領収書・レシートの写真から、経費精算に必要な項目を読み取ります。",
  "科目は次のルールで1つ選んでください。",
  "- PARKING（駐車場代）: コインパーキング、時間貸し駐車場、駐車券、駐車料金",
  "- TRAVEL（旅費交通費）: 電車・バス・タクシーの運賃、ICカードのチャージや乗車の利用明細、きっぷ",
  "- HIGHWAY（高速代）: 高速道路の通行料金、ETC利用照会",
  "- FUEL（ガソリン代）: ガソリンスタンドでの給油（軽油・ガソリン）",
  "- SUPPLIES（材料・消耗品費）: ホームセンター、資材店、100円ショップ、ドラッグストア等での材料・洗剤・消耗品の購入",
  "- OTHER（その他）: 上のどれにも当たらないもの",
  "金額は支払った合計（税込）を円の整数で。お預かり・お釣りの金額と取り違えないでください。",
  "画像に書かれていない情報は推測せず null にしてください。領収書ではない画像なら isReceipt を false にしてください。",
].join("\n");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function readReceipt(dataUrl: string): Promise<ReadReceiptResult> {
  await requireUser();
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === "string" ? dataUrl : "");
  if (!m) return { ok: false, reason: "error", message: "画像の形式が正しくありません（JPEG / PNG / WebP）" };
  if ((m[2].length * 3) / 4 > MAX_IMAGE_BYTES) return { ok: false, reason: "error", message: "画像が大きすぎます" };

  const client = getAnthropic();
  if (!client) {
    return { ok: false, reason: "disabled", message: "自動読み取りは準備中です。金額と科目を入力してください" };
  }

  try {
    const res = await client.beta.messages.parse({
      model: process.env.ANTHROPIC_OCR_MODEL || "claude-opus-5",
      max_tokens: 16000,
      // 読み取りを断られた場合は別モデルで自動的にやり直す
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(receiptSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] } },
            { type: "text", text: "この領収書を読み取ってください。" },
          ],
        },
      ],
    });
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!out || !out.isReceipt) {
      return { ok: false, reason: "unreadable", message: "領収書を読み取れませんでした。金額と科目を入力してください" };
    }
    const amount = out.amount != null && out.amount > 0 && out.amount <= 1_000_000 ? out.amount : null;
    const date = out.date && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null;
    return { ok: true, reading: { category: out.category, amount, vendor: out.vendor?.trim().slice(0, 50) || null, date } };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "error", message: "読み取りが混み合っています。少し待ってからもう一度お試しください（手入力もできます）" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[receipt-ocr] API error", e.status, e.message);
    } else {
      console.error("[receipt-ocr] failed", e);
    }
    return { ok: false, reason: "error", message: "読み取りに失敗しました。金額と科目を入力してください" };
  }
}
