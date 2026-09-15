import Link from "next/link";
import { Search, Plus, Building2, Building, Briefcase, Phone, ChevronRight, ChevronDown, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { TRADE_STATUS_LABEL, type TradeStatus } from "@/lib/constants";

const PAGE_SIZE = 30;

function buildHref(params: { q?: string; status?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "customer.manage");
  const canImport = can(user, "customer.import");
  const { q, page, status } = await searchParams;
  const query = (q ?? "").trim();
  const statusFilter = status && status in TRADE_STATUS_LABEL ? (status as TradeStatus) : undefined;
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  const raw = await db.customer.findMany({
    where: {
      ...(query ? { OR: [{ name: { contains: query } }, { shortName: { contains: query } }, { kana: { contains: query } }] } : {}),
      ...(statusFilter ? { tradeStatus: statusFilter } : {}),
    },
    orderBy: [{ kana: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, shortName: true, kana: true, tradeStatus: true, phone: true, headOfficeAddress: true, memo: true,
      _count: { select: { properties: true, jobs: true } },
    },
    take: shown + 1,
  });
  const hasMore = raw.length > shown;
  const customers = hasMore ? raw.slice(0, shown) : raw;

  return (
    <div>
      <PageHeader
        title="顧客"
        subtitle="元請・管理会社・オーナー"
        right={
          canImport ? (
            <LinkButton href="/customers/import" variant="outline" size="sm">
              <Upload className="h-4 w-4" />
              CSV取込
            </LinkButton>
          ) : undefined
        }
      >
        <form action="/customers" className="space-y-2">
          <div className="relative md:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input name="q" type="search" defaultValue={query} placeholder="顧客名・短縮名・ふりがなで検索" className="h-11 pl-10" />
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          </div>
          <ChipBar>
            <ChipLink href={buildHref({ q: query || undefined })} active={!statusFilter}>すべて</ChipLink>
            {(Object.keys(TRADE_STATUS_LABEL) as TradeStatus[]).map((s) => (
              <ChipLink key={s} href={buildHref({ q: query || undefined, status: s })} active={statusFilter === s}>
                {TRADE_STATUS_LABEL[s]}
              </ChipLink>
            ))}
          </ChipBar>
        </form>
      </PageHeader>

      <PageContainer>
        <SearchParamToast />
        {customers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={query ? "該当する顧客がありません" : "顧客が登録されていません"}
            description={query ? "検索条件を変えてお試しください" : canImport ? "サイボウズのアドレス帳CSVを取り込むか、右下のボタンから登録できます" : "事務員が顧客を登録すると表示されます"}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {customers.map((c) => (
                <CardLink key={c.id} href={`/customers/${c.id}`} className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {c.shortName && <Badge tone="brand">{c.shortName}</Badge>}
                        {c.tradeStatus !== "CONTINUING" && <Badge tone={c.tradeStatus === "NEW" ? "info" : "past"}>{TRADE_STATUS_LABEL[c.tradeStatus as TradeStatus] ?? c.tradeStatus}</Badge>}
                      </div>
                      <h3 className="mt-1 truncate text-[15px] font-bold leading-snug text-ink">{c.name}</h3>
                      {c.headOfficeAddress && <p className="mt-0.5 truncate text-xs text-ink-muted">{c.headOfficeAddress}</p>}
                      {c.phone && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
                  </div>
                  <div className="mt-3 flex items-center gap-4 border-t border-line pt-2.5 text-xs font-medium text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Building className="h-3.5 w-3.5" />
                      物件 {c._count.properties}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      案件 {c._count.jobs}
                    </span>
                  </div>
                </CardLink>
              ))}
            </div>
            {hasMore && (
              <LinkButton href={buildHref({ q: query || undefined, status: statusFilter, page: pageNum + 1 })} variant="outline" size="md" className="mt-4 w-full" scroll={false}>
                <ChevronDown className="h-4 w-4" />
                さらに表示
              </LinkButton>
            )}
          </>
        )}
      </PageContainer>

      {canManage && <Fab href="/customers/new" label="顧客を登録" icon={<Plus className="h-5 w-5" />} />}
      <Link href="/customers" className="hidden" aria-hidden />
    </div>
  );
}
