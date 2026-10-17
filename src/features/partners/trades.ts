import "server-only";
import { db } from "@/lib/db";
import { PARTNER_TRADE_PRESETS } from "@/lib/constants";

/** 業種の選択肢：最初からあるもの＋これまでに追加された業種（あいうえお順） */
export async function loadTradeOptions(): Promise<string[]> {
  const rows = await db.partner.findMany({ select: { trades: true } });
  const used = new Set(rows.flatMap((r) => r.trades));
  const custom = [...used].filter((t) => !PARTNER_TRADE_PRESETS.includes(t)).sort((a, b) => a.localeCompare(b, "ja"));
  return [...PARTNER_TRADE_PRESETS, ...custom];
}
