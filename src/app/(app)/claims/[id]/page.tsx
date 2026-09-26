import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstDateTimeLabel } from "@/lib/date";
import { audienceLabel } from "@/lib/announcements";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { ClaimBody, CLAIM_VIEW_SELECT } from "@/features/claims/claim-body";
import { DeleteClaimButton } from "@/features/claims/delete-button";
import { claimVisibleWhere, involvedNames } from "@/features/claims/queries";

export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const manager = can(me, "claim.manage");
  const c = await db.claim.findFirst({
    where: { id, ...claimVisibleWhere(me) },
    select: {
      id: true,
      audience: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      ...CLAIM_VIEW_SELECT,
      acks: manager
        ? { select: { ackAt: true, user: { select: { name: true } } }, orderBy: { user: { sortOrder: "asc" as const } } }
        : { where: { userId: me.id }, select: { ackAt: true, user: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const involved = await involvedNames(c.involvedUserIds, c.involvedOthers);
  const done = c.acks.filter((a) => a.ackAt);
  const notYet = c.acks.filter((a) => !a.ackAt);

  return (
    <div>
      <PageHeader
        title="クレーム再発防止"
        backHref="/claims"
        right={
          manager && (
            <div className="flex items-center gap-1">
              <LinkButton href={`/claims/${c.id}/edit`} variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
                編集
              </LinkButton>
              <DeleteClaimButton id={c.id} />
            </div>
          )
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-5">
          <Card className="space-y-4 p-4">
            <ClaimBody claim={{ ...c, involved }} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-muted">
              <span>
                登録：{c.createdBy?.name ?? "—"}・{jstDateTimeLabel(c.createdAt)}
              </span>
              {manager && <span>共有先：{audienceLabel(c.audience)}</span>}
              {c.property && (
                <Link href={`/properties/${c.property.id}`} className="inline-flex items-center gap-1 font-bold text-brand-600">
                  現場を見る <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </Card>

          {manager ? (
            <section className="space-y-2">
              <SectionTitle>
                確認 {done.length} / {c.acks.length}名
              </SectionTitle>
              <Card className="space-y-2 p-4 text-sm">
                {c.acks.length === 0 ? (
                  <p className="text-ink-muted">共有した人はいません</p>
                ) : notYet.length === 0 ? (
                  <p className="font-semibold text-emerald-700">全員が確認しました</p>
                ) : (
                  <p className="text-ink-soft">
                    <span className="font-bold text-ink">まだ確認していない人：</span>
                    {notYet.map((a) => a.user.name).join("、")}
                  </p>
                )}
                {done.length > 0 && (
                  <p className="text-xs text-ink-muted">確認済み：{done.map((a) => a.user.name).join("、")}</p>
                )}
              </Card>
            </section>
          ) : (
            c.acks[0]?.ackAt && <p className="text-center text-xs text-emerald-700">{jstDateTimeLabel(c.acks[0].ackAt)} に確認しました</p>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
