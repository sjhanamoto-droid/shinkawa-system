"use server";

import { reusedBlobPathError } from "@/lib/blob-reuse";
import { trashPhotos } from "@/lib/trash";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isPlanner } from "@/lib/permissions";
import { parseAndValidatePhotosField } from "@/lib/photos";

// スタッフ画面の現場の詳細から、現場の写真・図面を追加する（現場の編集権限が無くても追加はできる）。
// 消せるのは自分が追加したもの（予定を扱う役割は全部）。

export type SitePhotoKind = "WORK" | "DRAWING";
const MAX_PER_UPLOAD = 10;

export async function addSitePhotos(propertyId: string, kind: SitePhotoKind, photosJson: string): Promise<{ error?: string; added?: number }> {
  const me = await requireUser();
  if (kind !== "WORK" && kind !== "DRAWING") return { error: "種類が正しくありません" };
  const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) return { error: "現場が見つかりません" };
  const parsed = parseAndValidatePhotosField(typeof photosJson === "string" ? photosJson : "");
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.added.length === 0) return { error: "写真を選んでください" };
  if (parsed.added.length > MAX_PER_UPLOAD) return { error: `一度に追加できるのは${MAX_PER_UPLOAD}件までです` };
  if (parsed.added.some((p) => p.isVideo)) return { error: "動画は追加できません（写真・PDFのみ）" };
  const reused = await reusedBlobPathError(parsed.added.map((p) => p.blobPath), me.id);
  if (reused) return { error: reused };

  await db.photo.createMany({
    data: parsed.added.map((p) => ({
      propertyId,
      kind,
      dataUrl: p.dataUrl ?? null,
      thumbUrl: p.thumbUrl ?? null,
      blobPath: p.blobPath ?? null,
      mimeType: p.mimeType ?? null,
      sizeBytes: p.sizeBytes ?? null,
      caption: p.caption.trim() === "" ? null : p.caption.trim().slice(0, 200),
      isVideo: false,
      width: p.width ?? null,
      height: p.height ?? null,
      createdById: me.id,
    })),
  });
  revalidatePath(`/w/sites/${propertyId}`);
  revalidatePath(`/properties/${propertyId}`);
  return { added: parsed.added.length };
}

export async function deleteSitePhoto(photoId: string): Promise<{ error?: string }> {
  const me = await requireUser();
  const p = await db.photo.findUnique({ where: { id: photoId }, select: { id: true, propertyId: true, reportId: true, createdById: true, blobPath: true } });
  if (!p || !p.propertyId || p.reportId) return { error: "写真が見つかりません" };
  if (p.createdById !== me.id && !isPlanner(me)) return { error: "自分が追加した写真だけ消せます" };
  // 「削除済み」へ（30日は元に戻せる。Blob の原本もその間は残す）
  await db.$transaction((tx) => trashPhotos(tx, { id: p.id }, { actorId: me.id, reason: "スタッフ画面で削除" }));
  revalidatePath(`/w/sites/${p.propertyId}`);
  revalidatePath(`/properties/${p.propertyId}`);
  return {};
}

/**
 * 図面の改訂版を上げる。新しい版が最新として表示され、前の版は「過去の版」として残る（消さない）。
 * 現場の写真・図面を追加できる人なら誰でも上げられる。
 */
export async function reviseDrawing(photoId: string, photosJson: string): Promise<{ error?: string }> {
  const me = await requireUser();
  const old = await db.photo.findUnique({
    where: { id: photoId },
    select: { id: true, propertyId: true, kind: true, revision: true, caption: true, supersededAt: true },
  });
  if (!old || !old.propertyId || old.kind !== "DRAWING") return { error: "図面が見つかりません" };
  if (old.supersededAt) return { error: "この図面はすでに新しい版があります。最新の版から改訂してください" };
  const parsed = parseAndValidatePhotosField(typeof photosJson === "string" ? photosJson : "");
  if ("error" in parsed) return { error: parsed.error };
  const p = parsed.added[0];
  if (!p || parsed.added.length !== 1) return { error: "改訂版のファイルを1つ選んでください" };
  if (p.isVideo) return { error: "動画は図面にできません" };
  const reused = await reusedBlobPathError([p.blobPath], me.id);
  if (reused) return { error: reused };

  const result = await db.$transaction(async (tx) => {
    // 同時に改訂されても版が分かれないよう、最新のときだけ置き換える
    const r = await tx.photo.updateMany({ where: { id: old.id, supersededAt: null }, data: { supersededAt: new Date() } });
    if (r.count === 0) throw new Error("superseded");
    await tx.photo.create({
      data: {
        propertyId: old.propertyId,
        kind: "DRAWING",
        revision: old.revision + 1,
        replacesId: old.id,
        dataUrl: p.dataUrl ?? null,
        thumbUrl: p.thumbUrl ?? null,
        blobPath: p.blobPath ?? null,
        mimeType: p.mimeType ?? null,
        sizeBytes: p.sizeBytes ?? null,
        caption: p.caption.trim() ? p.caption.trim().slice(0, 200) : old.caption,
        isVideo: false,
        width: p.width ?? null,
        height: p.height ?? null,
        createdById: me.id,
      },
    });
    return "ok" as const;
  }).catch((e) => {
    if (e instanceof Error && e.message === "superseded") return "superseded" as const;
    throw e;
  });
  if (result === "superseded") return { error: "この図面はたった今ほかの人が改訂しました。画面を開き直してください" };
  revalidatePath(`/w/sites/${old.propertyId}`);
  revalidatePath(`/properties/${old.propertyId}`);
  return {};
}
