import "server-only";
import { db } from "./db";

// 新しく足す写真の保存先（blobPath）が、すでにほかの写真・削除済みで使われていないかを確かめる。
// 同じ原本を2つの写真から指せると、片方を消したときに（30日後に）もう片方の原本まで消えるため。
// 保存先はアップロードのたびに乱数で作るので、正しく使っていれば重なることはない。
// 自分が登録したものは断らない（電波が悪く、保存できたのに画面が戻らず、もう一度押したときに通すため）。
// その場合に原本を2つの行が指しても、猶予後の片付け（purgeTrash）はまだ使われている原本を消さない。

export const REUSED_BLOB_ERROR = "このファイルはすでに使われています。もう一度選び直してください";

export async function reusedBlobPathError(paths: (string | null | undefined)[], userId: string): Promise<string | null> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return null;
  if (new Set(list).size !== list.length) return REUSED_BLOB_ERROR;
  // 登録した人が分からない古い行（createdById が空）は、ほかの人のものとして扱う
  const notMine = { OR: [{ createdById: null }, { createdById: { not: userId } }] };
  const [photo, trashed] = await Promise.all([
    db.photo.findFirst({ where: { blobPath: { in: list }, ...notMine }, select: { id: true } }),
    db.deletedMedia.findFirst({ where: { blobPath: { in: list }, ...notMine }, select: { id: true } }),
  ]);
  return photo || trashed ? REUSED_BLOB_ERROR : null;
}
