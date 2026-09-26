import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { AnnouncementForm } from "@/features/announcements/announcement-form";
import { audienceRoleCounts } from "@/features/claims/queries";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const me = await requireCan("announcement.send");
  const roleCounts = await audienceRoleCounts(me.id);

  return (
    <div>
      <PageHeader title="全体連絡を送る" backHref="/announcements" />
      <PageContainer size="narrow">
        <AnnouncementForm roleCounts={roleCounts} />
      </PageContainer>
    </div>
  );
}
