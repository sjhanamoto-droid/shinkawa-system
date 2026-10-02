import Link from "next/link";
import { Search, Plus, Building, MapPin, KeyRound, Repeat, ChevronRight, ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { CONTRACT_TYPE_LABEL, CONTRACT_TYPE_OPTIONS, DEPARTMENT_LABEL, DEPARTMENT_OPTIONS, PROPERTY_STATUS_LABEL, isContractType, isDepartment, isRuleKind, type PropertyStatus } from "@/lib/constants";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { PRIMARY_JOB_ORDER } from "@/features/properties/work";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";

const PAGE_SIZE = 30;

type ListParams = { q?: string; customer?: string; status?: string; dept?: string; freq?: string; page?: number };

function buildHref(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.customer) sp.set("customer", p.customer);
  if (p.status) sp.set("status", p.status);
  if (p.dept) sp.set("dept", p.dept);
  if (p.freq) sp.set("freq", p.freq);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/properties?${qs}` : "/properties";
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; customer?: string; status?: string; dept?: string; freq?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "property.manage");
  const sp = await searchParams;
  const { q, page, customer, status } = sp;
  const dept = isDepartment(sp.dept) ? sp.dept : undefined;
  const freq = isContractType(sp.freq) ? sp.freq : undefined;
  const query = (q ?? "").trim();
  const statusFilter = status === "INACTIVE" || status === "PAUSED" ? status : status === "ALL" ? undefined : "ACTIVE";
  // 絞り込みを保ったままリンクを作る
  const base: ListParams = { q: query || undefined, customer, status, dept, freq };
  const href = (patch: Partial<ListParams>) => buildHref({ ...base, ...patch });
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  const [raw, customers] = await Promise.all([
    db.property.findMany({
      where: {
        ...(query ? { OR: [{ name: { contains: query } }, { kana: { contains: query } }, { address: { contains: query } }, { customer: { name: { contains: query } } }] } : {}),
        ...(customer ? { customerId: customer } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(dept || freq ? { jobs: { some: { ...(dept ? { department: dept } : {}), ...(freq ? { contractType: freq } : {}) } } } : {}),
      },
      orderBy: [{ kana: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, address: true, building: true, unitCount: true, keyboxStatus: true, status: true,
        customer: { select: { id: true, name: true, shortName: true } },
        _count: { select: { handovers: true } },
        jobs: { orderBy: PRIMARY_JOB_ORDER, take: 1, select: { department: true, category: true, contractType: true, ruleKind: true, ruleParams: true } },
      },
      take: shown + 1,
    }),
    db.customer.findMany({ select: { id: true, name: true, shortName: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
  ]);
  const hasMore = raw.length > shown;
  const properties = hasMore ? raw.slice(0, shown) : raw;

  return (
    <div>
      <PageHeader title="現場" subtitle="ここを開けば全部載っている（作業内容・周期もここで登録）">
        <form action="/properties" className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" defaultValue={query} placeholder="現場名・住所・顧客名で検索" className="h-11 pl-10" />
            </div>
            <Select name="customer" defaultValue={customer ?? ""} className="h-11" wrapperClassName="sm:w-60 sm:shrink-0">
              <option value="">顧客：すべて</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName ?? c.name}</option>
              ))}
            </Select>
            {status && <input type="hidden" name="status" value={status} />}
            {dept && <input type="hidden" name="dept" value={dept} />}
            {freq && <input type="hidden" name="freq" value={freq} />}
            <button type="submit" className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">検索</button>
          </div>
          <ChipBar>
            <ChipLink href={href({ status: undefined })} active={statusFilter === "ACTIVE"}>稼働中</ChipLink>
            <ChipLink href={href({ status: "PAUSED" })} active={statusFilter === "PAUSED"}>休止</ChipLink>
            <ChipLink href={href({ status: "INACTIVE" })} active={statusFilter === "INACTIVE"}>終了</ChipLink>
            <ChipLink href={href({ status: "ALL" })} active={!statusFilter}>すべて</ChipLink>
          </ChipBar>
          <ChipBar>
            <ChipLink href={href({ dept: undefined })} active={!dept}>部門：すべて</ChipLink>
            {DEPARTMENT_OPTIONS.map((d) => (
              <ChipLink key={d} href={href({ dept: d })} active={dept === d}>{DEPARTMENT_LABEL[d]}</ChipLink>
            ))}
            <span className="mx-1 h-5 w-px shrink-0 self-center bg-line" />
            <ChipLink href={href({ freq: undefined })} active={!freq}>頻度：すべて</ChipLink>
            {CONTRACT_TYPE_OPTIONS.map((c) => (
              <ChipLink key={c} href={href({ freq: c })} active={freq === c}>{CONTRACT_TYPE_LABEL[c]}</ChipLink>
            ))}
          </ChipBar>
        </form>
      </PageHeader>

      <PageContainer>
        <SearchParamToast />
        {properties.length === 0 ? (
          <EmptyState icon={<Building className="h-6 w-6" />} title={query || dept || freq ? "該当する現場がありません" : "現場が登録されていません"} description={canManage ? "右下のボタンから登録できます" : "事務員が登録すると表示されます"} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {properties.map((p) => (
                <CardLink key={p.id} href={`/properties/${p.id}`} className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">{p.customer.shortName ?? p.customer.name}</Badge>
                        {p.status !== "ACTIVE" && <Badge tone="past">{PROPERTY_STATUS_LABEL[p.status as PropertyStatus] ?? p.status}</Badge>}
                        {p._count.handovers > 0 && <Badge tone="warn">引き継ぎ {p._count.handovers}</Badge>}
                      </div>
                      <h3 className="mt-1 truncate text-[15px] font-bold leading-snug text-ink">{p.name}</h3>
                      {p.building && <p className="truncate text-xs text-ink-soft">{p.building}</p>}
                      {p.address && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 truncate">{p.address}</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
                  </div>
                  {p.jobs[0] ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {isDepartment(p.jobs[0].department) && <Badge tone="info">{DEPARTMENT_LABEL[p.jobs[0].department]}</Badge>}
                      <CategoryBadge category={p.jobs[0].category} short />
                      {isRuleKind(p.jobs[0].ruleKind) ? (
                        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-ink-soft">
                          <Repeat className="h-3 w-3 shrink-0 text-ink-faint" />
                          <span className="truncate">{describeRule(p.jobs[0].ruleKind, (p.jobs[0].ruleParams ?? {}) as RuleParams)}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-ink-soft">{isContractType(p.jobs[0].contractType) ? CONTRACT_TYPE_LABEL[p.jobs[0].contractType] : ""}</span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-faint">作業内容：未設定</p>
                  )}
                  <div className="mt-3 flex items-center gap-4 border-t border-line pt-2.5 text-xs font-medium text-ink-muted">
                    {p.unitCount != null && <span>{p.unitCount}件</span>}
                    <span className="flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5" />
                      {p.keyboxStatus === "HAS" ? "キーBOXあり" : p.keyboxStatus === "NONE" ? "キーBOXなし" : "未確認"}
                    </span>

                  </div>
                </CardLink>
              ))}
            </div>
            {hasMore && (
              <LinkButton href={href({ page: pageNum + 1 })} variant="outline" size="md" className="mt-4 w-full" scroll={false}>
                <ChevronDown className="h-4 w-4" />
                さらに表示
              </LinkButton>
            )}
          </>
        )}
      </PageContainer>
      {canManage && <Fab href="/properties/new" label="現場を登録" icon={<Plus className="h-5 w-5" />} />}
      <Link href="/properties" className="hidden" aria-hidden />
    </div>
  );
}
