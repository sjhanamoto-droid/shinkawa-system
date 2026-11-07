"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isPlanner } from "@/lib/permissions";
import { deleteBlobPaths } from "@/lib/media";
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
  await db.photo.delete({ where: { id: p.id } });
  if (p.blobPath) await deleteBlobPaths([p.blobPath]).catch(() => {});
  revalidatePath(`/w/sites/${p.propertyId}`);
  revalidatePath(`/properties/${p.propertyId}`);
  return {};
}
