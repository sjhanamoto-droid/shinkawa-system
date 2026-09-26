"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { sendPushToUser } from "@/lib/push";
import { deleteBlobPaths } from "@/lib/media";
import { parseAndValidatePhotosField } from "@/lib/photos";
import { isExpenseDate } from "@/lib/reports";
import { ANNOUNCEMENT_WORKER_KINDS, claimDedupeKey, normalizeAudience } from "@/lib/announcements";

export type ClaimFormState = { error?: string };

const CLAIM_PHOTO_KINDS = new Set(["WORK", "BEFORE", "AFTER", "OTHER"]);

function text(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

/** クレームを登録（新規は宛先に通知して確認を求める）・編集する（最高管理者・事務・経理＝OWNER / OFFICE） */
export async function saveClaim(_prev: ClaimFormState, fd: FormData): Promise<ClaimFormState> {
  const me = await requireUser();
  if (!can(me, "claim.manage")) return { error: "クレームを登録する権限がありません" };

  const id = text(fd, "id", 50);
  const title = text(fd, "title", 80);
  const content = text(fd, "content", 4000);
  const cause = text(fd, "cause", 4000);
  const prevention = text(fd, "prevention", 4000);
  const occurredOn = text(fd, "occurredOn", 10);
  const propertyId = text(fd, "propertyId", 50);
  const siteContact = text(fd, "siteContact", 100);
  const involvedOthers = text(fd, "involvedOthers", 200);
  const pickedIds = [...new Set(fd.getAll("involvedUserIds").map(String).filter(Boolean))].slice(0, 50);

  if (!title) return { error: "件名を入力してください" };
  if (!content) return { error: "クレームの内容を入力してください" };
  if (occurredOn && !isExpenseDate(occurredOn)) return { error: "発生日が正しくありません" };
  if (propertyId && !(await db.property.findUnique({ where: { id: propertyId }, select: { id: true } }))) {
    return { error: "現場が見つかりません。選び直してください" };
  }
  // 関わった人は、実在する作業者だけ残す
  const involvedUserIds = pickedIds.length
    ? (await db.user.findMany({ where: { id: { in: pickedIds } }, select: { id: true } })).map((u) => u.id)
    : [];
  const photos = parseAndValidatePhotosField(String(fd.get("photos") ?? ""));
  if ("error" in photos) return { error: photos.error };

  const fields = {
    title,
    content,
    cause: cause || null,
    prevention: prevention || null,
    occurredOn: occurredOn || null,
    propertyId: propertyId || null,
    siteContact: siteContact || null,
    involvedUserIds: pickedIds.filter((id) => involvedUserIds.includes(id)),
    involvedOthers: involvedOthers || null,
  };
  const photoRows = (claimId: string) =>
    photos.added.map((p) => ({
      claimId,
      kind: CLAIM_PHOTO_KINDS.has(p.kind) ? p.kind : "WORK",
      dataUrl: p.dataUrl ?? null,
      thumbUrl: p.thumbUrl ?? null,
      blobPath: p.blobPath ?? null,
      mimeType: p.mimeType ?? null,
      sizeBytes: p.sizeBytes ?? null,
      duration: p.duration ?? null,
      caption: p.caption.trim() === "" ? null : p.caption.trim().slice(0, 200),
      isVideo: p.isVideo,
      width: p.width ?? null,
      height: p.height ?? null,
      createdById: me.id,
    }));

  // ── 編集：内容と写真だけ直す（宛先・確認状況はそのまま、通知もし直さない） ──
  if (id) {
    const gone = await db.$transaction(async (tx) => {
      const updated = await tx.claim.updateMany({ where: { id }, data: fields });
      if (updated.count === 0) return null;
      const gonePhotos = await tx.photo.findMany({
        where: { claimId: id, id: { notIn: photos.kept } },
        select: { id: true, blobPath: true },
      });
      if (gonePhotos.length) await tx.photo.deleteMany({ where: { id: { in: gonePhotos.map((p) => p.id) } } });
      if (photos.added.length) await tx.photo.createMany({ data: photoRows(id) });
      return gonePhotos.map((p) => p.blobPath).filter((p): p is string => !!p);
    });
    if (gone === null) return { error: "クレームが見つかりません（削除された可能性があります）" };
    await deleteBlobPaths(gone);
    revalidatePath("/claims");
    revalidatePath(`/claims/${id}`);
    redirect(`/claims/${id}?toast=${encodeURIComponent("保存しました")}`);
  }

  // ── 新規：宛先の社員・アルバイトに通知し、確認を求める ──
  const audience = normalizeAudience(fd.getAll("audience").map(String));
  if (audience.length === 0) return { error: "共有する相手を選んでください" };
  const recipients = await db.user.findMany({
    where: {
      active: true,
      canLogin: true,
      kind: { in: ANNOUNCEMENT_WORKER_KINDS },
      id: { not: me.id },
      ...(audience.includes("ALL") ? {} : { role: { in: audience } }),
    },
    select: { id: true },
  });
  if (recipients.length === 0) return { error: "共有する相手がいません（ログインできる人がいない役割です）" };

  const property = propertyId ? await db.property.findUnique({ where: { id: propertyId }, select: { name: true } }) : null;
  const notice = {
    type: "CLAIM",
    title: `【クレーム再発防止】${title}`,
    body: [property?.name, content.length > 80 ? `${content.slice(0, 80)}…` : content].filter(Boolean).join("：") || null,
  };

  const claim = await db.$transaction(async (tx) => {
    const created = await tx.claim.create({
      data: { ...fields, audience, recipientCount: recipients.length, createdById: me.id },
      select: { id: true },
    });
    if (photos.added.length) await tx.photo.createMany({ data: photoRows(created.id) });
    await tx.claimAck.createMany({ data: recipients.map((r) => ({ claimId: created.id, userId: r.id })), skipDuplicates: true });
    await tx.notification.createMany({
      data: recipients.map((r) => ({
        ...notice,
        userId: r.id,
        href: `/claims/${created.id}`,
        dedupeKey: claimDedupeKey(created.id),
      })),
      skipDuplicates: true,
    });
    return created;
  });
  // スマホへのプッシュは画面を返したあとに並列で送る
  after(async () => {
    await Promise.allSettled(
      recipients.map((r) => sendPushToUser(r.id, { title: notice.title, body: notice.body ?? undefined, url: `/claims/${claim.id}` })),
    );
  });

  revalidatePath("/claims");
  revalidatePath("/", "layout");
  redirect(`/claims/${claim.id}?toast=${encodeURIComponent(`${recipients.length}名に共有しました`)}`);
}

/** 「確認しました」：自分の確認を記録し、通知も既読にする */
export async function acknowledgeClaim(id: string): Promise<{ error?: string }> {
  const me = await requireUser();
  const r = await db.claimAck.updateMany({ where: { claimId: id, userId: me.id, ackAt: null }, data: { ackAt: new Date() } });
  await db.notification.updateMany({ where: { userId: me.id, dedupeKey: claimDedupeKey(id), read: false }, data: { read: true } });
  if (r.count > 0) {
    revalidatePath("/claims");
    revalidatePath(`/claims/${id}`);
  }
  revalidatePath("/", "layout");
  return {};
}

/** クレームを削除する（写真・確認状況・届いた通知も消す） */
export async function deleteClaim(id: string): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!can(me, "claim.manage")) return { error: "削除する権限がありません" };
  const blobs = await db.photo.findMany({ where: { claimId: id, blobPath: { not: null } }, select: { blobPath: true } });
  const [, removed] = await db.$transaction([
    db.notification.deleteMany({ where: { dedupeKey: claimDedupeKey(id) } }),
    db.claim.deleteMany({ where: { id } }),
  ]);
  if (removed.count === 0) return { error: "クレームが見つかりません（すでに削除されています）" };
  await deleteBlobPaths(blobs.map((b) => b.blobPath).filter((p): p is string => !!p));
  revalidatePath("/claims");
  revalidatePath("/", "layout");
  redirect(`/claims?toast=${encodeURIComponent("削除しました")}`);
}
