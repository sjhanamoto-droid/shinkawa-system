import Link from "next/link";
import { Plus, Pencil, Phone, Users, Handshake } from "lucide-react";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PeopleTabs } from "@/components/app-shell/section-tab-sets";
import { PageContainer } from "@/components/app-shell/page-container";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SearchParamToast } from "@/components/ui/toast";
import { PartnerRowActions } from "@/features/partners/partner-row-actions";
import { PARTNER_KIND_LABEL, PARTNER_KIND_OPTIONS, type PartnerKind } from "@/lib/constants";

export default async function PartnersPage() {
  await requireCan("partner.manage");
  const partners = await db.partner.findMany({
    orderBy: [{ active: "desc" }, { kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { workers: true } } },
  });
  const groups = PARTNER_KIND_OPTIONS.map((k) => ({ kind: k, items: partners.filter((p) => p.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="協力会社・下請"
        subtitle="クリーニングの外注先と工事の下職"
        right={<LinkButton href="/partners/new" size="sm"><Plus className="h-4 w-4" />追加</LinkButton>}
      >
        <PeopleTabs />
      </PageHeader>
      <PageContainer>
        <SearchParamToast />
        {partners.length === 0 ? (
          <EmptyState icon={<Handshake className="h-6 w-6" />} title="協力会社が登録されていません" description="右上の「追加」から登録できます" />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.kind} className="space-y-2.5">
                <SectionTitle action={<span className="text-sm font-semibold text-ink-muted tnum">{g.items.length}社</span>}>
                  {PARTNER_KIND_LABEL[g.kind as PartnerKind]}
                </SectionTitle>
                <div className="card divide-y divide-line overflow-hidden">
                  {g.items.map((p) => (
                    <div key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:flex-nowrap ${!p.active ? "opacity-60" : ""}`}>
                      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-base font-bold text-ink">{p.name}</span>
                          {p.trades.map((t) => (
                            <Badge key={t} tone="info">{t}</Badge>
                          ))}
                          {!p.active && <Badge tone="danger">無効</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                          {p.contactName && <span>{p.contactName}</span>}
                          {p.phone && <span className="flex items-center gap-1.5 tnum"><Phone className="h-4 w-4" />{p.phone}</span>}
                          <Link href={`/workers?q=${encodeURIComponent(p.name)}`} className="flex items-center gap-1.5 font-semibold text-brand-600"><Users className="h-4 w-4" />作業者 {p._count.workers}名</Link>
                        </div>
                      </div>
                      <div className="-my-1 ml-auto flex items-center gap-1.5">
                        <Link href={`/partners/${p.id}/edit`} className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" />編集</Link>
                        <PartnerRowActions id={p.id} active={p.active} canDelete={p._count.workers === 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
