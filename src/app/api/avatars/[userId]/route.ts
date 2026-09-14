// GET /api/avatars/[userId] — プロフィール画像の配信。
//
// User.avatarImage(base64 data URL) を RSC ペイロードに載せると、予定の参加者ごとに
// 同じ画像が直列化されてページが肥大化する。表示側は avatarUrl（このURL）で参照する。
// ?v=<updatedAt> をキャッシュバスターとして付け、長期キャッシュする。

import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  if (!m) return null;
  try {
    return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const { userId } = await params;
  const user = await db.user.findUnique({ where: { id: userId }, select: { avatarImage: true } });
  if (!user?.avatarImage) return new NextResponse(null, { status: 404 });

  const parsed = parseDataUrl(user.avatarImage);
  if (!parsed) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(parsed.buffer), {
    status: 200,
    headers: {
      "Content-Type": parsed.mime,
      "Content-Length": String(parsed.buffer.length),
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
