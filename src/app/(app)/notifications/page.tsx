import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { listNotifications } from "@/features/notifications/actions";
import { NotificationList } from "@/features/notifications/notification-list";

// 通知センター：自分の通知を新しい順で表示する。
// 未読の強調・タップで遷移＆既読化・「すべて既読」は NotificationList（クライアント）が担う。
export default async function NotificationsPage() {
  const me = await requireUser();
  const canSend = can(me, "announcement.send");
  const notifications = await listNotifications();

  return (
    <div>
      <PageHeader title="通知" subtitle="現場・日報のお知らせ" />
      <PageContainer size="narrow">
        <Link href="/announcements" className="card tap-row mb-4 flex items-center gap-3.5 p-4 transition-all hover:border-line-strong">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Megaphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">全体連絡</p>
            <p className="truncate text-xs text-ink-muted">{canSend ? "役割ごと・全員に一括で連絡を送る・送った連絡の既読" : "会社からのお知らせ・行事の一覧"}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
        </Link>
        <NotificationList initial={notifications} />
      </PageContainer>
    </div>
  );
}
