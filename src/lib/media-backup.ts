import "server-only";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { deleteBlobPaths, isBlobConfigured, signedReadUrl } from "@/lib/media";

// 写真・図面・領収書のバックアップと、「削除済み」の片付け。毎日のチェック（/api/cron/daily-checks）から呼ぶ。
//
// バックアップ：まだコピーしていない写真を、別の非公開 Blob ストア（BACKUP_READ_WRITE_TOKEN）へコピーする。
//   Blob の写真は backup/<元のパス>、データベースに直接入っている画像・PDF は backup/db/<写真ID>.<拡張子> に置く。
//   動画は容量が大きいのでコピーしない。バックアップは消さない（削除済みの猶予が過ぎても残る）。
// 片付け：「削除済み」の猶予（30日）が過ぎたものを、Blob の原本ごと消す。

/**
 * バックアップ用ストアの書き込みキー。Vercel でストアを頭の名前「BACKUP」でつなぐと
 * BACKUP_READ_WRITE_TOKEN になる（BLOB_ の部分が置き換わる）。手で入れたときの BACKUP_BLOB_READ_WRITE_TOKEN も読む
 */
function backupToken(): string | undefined {
  return process.env.BACKUP_READ_WRITE_TOKEN || process.env.BACKUP_BLOB_READ_WRITE_TOKEN || undefined;
}

export function isBackupConfigured(): boolean {
  return Boolean(backupToken());
}

function extOf(mime: string | null | undefined): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  return m ? { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") } : null;
}

/** まだバックアップしていない写真を、期限までに上限件数だけコピーする */
export async function backupNewPhotos(opts: { limit: number; deadline: number }): Promise<{ copied: number; failed: number; remaining: boolean }> {
  const token = backupToken();
  if (!token) return { copied: 0, failed: 0, remaining: false };
  // 中身（dataUrl）は1件ずつ読む（まとめて読むと PDF でメモリが大きくなる）。
  // 失敗したものは backupFailedAt を付けて後回しにし、新しいものが詰まらないようにする（1日たったら再挑戦）
  const retryBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.photo.findMany({
    where: { backedUpAt: null, isVideo: false, OR: [{ backupFailedAt: null }, { backupFailedAt: { lt: retryBefore } }] },
    select: { id: true, blobPath: true, mimeType: true },
    orderBy: [{ backupFailedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: opts.limit,
  });
  let copied = 0;
  let failed = 0;
  for (const r of rows) {
    if (Date.now() > opts.deadline) return { copied, failed, remaining: true };
    try {
      let body: Buffer;
      let mime: string;
      let path: string;
      if (r.blobPath) {
        if (!isBlobConfigured()) throw new Error("blob not configured");
        const res = await fetch(await signedReadUrl(r.blobPath), { cache: "no-store" });
        if (!res.ok) throw new Error(`read ${res.status}`);
        body = Buffer.from(await res.arrayBuffer());
        mime = r.mimeType || res.headers.get("content-type") || "application/octet-stream";
        path = `backup/${r.blobPath}`;
      } else if (await db.photo.count({ where: { id: r.id, dataUrl: { not: null } } })) {
        const row = await db.photo.findUnique({ where: { id: r.id }, select: { dataUrl: true } });
        const d = row?.dataUrl ? decodeDataUrl(row.dataUrl) : null;
        if (!d) throw new Error("bad dataUrl");
        body = d.buffer;
        mime = d.mime;
        path = `backup/db/${r.id}.${extOf(d.mime)}`;
      } else {
        // 中身の無い写真は印だけ付ける
        await db.photo.update({ where: { id: r.id }, data: { backedUpAt: new Date() } });
        continue;
      }
      await put(path, body, { access: "private", token, contentType: mime, addRandomSuffix: false, allowOverwrite: true });
      await db.photo.update({ where: { id: r.id }, data: { backedUpAt: new Date(), backupFailedAt: null } });
      copied += 1;
    } catch (e) {
      failed += 1;
      await db.photo.update({ where: { id: r.id }, data: { backupFailedAt: new Date() } }).catch(() => {});
      console.error("[backup] failed", r.id, e instanceof Error ? e.message : e);
    }
  }
  return { copied, failed, remaining: rows.length === opts.limit };
}

/**
 * 「削除済み」の猶予が過ぎたものを、Blob の原本ごと消す。
 * ただし、同じ原本をまだほかの写真や（猶予中の）削除済みが使っていれば、原本は残して行だけ消す。
 */
export async function purgeTrash(): Promise<number> {
  const rows = await db.deletedMedia.findMany({ where: { purgeAfter: { lt: new Date() } }, select: { id: true, blobPath: true }, take: 500 });
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const paths = Array.from(new Set(rows.map((r) => r.blobPath).filter((p): p is string => !!p)));
  const [livePhotos, otherTrash] = paths.length
    ? await Promise.all([
        db.photo.findMany({ where: { blobPath: { in: paths } }, select: { blobPath: true } }),
        db.deletedMedia.findMany({ where: { blobPath: { in: paths }, id: { notIn: ids } }, select: { blobPath: true } }),
      ])
    : [[], []];
  const stillUsed = new Set([...livePhotos, ...otherTrash].map((r) => r.blobPath));
  await deleteBlobPaths(paths.filter((p) => !stillUsed.has(p)));
  await db.deletedMedia.deleteMany({ where: { id: { in: ids } } });
  return rows.length;
}
