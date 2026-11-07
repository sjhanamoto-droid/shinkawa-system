import { requireUser } from "@/lib/session";
import { listNotifications } from "@/features/notifications/actions";
import { NotificationList } from "@/features/notifications/notification-list";
import { WorkerSubPage } from "@/features/worker/ui/sub-page";

export const dynamic = "force-dynamic";

export default async function WorkerNotifications() {
  const me = await requireUser();
  const notifications = await listNotifications();
  return (
    <WorkerSubPage userId={me.id} title="お知らせ" backHref="/w/menu">
      <NotificationList initial={notifications} />
    </WorkerSubPage>
  );
}
