"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { sendPushToUser } from "@/lib/push";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  ANNOUNCEMENT_WORKER_KINDS,
  announcementDedupeKey,
  isAnnouncementCategory,
  normalizeAudience,
} from "@/lib/announcements";

export type AnnouncementFormState = { error?: string };

const TITLE_MAX = 80;
const BODY_MAX = 4000;

/** 全体連絡を送る（最高管理者・事務・経理）。宛先の役割のログインできる人全員に通知を届ける */
export async function sendAnnouncement(_prev: AnnouncementFormState, fd: FormData): Promise<AnnouncementFormState> {
  const me = await requireUser();
  if (!can(me, "announcement.send")) return { error: "全体連絡を送る権限がありません" };

  const title = String(fd.get("title") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  const category = String(fd.get("category") ?? "");
  const audience = normalizeAudience(fd.getAll("audience").map(String));

  if (!title) return { error: "件名を入力してください" };
  if (title.length > TITLE_MAX) return { error: `件名は${TITLE_MAX}文字までです` };
  if (!body) return { error: "本文を入力してください" };
  if (body.length > BODY_MAX) return { error: `本文は${BODY_MAX}文字までです` };
  if (!isAnnouncementCategory(category) || !ANNOUNCEMENT_CATEGORY_OPTIONS.includes(category)) return { error: "種類を選んでください" };
  if (audience.length === 0) return { error: "送る相手を選んでください" };

  // ログインできる在籍の社員・アルバイトに届ける。送った本人には通知しない
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
  if (recipients.length === 0) return { error: "送る相手がいません（ログインできる人がいない役割です）" };

  const notice = {
    type: "ANNOUNCEMENT",
    title: `【${ANNOUNCEMENT_CATEGORY_LABEL[category]}】${title}`,
    body: body.length > 100 ? `${body.slice(0, 100)}…` : body,
  };
  // 連絡と全員分の通知を一度に作る（途中で止まって一部の人にだけ届く、を防ぐ）
  const a = await db.$transaction(async (tx) => {
    const created = await tx.announcement.create({
      data: { title, body, category, audience, recipientCount: recipients.length, createdById: me.id },
      select: { id: true },
    });
    await tx.notification.createMany({
      data: recipients.map((r) => ({
        ...notice,
        userId: r.id,
        href: `/announcements/${created.id}`,
        dedupeKey: announcementDedupeKey(created.id),
      })),
      skipDuplicates: true,
    });
    return created;
  });
  // スマホへのプッシュは画面を返したあとに並列で送る（失敗しても通知は届いている）
  after(async () => {
    await Promise.allSettled(recipients.map((r) => sendPushToUser(r.id, { title: notice.title, body: notice.body, url: `/announcements/${a.id}` })));
  });

  revalidatePath("/announcements");
  revalidatePath("/", "layout");
  redirect(`/announcements/${a.id}?toast=${encodeURIComponent(`${recipients.length}名に送りました`)}`);
}

/** 開いた全体連絡を既読にする（本人の通知だけ）。設定・メニューの未読件数も更新する */
export async function markAnnouncementRead(id: string): Promise<void> {
  const me = await requireUser();
  const r = await db.notification.updateMany({
    where: { userId: me.id, dedupeKey: announcementDedupeKey(id), read: false },
    data: { read: true },
  });
  if (r.count > 0) revalidatePath("/", "layout");
}

/** 全体連絡を取り消す（届いた通知も消す） */
export async function deleteAnnouncement(id: string): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!can(me, "announcement.send")) return { error: "削除する権限がありません" };
  const [, removed] = await db.$transaction([
    db.notification.deleteMany({ where: { dedupeKey: announcementDedupeKey(id) } }),
    db.announcement.deleteMany({ where: { id } }),
  ]);
  if (removed.count === 0) return { error: "連絡が見つかりません（すでに取り消されています）" };
  revalidatePath("/announcements");
  revalidatePath("/", "layout");
  redirect(`/announcements?toast=${encodeURIComponent("連絡を取り消しました")}`);
}
