import Link from "next/link";
import { Plus, Pencil, Phone, Users, Handshake, Search } from "lucide-react";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PeopleTabs } from "@/components/app-shell/section-tab-sets";
import { PageContainer } from "@/components/app-shell/page-container";
import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { loadTradeOptions } from "@/features/partners/trades";
import { SearchParamToast } from "@/components/ui/toast";
import { PartnerRowActions } from "@/features/partners/partner-row-actions";
import { PARTNER_KIND_LABEL, PARTNER_KIND_OPTIONS, type PartnerKind } from "@/lib/constants";

function buildHref(params: { q?: string; trade?: string }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.trade) sp.set("trade", params.trade);
  const qs = sp.toString();
  return qs ? `/partners?${qs}` : "/partners";
}

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ q?: string; trade?: string }> }) {
  await requireCan("partner.manage");
  const { q, trade } = await searchParams;
  const query = (q ?? "").trim();
  const tradeFilter = (trade ?? "").trim();
  const [all, tradeOptions] = await Promise.all([
    db.partner.findMany({
      orderBy: [{ active: "desc" }, { kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { workers: true } } },
    }),
    loadTradeOptions(),
  ]);
  // 検索は会社名・ふりがな・窓口担当者・電話・業種（部分一致）。業種のフィルタは完全一致
  const partners = all.filter(
    (p) =>
      (!tradeFilter || p.trades.includes(tradeFilter)) &&
      (!query || [p.name, p.kana, p.contactName, p.phone, ...p.trades].some((v) => v?.includes(query))),
  );
  // フィルタに出す業種：実際に使われているものだけ（件数つき）
  const tradeCounts = new Map<string, number>();
  for (const p of all) for (const t of p.trades) tradeCounts.set(t, (tradeCounts.get(t) ?? 0) + 1);
  const usedTrades = tradeOptions.filter((t) => tradeCounts.has(t));
  const filtered = !!query || !!tradeFilter;
  const groups = PARTNER_KIND_OPTIONS.map((k) => ({ kind: k, items: partners.filter((p) => p.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="協力会社・下請"
        subtitle="クリーニングの外注先と工事の下職"
        right={<LinkButton href="/partners/new" size="sm"><Plus className="h-4 w-4" />追加</LinkButton>}
      >
        <PeopleTabs />
        <form action="/partners" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" list="partner-trades" defaultValue={query} placeholder="会社名・業種で検索（例：電気）" className="h-11 pl-10" />
              <datalist id="partner-trades">
                {tradeOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            {tradeFilter && <input type="hidden" name="trade" value={tradeFilter} />}
            <button type="submit" className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">検索</button>
          </div>
          {usedTrades.length > 0 && (
            <ChipBar>
              <ChipLink href={buildHref({ q: query || undefined })} active={!tradeFilter}>すべての業種</ChipLink>
              {usedTrades.map((t) => (
                <ChipLink key={t} href={buildHref({ q: query || undefined, trade: t })} active={tradeFilter === t}>
                  {t}
                  <span className="ml-1 tnum opacity-70">{tradeCounts.get(t)}</span>
                </ChipLink>
              ))}
            </ChipBar>
          )}
        </form>
      </PageHeader>
      <PageContainer>
        <SearchParamToast />
        {partners.length === 0 ? (
          filtered ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="該当する協力会社・下請がありません" description="検索の言葉や業種を変えてお試しください" />
          ) : (
            <EmptyState icon={<Handshake className="h-6 w-6" />} title="協力会社が登録されていません" description="右上の「追加」から登録できます" />
          )
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
