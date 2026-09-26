import { notFound } from "next/navigation";
import { avatarUrlFor, requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstDateTimeLabel } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { SearchParamToast } from "@/components/ui/toast";
import { AnnouncementCategoryBadge } from "@/features/announcements/category-badge";
import { DeleteAnnouncementButton } from "@/features/announcements/delete-button";
import { MarkAnnouncementRead } from "@/features/announcements/mark-read";
import { visibleWhere } from "@/features/announcements/queries";
import { announcementDedupeKey, audienceLabel } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const a = await db.announcement.findFirst({
    where: { id, ...visibleWhere(me) },
    select: {
      id: true,
      title: true,
      body: true,
      category: true,
      audience: true,
      recipientCount: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true } },
    },
  });
  if (!a) notFound();
  const key = announcementDedupeKey(a.id);

  const canSend = can(me, "announcement.send");
  const receipts = canSend
    ? await db.notification.findMany({
        where: { dedupeKey: key },
        select: { read: true, user: { select: { id: true, name: true } } },
        orderBy: { user: { sortOrder: "asc" } },
      })
    : [];
  const readCount = receipts.filter((r) => r.read).length;
  const unreadNames = receipts.filter((r) => !r.read).map((r) => r.user.name);

  return (
    <div>
      <PageHeader title="全体連絡" backHref="/announcements" right={canSend && <DeleteAnnouncementButton id={a.id} />} />
      <PageContainer size="narrow">
        <SearchParamToast />
        <MarkAnnouncementRead id={a.id} />
        <div className="space-y-5">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <AnnouncementCategoryBadge category={a.category} />
              <span className="text-xs text-ink-faint">{jstDateTimeLabel(a.createdAt)}</span>
            </div>
            <h1 className="text-lg font-black leading-snug text-ink">{a.title}</h1>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              {a.createdBy && <Avatar name={a.createdBy.name} color={a.createdBy.avatarColor} image={avatarUrlFor(a.createdBy)} size="sm" />}
              <span className="font-semibold">{a.createdBy?.name ?? "—"}</span>
              <span className="text-ink-faint">→ {audienceLabel(a.audience)}</span>
            </div>
            <p className="whitespace-pre-wrap border-t border-line pt-3 text-[15px] leading-relaxed text-ink">{a.body}</p>
          </Card>

          {canSend && (
            <section className="space-y-2">
              <SectionTitle>
                既読 {readCount} / {receipts.length}名
              </SectionTitle>
              <Card className="p-4 text-sm">
                {receipts.length === 0 ? (
                  <p className="text-ink-muted">届いた人はいません</p>
                ) : unreadNames.length === 0 ? (
                  <p className="font-semibold text-emerald-700">全員が読みました</p>
                ) : (
                  <p className="text-ink-soft">
                    <span className="font-bold text-ink">まだ読んでいない人：</span>
                    {unreadNames.join("、")}
                  </p>
                )}
              </Card>
            </section>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
