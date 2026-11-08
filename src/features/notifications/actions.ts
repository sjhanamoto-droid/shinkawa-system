"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isAllowedPushEndpoint, sendPushToUser } from "@/lib/push";

// アプリ内通知 & Web Push 購読のサーバーアクション（フロント側）。
// 通知の生成（Cron / バックエンド）は別担当。ここは本人の閲覧・既読・購読管理のみ。
// すべて requireUser で本人に限定する。

export type NotificationActionState = { ok?: boolean; error?: string };

// クライアントへ渡す通知の形（必要な項目のみ・createdAt は Date のまま渡す）
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: Date;
};

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  read: true,
  createdAt: true,
} as const;

const LIST_LIMIT = 50;

/** 自分の通知を新しい順で取得する（最新 50 件）。 */
export async function listNotifications(): Promise<NotificationItem[]> {
  const me = await requireUser();
  return db.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: NOTIFICATION_SELECT,
  });
}

/** 自分の未読件数を返す。 */
export async function unreadCount(): Promise<number> {
  const me = await requireUser();
  return db.notification.count({ where: { userId: me.id, read: false } });
}

/** 指定の通知を既読にする（本人の通知のみ）。 */
export async function markRead(id: string): Promise<NotificationActionState> {
  const me = await requireUser();
  if (!id) return { error: "通知が見つかりません" };
  try {
    // updateMany + userId 条件で他人の通知を触れないようにする
    await db.notification.updateMany({
      where: { id, userId: me.id, read: false },
      data: { read: true },
    });
  } catch {
    return { error: "既読にできませんでした。時間をおいて再度お試しください" };
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 自分の未読をすべて既読にする。 */
export async function markAllRead(): Promise<NotificationActionState> {
  const me = await requireUser();
  try {
    await db.notification.updateMany({
      where: { userId: me.id, read: false },
      data: { read: true },
    });
  } catch {
    return { error: "既読にできませんでした。時間をおいて再度お試しください" };
  }
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Web Push 購読 ──
// 鍵は base64url。p256dh は公開鍵（65バイト＝87文字）、auth は16バイト（22文字）。末尾の = は許す
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const subscribeSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "購読情報が不正です"),
  keys: z.object({
    p256dh: z.string().regex(B64URL).refine((k) => k.replace(/=+$/, "").length === 87),
    auth: z.string().regex(B64URL).refine((k) => k.replace(/=+$/, "").length === 22),
  }),
});
/** 1人が通知を受け取れる端末の数（超えたら古い登録から消す） */
const MAX_PUSH_DEVICES = 10;
/** テスト通知の間隔 */
const TEST_INTERVAL_MS = 60_000;

/** Web Push の購読情報を保存する（endpoint 一意で upsert・本人に紐づけ）。 */
export async function subscribePush(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<NotificationActionState> {
  const me = await requireUser();
  const parsed = subscribeSchema.safeParse(sub);
  if (!parsed.success) return { error: "購読情報が不正です" };
  const { endpoint, keys } = parsed.data;
  try {
    await db.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth },
      create: { userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });
    // 今オンにした端末は残す（古い端末を登録し直したときに、すぐ消さない）
    const extra = await db.pushSubscription.findMany({
      where: { userId: me.id, endpoint: { not: endpoint } },
      orderBy: { createdAt: "desc" },
      skip: MAX_PUSH_DEVICES - 1,
      select: { id: true },
    });
    if (extra.length) await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
  } catch {
    return { error: "通知の登録に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}

/** Web Push の購読を解除する（自分の購読のみ削除）。 */
export async function unsubscribePush(
  endpoint: string,
): Promise<NotificationActionState> {
  const me = await requireUser();
  if (!endpoint) return { error: "購読情報が不正です" };
  try {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
  } catch {
    return { error: "通知の解除に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true };
}

/**
 * 自分の端末へテストのプッシュ通知を即時送信する（動作確認用）。
 * アプリ内通知は作らず、Web Push の経路だけを検証する。購読が無ければその旨を返す。
 */
export async function sendTestNotification(): Promise<
  { ok: true; sent: number } | { error: string }
> {
  const me = await requireUser();
  const subs = await db.pushSubscription.count({ where: { userId: me.id } });
  if (subs === 0) {
    return {
      error:
        "この端末で通知が有効になっていません。先に「プッシュ通知」をオンにして許可してください。",
    };
  }
  // 連打を防ぐ（1分に1回）。同時に押されても1回だけ通るよう、条件付きの更新で判定する
  const now = new Date();
  const claimed = await db.user.updateMany({
    where: { id: me.id, OR: [{ lastPushTestAt: null }, { lastPushTestAt: { lt: new Date(now.getTime() - TEST_INTERVAL_MS) } }] },
    data: { lastPushTestAt: now },
  });
  if (claimed.count === 0) return { error: "テスト通知は1分に1回まで送れます。少し待ってからお試しください" };
  try {
    await sendPushToUser(me.id, {
      title: "テスト通知",
      body: "この通知が届いていれば設定は正常です 🎉",
      url: "/",
    });
  } catch {
    return { error: "テスト通知の送信に失敗しました。時間をおいて再度お試しください" };
  }
  return { ok: true, sent: subs };
}
