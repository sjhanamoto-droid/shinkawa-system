import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";
import { StartupGate } from "@/features/notifications/startup-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";

  // 起動ゲート＆通知バッジ用の未読データ
  const [unreadCount, unread] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }),
    db.notification.findMany({
      where: { userId: user.id, read: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, title: true, body: true, href: true, read: true, createdAt: true },
    }),
  ]);

  const actor = { id: user.id, role: user.role, department: user.department };

  return (
    <div className="min-h-dvh bg-surface-subtle">
      <AppFrame user={user} initialCollapsed={collapsed} unreadCount={unreadCount}>
        {children}
      </AppFrame>
      <BottomNav actor={actor} unreadCount={unreadCount} />
      {/* 起動ゲート：未読があれば全画面で最前面に表示し、既読化までブロック */}
      <StartupGate items={unread} />
    </div>
  );
}
