import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { ROLE_OPTIONS, type Role } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { AnnouncementForm } from "@/features/announcements/announcement-form";
import { ANNOUNCEMENT_WORKER_KINDS } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const me = await requireCan("announcement.send");
  // 役割ごとの送れる人数（ログインできる在籍者。自分は除く）
  const groups = await db.user.groupBy({
    by: ["role"],
    where: { active: true, canLogin: true, kind: { in: ANNOUNCEMENT_WORKER_KINDS }, id: { not: me.id } },
    _count: { _all: true },
  });
  const roleCounts = Object.fromEntries(ROLE_OPTIONS.map((r) => [r, groups.find((g) => g.role === r)?._count._all ?? 0])) as Record<Role, number>;

  return (
    <div>
      <PageHeader title="全体連絡を送る" backHref="/announcements" />
      <PageContainer size="narrow">
        <AnnouncementForm roleCounts={roleCounts} />
      </PageContainer>
    </div>
  );
}
