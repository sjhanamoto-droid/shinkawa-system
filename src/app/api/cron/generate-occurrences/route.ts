// GET/POST /api/cron/generate-occurrences — 定期契約から、今月〜翌々月の実施回を未割当に入れる。
//
// Vercel Cron から毎日 00:00 UTC（09:00 JST）に呼ばれる。何もしなくても、定期の回が常に先の月まで入っている状態にする。
// その月の回が1件でもある案件は飛ばす（手で削除した回を復活させない）。生成は seriesKey で冪等。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jstDateKey, jstMonthKey, addMonthsKey } from "@/lib/date";
import { generateOccurrencesForMonth, GENERATE_AHEAD_MONTHS } from "@/lib/generate-occurrences";
import { createNotificationForUsers } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const first = jstMonthKey();
  const months = Array.from({ length: GENERATE_AHEAD_MONTHS + 1 }, (_, i) => addMonthsKey(first, i));
  const results: { month: string; created: number; skipped: number; jobs: number }[] = [];
  for (const month of months) {
    // 今月は今日より前の日付の回を作らない
    const r = await generateOccurrencesForMonth({ month, skipJobsWithMonth: true, notBefore: month === first ? jstDateKey() : undefined });
    results.push({ month, ...r });
  }

  const createdMonths = results.filter((r) => r.created > 0);
  if (createdMonths.length > 0) {
    const managers = await db.user.findMany({
      where: { role: { in: ["OWNER", "OFFICE"] }, active: true, canLogin: true },
      select: { id: true },
    });
    for (const r of createdMonths) {
      await createNotificationForUsers(
        managers.map((u) => u.id),
        {
          type: "GENERATED",
          title: `${r.month.replace("-", "年")}月分の定期を未割当に入れました`,
          body: `${r.created}件を未割当に追加しました。カレンダーの「＋」から予定を追加するときに選んで日付を決めてください`,
          href: `/schedule?view=week&d=${r.month}-01`,
          dedupeKey: `generated-${r.month}`,
        },
      );
    }
  }

  return NextResponse.json({ ok: true, results });
}

export const GET = handle;
export const POST = handle;
