// GET/POST /api/cron/generate-occurrences — 定期契約から翌月分の実施回を生成する。
//
// Vercel Cron から毎日 00:00 UTC（09:00 JST）に呼ばれ、AppSetting.generateDay と今日(JST)が一致する日だけ実行する。
// 生成は seriesKey で冪等なので、手動ボタンと重なっても二重には作られない。

import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jstDateKey, jstMonthKey, addMonthsKey } from "@/lib/date";
import { getAppSettings } from "@/lib/settings";
import { generateOccurrencesForMonth } from "@/lib/generate-occurrences";
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
  const settings = await getAppSettings();
  const today = jstDateKey();
  const force = req.nextUrl.searchParams.get("force") === "1";
  const day = Number(today.slice(8, 10));
  if (!force && day !== settings.generateDay) {
    return NextResponse.json({ ok: true, skipped: true, reason: `generateDay=${settings.generateDay}, today=${today}` });
  }

  const month = addMonthsKey(jstMonthKey(), 1);
  const result = await generateOccurrencesForMonth({ month });

  if (result.created > 0) {
    const managers = await db.user.findMany({
      where: { role: { in: ["OWNER", "OFFICE"] }, active: true, canLogin: true },
      select: { id: true },
    });
    await createNotificationForUsers(
      managers.map((u) => u.id),
      {
        type: "GENERATED",
        title: `${month.replace("-", "年")}月分の定期を生成しました`,
        body: `${result.created}件を未割当に追加しました。週ビューの未割当レーンから日付を決めてください`,
        href: `/schedule?view=week&d=${month}-01`,
        dedupeKey: `generated-${month}`,
      },
    );
  }

  return NextResponse.json({ ok: true, month, ...result });
}

export const GET = handle;
export const POST = handle;
