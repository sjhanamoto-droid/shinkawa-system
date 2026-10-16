import Link from "next/link";
import { Search, Plus, Building2, Building, Phone, MapPin, ChevronRight, ChevronDown, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
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
      ...(query ? { OR: [{ name: { contains: query } }, { kana: { contains: query } }] } : {}),
      ...(statusFilter ? { tradeStatus: statusFilter } : {}),
    },
    orderBy: [{ kana: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, kana: true, tradeStatus: true, phone: true, headOfficeAddress: true, memo: true,
      _count: { select: { properties: true } },
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
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" defaultValue={query} placeholder="顧客名で検索" className="h-11 pl-10" />
            </div>
            {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
            <button type="submit" className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">検索</button>
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
            {/* 1つのカードに行で並べる（主：顧客名／副：本社住所・電話／右：現場数） */}
            <div className="card divide-y divide-line overflow-hidden">
              {customers.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="tap-row flex min-h-[64px] items-center gap-3 px-4 py-3.5 hover:bg-surface-subtle">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="min-w-0 break-words text-base font-bold leading-snug text-ink">{c.name}</h3>
                      {c.tradeStatus !== "CONTINUING" && <Badge tone={c.tradeStatus === "NEW" ? "info" : "past"}>{TRADE_STATUS_LABEL[c.tradeStatus as TradeStatus] ?? c.tradeStatus}</Badge>}
                    </div>
                    {c.headOfficeAddress && (
                      <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink-muted">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">{c.headOfficeAddress}</span>
                      </p>
                    )}
                    {c.phone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted tnum">
                        <Phone className="h-4 w-4 shrink-0" aria-hidden />
                        {c.phone}
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-soft tnum">
                    <Building className="h-4 w-4 text-ink-muted" aria-hidden />
                    現場 {c._count.properties}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
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
