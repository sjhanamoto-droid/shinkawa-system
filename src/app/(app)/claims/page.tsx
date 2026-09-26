import Link from "next/link";
import { Building, ChevronRight, Plus, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SearchParamToast } from "@/components/ui/toast";
import { claimVisibleWhere } from "@/features/claims/queries";
import { fmtKeyShort } from "@/features/schedule/filters";
import { jstDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  const me = await requireUser();
  const manager = can(me, "claim.manage");
  const claims = await db.claim.findMany({
    where: claimVisibleWhere(me),
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      occurredOn: true,
      createdAt: true,
      recipientCount: true,
      property: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { photos: true, acks: { where: { ackAt: { not: null } } } } },
      acks: { where: { userId: me.id }, select: { ackAt: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="クレーム再発防止"
        subtitle="起きたクレームと再発防止策を全員で共有"
        right={
          manager && (
            <LinkButton href="/claims/new" size="sm">
              <Plus className="h-4 w-4" />
              登録・共有
            </LinkButton>
          )
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        {claims.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="クレームの記録はまだありません"
            description={manager ? "「登録・共有」から、現場・内容・写真・再発防止策を残して全員に共有できます" : "共有されたクレームと再発防止策がここにたまっていきます"}
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {claims.map((c) => {
              const mine = c.acks[0];
              return (
                <li key={c.id}>
                  <Link href={`/claims/${c.id}`} className="tap-row flex items-center gap-3 p-4 active:bg-surface-sunken">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                        <span>{fmtKeyShort(c.occurredOn ?? jstDateKey(c.createdAt))}</span>
                        {mine && !mine.ackAt && <Badge tone="danger">未確認</Badge>}
                        {manager && (
                          <Badge tone={c._count.acks >= c.recipientCount ? "active" : "warn"}>
                            確認 {c._count.acks}/{c.recipientCount}
                          </Badge>
                        )}
                        {c._count.photos > 0 && <span>写真{c._count.photos}</span>}
                      </div>
                      <p className="truncate text-[15px] font-bold text-ink">{c.title}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
                        {c.property && (
                          <>
                            <Building className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{c.property.name}</span>
                            <span className="text-ink-faint">・</span>
                          </>
                        )}
                        {c.createdBy?.name ?? "—"}
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
