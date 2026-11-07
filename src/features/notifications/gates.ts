import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import type { PendingClaim } from "@/features/claims/claim-gate";
import { CLAIM_VIEW_SELECT } from "@/features/claims/claim-body";
import { claimVisibleWhere, involvedNames } from "@/features/claims/queries";

// 画面を開いたときに先に見せるもの（管理画面・スタッフ画面で共通）。
// まだ確認していないクレームがあればそれが先、無ければ未読の通知。
export async function loadGateData(user: CurrentUser) {
  const [unreadCount, unread, pendingAcks] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, title: true, body: true, href: true, read: true, createdAt: true },
    }),
    // まだ確認していないクレーム（古い順）。確認するまで他の画面に進めない
    db.claimAck.findMany({
      where: { userId: user.id, ackAt: null, claim: claimVisibleWhere(user) },
      orderBy: { claim: { createdAt: "asc" } },
      take: 20,
      select: { claim: { select: { id: true, createdBy: { select: { name: true } }, ...CLAIM_VIEW_SELECT } } },
    }),
  ]);
  const pendingClaims: PendingClaim[] = await Promise.all(
    pendingAcks.map(async ({ claim: { createdBy, ...c } }) => ({
      ...c,
      involved: await involvedNames(c.involvedUserIds, c.involvedOthers),
      createdByName: createdBy?.name ?? null,
    })),
  );
  return { unreadCount, unread, pendingClaims };
}
