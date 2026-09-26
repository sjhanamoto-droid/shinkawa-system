"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getAnthropic } from "@/lib/anthropic";

// クレームの内容と原因から「対応・再発防止策」の案を作る。案は入力欄に入れ、人が確認・修正してから登録する。

const schema = z.object({
  response: z.string().describe("その場で行う・行った対応の案（謝罪・やり直し・報告など）。1〜3文。内容から分からなければ空文字"),
  measures: z.array(z.string()).describe("再発防止策。現場スタッフが明日から実行できる具体的な行動を1項目1文で、3〜5項目"),
});

export type PreventionResult = { ok: true; text: string } | { ok: false; message: string };

const SYSTEM = [
  "あなたは清掃・内装工事会社の品質管理の担当者です。",
  "起きたクレームの内容と原因を読み、社内で共有する「対応・再発防止策」の案を作ります。",
  "- response: お客様・管理会社への対応の案。やり直し・謝罪・報告など、内容に合うものを簡潔に。",
  "- measures: 再発防止策。「気をつける」「徹底する」のような抽象的な表現は避け、いつ・誰が・何をするかが分かる具体的な行動にする（例：作業終了前に、ガラス面を斜めから見て拭き残しを確認する）。",
  "- 原因が書かれていれば、その原因をなくす策を優先する。書かれていない事実（人名・日時・金額など）は作らない。",
  "- 日本語で、現場の人が読んで分かる平易な言葉で書く。",
].join("\n");

export async function suggestPrevention(input: { title: string; content: string; cause: string; propertyName?: string }): Promise<PreventionResult> {
  const me = await requireUser();
  if (!can(me, "claim.manage")) return { ok: false, message: "この操作を行う権限がありません" };
  const content = (input.content ?? "").trim().slice(0, 4000);
  const cause = (input.cause ?? "").trim().slice(0, 4000);
  const title = (input.title ?? "").trim().slice(0, 80);
  if (!content) return { ok: false, message: "先に「クレームの内容」を入力してください" };

  const client = getAnthropic();
  if (!client) return { ok: false, message: "AIは準備中です。直接入力してください" };

  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      // 断られた場合は別モデルで自動的にやり直す
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      system: SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      messages: [
        {
          role: "user",
          content: [
            title && `【件名】${title}`,
            input.propertyName && `【現場】${input.propertyName.slice(0, 100)}`,
            `【クレームの内容】\n${content}`,
            `【原因】\n${cause || "（未記入）"}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    const out = res.stop_reason === "refusal" ? null : res.parsed_output;
    const measures = out?.measures.map((m) => m.trim()).filter(Boolean) ?? [];
    if (!out || measures.length === 0) return { ok: false, message: "案を作れませんでした。内容を足してもう一度お試しください" };
    const text = [
      out.response.trim() && `【対応】\n${out.response.trim()}`,
      `【再発防止策】\n${measures.map((m) => `・${m}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
    return { ok: true, text };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "AIが混み合っています。少し待ってからもう一度お試しください" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[ai-prevention] API error", e.status, e.message);
    } else {
      console.error("[ai-prevention] failed", e);
    }
    return { ok: false, message: "案を作れませんでした。直接入力してください" };
  }
}
