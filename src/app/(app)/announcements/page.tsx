import Link from "next/link";
import { ChevronRight, Megaphone, Plus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstDateTimeLabel } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SearchParamToast } from "@/components/ui/toast";
import { AnnouncementCategoryBadge } from "@/features/announcements/category-badge";
import { unreadAnnouncementIds, visibleWhere } from "@/features/announcements/queries";
import { audienceLabel } from "@/lib/announcements";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const me = await requireUser();
  const canSend = can(me, "announcement.send");
  const items = await db.announcement.findMany({
    where: visibleWhere(me),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, category: true, audience: true, createdAt: true, createdBy: { select: { name: true } } },
  });
  const unread = await unreadAnnouncementIds(me.id, items.map((a) => a.id));

  return (
    <div>
      <PageHeader
        title="全体連絡"
        subtitle="会社からのお知らせ・行事・クレームの共有"
        backHref="/notifications"
        right={
          canSend && (
            <LinkButton href="/announcements/new" size="sm">
              <Plus className="h-4 w-4" />
              連絡を送る
            </LinkButton>
          )
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        {items.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="全体連絡はまだありません"
            description={canSend ? "「連絡を送る」から、役割ごと・全員に一括で連絡できます" : "会社からのお知らせがここに届きます"}
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {items.map((a) => {
              const isUnread = unread.has(a.id);
              return (
                <li key={a.id}>
                  <Link href={`/announcements/${a.id}`} className={cn("tap-row flex items-center gap-3 p-4 active:bg-surface-sunken", isUnread && "bg-brand-50/50")}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isUnread && <span className="h-2 w-2 rounded-full bg-status-danger" aria-label="未読" />}
                        <AnnouncementCategoryBadge category={a.category} />
                        <span className="text-[11px] text-ink-faint">{jstDateTimeLabel(a.createdAt)}</span>
                      </div>
                      <p className={cn("truncate text-[15px] text-ink", isUnread ? "font-black" : "font-bold")}>{a.title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {a.createdBy?.name ?? "—"}
                        {canSend && ` → ${audienceLabel(a.audience)}`}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageContainer>
    </div>
  );
}
