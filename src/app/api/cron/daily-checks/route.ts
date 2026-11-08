// GET/POST /api/cron/daily-checks — 日次チェック（毎日 18:00 JST 想定）。
//
// (A) 明日の予定リマインド: 明日の実施回に配員されている作業者へ「明日の予定」を通知する。
// (B) 参照されていない Blob の掃除（動画を選んだあと保存せず離脱すると Blob だけが残るため）。
//     「削除済み」（30日の猶予）の写真の原本は、写真と同じく参照中として残す。
// (C) 「削除済み」の猶予が過ぎたものを原本ごと消す。
// (D) 写真・図面・領収書のバックアップ（別の非公開 Blob ストアへ。動画を除く）。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { dayRangeForKey, tomorrowKey } from "@/lib/date";
import { sweepOrphanBlobs } from "@/lib/media";
import { backupNewPhotos, purgeTrash } from "@/lib/media-backup";
import { catShort } from "@/lib/categories";
import { getCategories } from "@/lib/categories-server";

export const dynamic = "force-dynamic";
// バックアップのコピーに時間がかかることがあるため長めに
export const maxDuration = 300;

/** Vercel Cron の Authorization ヘッダを検証する（CRON_SECRET 未設定なら不許可） */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // この関数の上限（maxDuration）より前に、バックアップを切り上げる基準
  const startedAt = Date.now();

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
      customer: { select: { name: true } },
      property: { select: { name: true } },
      assignments: { select: { userId: true } },
    },
    orderBy: [{ startTime: "asc" }],
  });
  const categories = await getCategories();
  const byUser = new Map<string, string[]>();
  for (const o of occurrences) {
    const label = [
      o.startTime,
      catShort(categories, o.category),
      o.title ?? o.customer?.name ?? o.property?.name ?? "予定",
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
    // 写真と削除済みを1回の問い合わせで読む（読む間に削除済みへ移されても、どちらかで必ず拾う）
    const rows = await db.$queryRaw<{ blobPath: string }[]>`
      SELECT "blobPath" FROM "Photo" WHERE "blobPath" IS NOT NULL
      UNION
      SELECT "blobPath" FROM "DeletedMedia" WHERE "blobPath" IS NOT NULL`;
    const referenced = new Set(rows.map((r) => r.blobPath));
    sweptBlobs = await sweepOrphanBlobs(referenced, 24 * 60 * 60 * 1000);
  } catch {
    // 掃除に失敗しても通知処理の結果は返す
  }

  // ── (C) 削除済みの片付け ──
  let purged = 0;
  try {
    purged = await purgeTrash();
  } catch (e) {
    console.error("[cron] purge trash failed", e);
  }

  // ── (D) バックアップ（この関数の時間内でできる分だけ。残りは翌日に続ける） ──
  let backup = { copied: 0, failed: 0, remaining: false };
  try {
    backup = await backupNewPhotos({ limit: 300, deadline: startedAt + 250_000 });
  } catch (e) {
    console.error("[cron] backup failed", e);
  }

  return NextResponse.json({ ok: true, created, sweptBlobs, purged, backup });
}

export const GET = handle;
export const POST = handle;
