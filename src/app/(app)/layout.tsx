import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";
import { StartupGate } from "@/features/notifications/startup-gate";
import { ClaimGate, type PendingClaim } from "@/features/claims/claim-gate";
import { CLAIM_VIEW_SELECT } from "@/features/claims/claim-body";
import { claimVisibleWhere } from "@/features/claims/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";

  // 起動ゲート＆通知バッジ用の未読データ
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
  const pendingClaims: PendingClaim[] = pendingAcks.map(({ claim: { createdBy, ...c } }) => ({ ...c, createdByName: createdBy?.name ?? null }));

  const actor = { id: user.id, role: user.role, department: user.department, kind: user.kind };

  return (
    <div className="min-h-dvh bg-surface-subtle">
      <AppFrame user={user} initialCollapsed={collapsed} unreadCount={unreadCount}>
        {children}
      </AppFrame>
      <BottomNav actor={actor} unreadCount={unreadCount} />
      {/* クレームの確認が先。確認が済んだら、起動ゲート（未読通知）を出す */}
      {pendingClaims.length > 0 ? <ClaimGate claims={pendingClaims} /> : <StartupGate items={unread} />}
    </div>
  );
}
