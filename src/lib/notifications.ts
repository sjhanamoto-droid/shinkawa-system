// アプリ内通知の生成ユーティリティ。
//
// Notification を作成し（dedupeKey があれば重複生成を防止）、新規作成できた場合のみ
// 当該ユーザーへ Web Push を送る。push の失敗は握りつぶす（通知本体の作成は成功扱い）。
// LINE 通知（Phase 3）はここに経路を追加する。

import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import type { NotificationType } from "@/lib/constants";

export type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  occurrenceId?: string;
  propertyId?: string;
  dedupeKey?: string;
};

export type NotificationPayload = Omit<NotificationInput, "userId">;

/**
 * 通知を1件作成する。
 * - dedupeKey あり: 既存があればスキップ（false）。無ければ upsert で作成（push あり）。
 * - dedupeKey なし: 常に作成（push あり）。
 * 戻り値は「新規作成したか」。
 */
export async function createNotification(input: NotificationInput): Promise<boolean> {
  const { userId, type, title, body, href, occurrenceId, propertyId, dedupeKey } = input;

  if (dedupeKey) {
    const existing = await db.notification.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      select: { id: true },
    });
    if (existing) return false;

    await db.notification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey } },
      create: { userId, type, title, body, href, occurrenceId, propertyId, dedupeKey },
      update: {},
    });
  } else {
    await db.notification.create({
      data: { userId, type, title, body, href, occurrenceId, propertyId },
    });
  }

  try {
    await sendPushToUser(userId, { title, body, url: href });
  } catch (err) {
    console.error("[notifications] push 送信に失敗しました", err);
  }

  return true;
}

/**
 * 複数ユーザーへ同一内容の通知を配る。userId は重複除去する。戻り値は新規作成できた件数。
 */
export async function createNotificationForUsers(
  userIds: string[],
  payload: NotificationPayload,
): Promise<number> {
  let created = 0;
  for (const userId of new Set(userIds)) {
    if (await createNotification({ ...payload, userId })) created++;
  }
  return created;
}
