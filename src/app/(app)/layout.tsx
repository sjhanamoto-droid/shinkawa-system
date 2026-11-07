import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { AppFrame, SIDEBAR_COOKIE } from "@/components/app-shell/app-frame";
import { StartupGate } from "@/features/notifications/startup-gate";
import { ClaimGate } from "@/features/claims/claim-gate";
import { loadGateData } from "@/features/notifications/gates";
import { getCategories } from "@/lib/categories-server";
import { CategoryProvider } from "@/components/category-provider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = await cookies();
  const collapsed = store.get(SIDEBAR_COOKIE)?.value === "1";

  // 起動ゲート＆通知バッジ用の未読データ
  const [{ unreadCount, unread, pendingClaims }, categories] = await Promise.all([loadGateData(user), getCategories()]);

  const actor = { id: user.id, role: user.role, department: user.department, kind: user.kind };

  return (
    <CategoryProvider categories={categories}>
    <div className="min-h-dvh bg-surface-subtle">
      <AppFrame user={user} initialCollapsed={collapsed} unreadCount={unreadCount}>
        {children}
      </AppFrame>
      <BottomNav actor={actor} unreadCount={unreadCount} />
      {/* クレームの確認が先。確認が済んだら、起動ゲート（未読通知）を出す */}
      {pendingClaims.length > 0 ? <ClaimGate claims={pendingClaims} /> : <StartupGate items={unread} />}
    </div>
    </CategoryProvider>
  );
}
