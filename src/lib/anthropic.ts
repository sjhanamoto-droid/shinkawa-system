import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Claude API のクライアント（クイック登録の抽出、Phase 2 の領収書OCR）。
// ANTHROPIC_API_KEY が未設定なら null を返し、呼び出し側は決定論的なフォールバックに切り替える。

let client: Anthropic | null = null;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic | null {
  if (!isAnthropicConfigured()) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

/** 領収書の読み取り（OCR）のモデル。精度を優先して Sonnet。ANTHROPIC_OCR_MODEL で変えられる */
export function ocrModel(): string {
  return process.env.ANTHROPIC_OCR_MODEL || "claude-sonnet-5-5";
}

/** 日報の「AIでまとめる」のモデル。速さと費用を優先して Haiku。ANTHROPIC_SUMMARY_MODEL で変えられる */
export function summaryModel(): string {
  return process.env.ANTHROPIC_SUMMARY_MODEL || "claude-haiku-5-5";
}
