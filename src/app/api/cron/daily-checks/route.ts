// GET/POST /api/cron/daily-checks — 日次チェック（毎日 18:00 JST 想定）。
//
// (A) 明日の予定リマインド: 明日の確定・仮の実施回に配員されている作業者へ「明日の予定」を通知する。
// (B) 参照されていない Blob の掃除（動画を選んだあと保存せず離脱すると Blob だけが残るため）。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { dayRangeForKey, tomorrowKey } from "@/lib/date";
import { sweepOrphanBlobs } from "@/lib/media";
import { CATEGORY, isCategory } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Vercel Cron の Authorization ヘッダを検証する（CRON_SECRET 未設定なら不許可） */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let created = 0;

  // ── (A) 明日の予定リマインド ──
  const tKey = tomorrowKey();
  const occurrences = await db.occurrence.findMany({
    where: { date: dayRangeForKey(tKey), status: { in: ["TENTATIVE", "CONFIRMED"] } },
    select: {
      id: true,
      title: true,
      category: true,
      startTime: true,
      customer: { select: { shortName: true, name: true } },
      property: { select: { name: true } },
      assignments: { select: { userId: true } },
    },
    orderBy: [{ startTime: "asc" }],
  });
  const byUser = new Map<string, string[]>();
  for (const o of occurrences) {
    const label = [
      o.startTime,
      isCategory(o.category) ? CATEGORY[o.category].short : null,
      o.title ?? o.customer?.shortName ?? o.customer?.name ?? o.property?.name ?? "予定",
    ]
      .filter(Boolean)
      .join(" ");
    for (const a of o.assignments) {
      const list = byUser.get(a.userId) ?? [];
      list.push(label);
      byUser.set(a.userId, list);
    }
  }
  for (const [userId, items] of byUser) {
    const ok = await createNotification({
      userId,
      type: "TOMORROW",
      title: `明日の予定 ${items.length}件`,
      body: items.slice(0, 5).join(" ／ ") + (items.length > 5 ? ` ほか${items.length - 5}件` : ""),
      href: `/schedule?view=day&d=${tKey}&mine=1`,
      dedupeKey: `tomorrow-${tKey}`,
    });
    if (ok) created++;
  }

  // ── (B) 参照されていない Blob の掃除（24時間より古いものだけ） ──
  let sweptBlobs = 0;
  try {
    const rows = await db.photo.findMany({ where: { blobPath: { not: null } }, select: { blobPath: true } });
    const referenced = new Set(rows.map((r) => r.blobPath as string));
    sweptBlobs = await sweepOrphanBlobs(referenced, 24 * 60 * 60 * 1000);
  } catch {
    // 掃除に失敗しても通知処理の結果は返す
  }

  return NextResponse.json({ ok: true, created, sweptBlobs });
}

export const GET = handle;
export const POST = handle;
