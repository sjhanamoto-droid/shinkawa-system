import "server-only";
import { db } from "@/lib/db";
import { photoSrc } from "@/lib/photos";

/** /api/photos がそのまま返せる大きさ（これを超える PDF はビューアで開く） */
const PROXY_LIMIT = 4 * 1024 * 1024;

// 現場の図面を「最新版＋過去の版」にまとめる。一覧はサムネイルだけで、PDF の本体は開いたときに取りに行く。

export type DrawingVersion = {
  id: string;
  revision: number;
  caption: string | null;
  isPdf: boolean;
  hasThumb: boolean;
  /** 開くときの行き先（4MB を超える PDF はアプリ内のビューア。サーバーを通せないため） */
  openHref: string;
  createdAt: string;
  createdByName: string | null;
};

export type DrawingItem = DrawingVersion & {
  /** 過去の版（新しい順） */
  history: DrawingVersion[];
  /** 画像の図面（PDF ではない）のときの大きさ（写真ビューア用） */
  width: number | null;
  height: number | null;
};

export async function loadDrawings(propertyId: string): Promise<DrawingItem[]> {
  const rows = await db.photo.findMany({
    where: { propertyId, kind: "DRAWING" },
    select: { id: true, revision: true, caption: true, width: true, height: true, isVideo: true, thumbUrl: true, sizeBytes: true, blobPath: true, createdAt: true, createdById: true, replacesId: true, supersededAt: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const toVersion = (r: (typeof rows)[number]): DrawingVersion => ({
    id: r.id,
    revision: r.revision,
    caption: r.caption,
    isPdf: r.width == null && !r.isVideo,
    hasThumb: !!r.thumbUrl,
    openHref: r.blobPath && r.width == null && !r.isVideo && (r.sizeBytes ?? 0) > PROXY_LIMIT ? `/viewer/${r.id}` : photoSrc(r.id),
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdById ? (nameOf.get(r.createdById) ?? null) : null,
  });
  return rows
    .filter((r) => !r.supersededAt)
    .map((r) => {
      const history: DrawingVersion[] = [];
      let prev = r.replacesId ? byId.get(r.replacesId) : undefined;
      const seen = new Set([r.id]);
      while (prev && !seen.has(prev.id)) {
        seen.add(prev.id);
        history.push(toVersion(prev));
        prev = prev.replacesId ? byId.get(prev.replacesId) : undefined;
      }
      return { ...toVersion(r), history, width: r.width, height: r.height };
    });
}
