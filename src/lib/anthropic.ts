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
