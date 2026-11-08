import "server-only";
import type { Prisma } from "@prisma/client";

// 写真・図面・領収書の削除は、すぐには消さず「削除済み」（DeletedMedia）へ移す。
// Blob の原本もこの間は消さない。TRASH_DAYS が過ぎたら毎日のチェック（purgeTrash）で原本ごと消す。
// それまでは最高管理者・事務が「削除済み」から元に戻せる（同じIDで写真に戻す）。

export const TRASH_DAYS = 30;

type Tx = Prisma.TransactionClient;

const PHOTO_FIELDS = {
  id: true,
  propertyId: true,
  occurrenceId: true,
  reportId: true,
  claimId: true,
  dataUrl: true,
  thumbUrl: true,
  blobPath: true,
  mimeType: true,
  sizeBytes: true,
  duration: true,
  caption: true,
  kind: true,
  isVideo: true,
  width: true,
  height: true,
  createdById: true,
  createdAt: true,
  revision: true,
  replacesId: true,
  supersededAt: true,
  backedUpAt: true,
} satisfies Prisma.PhotoSelect;

/**
 * 条件に合う写真を「削除済み」へ移す（写真の行は消し、中身は DeletedMedia に残す）。移した件数を返す。
 * 呼び出し側は Blob を消さないこと（猶予が過ぎたら purgeTrash が消す）。
 *
 * 図面の版の扱い：
 * - 既定：消すのはその版だけ。最新版を消したら1つ前の版が最新に戻る（ほかの人が上げた前の版を巻き込まない）。
 * - withHistory：その図面を過去の版ごと消す（現場の編集で図面を外したとき）。keepIds は残すもの（古い画面から保存したときに巻き込まない）。
 */
export async function trashPhotos(
  tx: Tx,
  where: Prisma.PhotoWhereInput,
  opts: { actorId: string | null; reason: string; withHistory?: boolean; keepIds?: string[] },
): Promise<number> {
  const rows = await tx.photo.findMany({ where, select: PHOTO_FIELDS });
  if (rows.length === 0) return 0;
  const keep = new Set(opts.keepIds ?? []);
  const seen = new Set(rows.map((r) => r.id));
  if (opts.withHistory) {
    let prev = rows.map((r) => r.replacesId).filter((x): x is string => !!x && !seen.has(x) && !keep.has(x));
    while (prev.length > 0) {
      const more = await tx.photo.findMany({ where: { id: { in: prev } }, select: PHOTO_FIELDS });
      for (const m of more) {
        seen.add(m.id);
        rows.push(m);
      }
      prev = more.map((m) => m.replacesId).filter((x): x is string => !!x && !seen.has(x) && !keep.has(x));
    }
  }
  const ids = rows.map((r) => r.id);

  // 消す版の前後をつなぎ直す（版を1つだけ消したとき）
  for (const r of rows) {
    if (!r.replacesId || seen.has(r.replacesId)) continue;
    if (!r.supersededAt) {
      // 最新版を消した → 1つ前の版を最新に戻す
      await tx.photo.updateMany({ where: { id: r.replacesId }, data: { supersededAt: null } });
    }
    // 間の版を消した → 次の版が、消した版の前の版を指すようにする
    await tx.photo.updateMany({ where: { replacesId: r.id, id: { notIn: ids } }, data: { replacesId: r.replacesId } });
  }

  // 領収書は、付いていた経費を覚えておく（元に戻すときにつなぎ直す）
  const expenses = await tx.reportExpense.findMany({ where: { receiptPhotoId: { in: ids } }, select: { id: true, receiptPhotoId: true } });
  const expenseOf = new Map(expenses.map((e) => [e.receiptPhotoId!, e.id]));

  const purgeAfter = new Date(Date.now() + TRASH_DAYS * 24 * 60 * 60 * 1000);
  await tx.deletedMedia.createMany({
    data: rows.map((r) => ({ ...r, deletedById: opts.actorId, purgeAfter, reason: opts.reason, expenseId: expenseOf.get(r.id) ?? null })),
    skipDuplicates: true,
  });
  await tx.photo.deleteMany({ where: { id: { in: ids } } });
  return rows.length;
}

/** 戻す先（現場・日報・クレーム・予定）が残っているか */
export async function trashParentExists(tx: Tx | typeof import("@/lib/db").db, d: { propertyId: string | null; reportId: string | null; claimId: string | null; occurrenceId: string | null }): Promise<string | null> {
  if (d.propertyId && !(await tx.property.findUnique({ where: { id: d.propertyId }, select: { id: true } }))) return "元の現場が削除されているため戻せません";
  if (d.reportId && !(await tx.dailyReport.findUnique({ where: { id: d.reportId }, select: { id: true } }))) return "元の日報が削除されているため戻せません";
  if (d.claimId && !(await tx.claim.findUnique({ where: { id: d.claimId }, select: { id: true } }))) return "元のクレームが削除されているため戻せません";
  if (d.occurrenceId && !(await tx.occurrence.findUnique({ where: { id: d.occurrenceId }, select: { id: true } }))) return "元の予定が削除されているため戻せません";
  return null;
}

/**
 * 削除済みから写真に戻す（同じIDで）。
 * 図面：新しい版が残っていれば過去の版として戻し、残っていなければ最新版として戻す（前の版は過去の版に戻す）。
 * 領収書：付いていた経費が残っていて、別の領収書が付いていなければつなぎ直す。
 */
export async function restoreTrashed(tx: Tx, id: string): Promise<{ error?: string }> {
  const d = await tx.deletedMedia.findUnique({ where: { id } });
  if (!d || d.purgeAfter <= new Date()) return { error: "見つかりません（猶予が過ぎて完全に削除された可能性があります）" };
  const parentError = await trashParentExists(tx, d);
  if (parentError) return { error: parentError };
  const { deletedById: _a, deletedAt: _b, purgeAfter: _c, reason: _d, expenseId, ...photo } = d;
  void _a;
  void _b;
  void _c;
  void _d;

  const successor = await tx.photo.findFirst({ where: { replacesId: d.id }, select: { id: true } });
  let supersededAt: Date | null = null;
  if (successor) {
    supersededAt = d.supersededAt ?? new Date();
  } else if (d.replacesId) {
    // 最新版として戻す → 今最新になっている前の版は、過去の版に戻す
    await tx.photo.updateMany({ where: { id: d.replacesId, supersededAt: null }, data: { supersededAt: new Date() } });
  }
  await tx.photo.create({ data: { ...photo, supersededAt } });

  if (expenseId) {
    await tx.reportExpense.updateMany({ where: { id: expenseId, receiptPhotoId: null }, data: { receiptPhotoId: d.id } });
  }
  await tx.deletedMedia.delete({ where: { id } });
  return {};
}
