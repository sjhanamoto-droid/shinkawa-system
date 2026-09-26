"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { requireUser } from "@/lib/session";
import { getAnthropic } from "@/lib/anthropic";

// 話した・書いたメモを「作業内容」と「引き継ぎ事項」に振り分ける。
// 結果は画面で確認してから各欄に入れる（自動では保存しない）。

const sortSchema = z.object({
  detail: z.string().describe("当日の作業内容。日報に載せられる、整った簡潔な日本語。無ければ空文字"),
  handover: z.string().describe("次に現場へ行く人・管理会社などへの引き継ぎ事項。無ければ空文字"),
});

export type AiSortResult = { ok: true; detail: string; handover: string } | { ok: false; message: string };

const SYSTEM = [
  "あなたは清掃・内装工事会社の日報作成を手伝うアシスタントです。",
  "現場スタッフが音声入力やスマホで急いで入力したメモを受け取り、日報の2つの欄に振り分けます。",
  "- detail（作業内容）: その日に行った作業。場所・作業名・結果が分かるように、句点で区切った短い文にまとめる。",
  "- handover（引き継ぎ事項）: 次に現場へ行く人や事務所に伝えるべきこと。不具合・破損・残作業・次回の注意点・鍵や入館の注意・お客様からの要望など。無ければ空文字。",
  "音声入力の誤変換（例：「床戦場」→「床洗浄」、「ワックス掛け」など清掃・工事用語）は文脈から直してよい。",
  "メモに書かれていない作業や事実を足さないこと。「えー」「あの」などの言いよどみは取り除くこと。",
].join("\n");

const MAX_MEMO = 4000;

export async function sortReportMemo(memo: string): Promise<AiSortResult> {
  await requireUser();
  const text = typeof memo === "string" ? memo.trim() : "";
  if (!text) return { ok: false, message: "メモを入力してください" };
  if (text.length > MAX_MEMO) return { ok: false, message: `メモは${MAX_MEMO}文字までです` };

  const client = getAnthropic();
  if (!client) return { ok: false, message: "AIの振り分けは準備中です。各欄に直接入力してください" };

  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // 断られた場合は別モデルで自動的にやり直す
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(sortSchema) },
      messages: [{ role: "user", content: `次のメモを振り分けてください。\n\n【メモ】\n${text}` }],
    });
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    if (!out) return { ok: false, message: "振り分けできませんでした。各欄に直接入力してください" };
    const detail = out.detail.trim().slice(0, 4000);
    const handover = out.handover.trim().slice(0, 1000);
    if (!detail && !handover) return { ok: false, message: "作業内容や引き継ぎ事項を読み取れませんでした。メモを足してもう一度お試しください" };
    return { ok: true, detail, handover };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "AIが混み合っています。少し待ってからもう一度お試しください" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[ai-sort] API error", e.status, e.message);
    } else {
      console.error("[ai-sort] failed", e);
    }
    return { ok: false, message: "振り分けに失敗しました。各欄に直接入力してください" };
  }
}
