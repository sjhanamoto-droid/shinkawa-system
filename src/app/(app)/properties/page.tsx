import Link from "next/link";
import { Search, Plus, Building, Building2, MapPin, KeyRound, Repeat, ChevronRight, ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { cookies } from "next/headers";
import { cn } from "@/lib/utils";
import { RememberDeptTab } from "@/features/properties/remember-dept-tab";
import { PROPERTY_DEPT_COOKIE } from "@/features/properties/list-prefs";
import { CONTRACT_TYPE_LABEL, CONTRACT_TYPE_OPTIONS, DEPARTMENT_COLOR, DEPARTMENT_LABEL, PROPERTY_STATUS_LABEL, isContractType, isDepartment, isRuleKind, type PropertyStatus } from "@/lib/constants";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { PRIMARY_JOB_ORDER } from "@/features/properties/work";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";

const PAGE_SIZE = 30;

type ListParams = { q?: string; customer?: string; status?: string; dept?: string; freq?: string; unset?: boolean; page?: number };
type DeptTab = "CLEANING" | "CONSTRUCTION" | "ALL";

function buildHref(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.customer) sp.set("customer", p.customer);
  if (p.status) sp.set("status", p.status);
  if (p.dept) sp.set("dept", p.dept);
  if (p.freq) sp.set("freq", p.freq);
  if (p.unset) sp.set("unset", "1");
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/properties?${qs}` : "/properties";
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; customer?: string; status?: string; dept?: string; freq?: string; unset?: string }>;
}) {
  const user = await requireUser();
  const canManage = can(user, "property.manage");
  const sp = await searchParams;
  const { q, page, customer, status } = sp;
  // 部門タブ：URL → 前回選んだタブ（cookie） → ログイン中の人の部門 → すべて
  const remembered = (await cookies()).get(PROPERTY_DEPT_COOKIE)?.value;
  const pick = (v: string | undefined): DeptTab | null => (v === "ALL" || isDepartment(v) ? (v as DeptTab) : null);
  const tab: DeptTab = pick(sp.dept) ?? pick(remembered) ?? (isDepartment(user.department) ? user.department : "ALL");
  const dept = tab === "ALL" ? undefined : tab;
  const unset = tab === "ALL" && sp.unset === "1";
  const freq = unset ? undefined : isContractType(sp.freq) ? sp.freq : undefined;
  const query = (q ?? "").trim();
  const statusFilter = status === "INACTIVE" || status === "PAUSED" ? status : status === "ALL" ? undefined : "ACTIVE";
  // 絞り込みを保ったままリンクを作る
  const base: ListParams = { q: query || undefined, customer, status, dept: tab, freq, unset };
  const href = (patch: Partial<ListParams>) => buildHref({ ...base, ...patch });
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  // タブの件数（検索語・顧客・状態の絞り込みは反映、頻度は反映しない）
  const countBase = {
    ...(query ? { OR: [{ name: { contains: query } }, { kana: { contains: query } }, { address: { contains: query } }, { customer: { name: { contains: query } } }] } : {}),
    ...(customer ? { customerId: customer } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };
  const [raw, customers, cleaningCount, constructionCount, allCount, unsetCount] = await Promise.all([
    db.property.findMany({
      where: {
        ...(query ? { OR: [{ name: { contains: query } }, { kana: { contains: query } }, { address: { contains: query } }, { customer: { name: { contains: query } } }] } : {}),
        ...(customer ? { customerId: customer } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(dept || freq ? { jobs: { some: { ...(dept ? { department: dept } : {}), ...(freq ? { contractType: freq } : {}) } } } : {}),
        ...(unset ? { jobs: { none: {} } } : {}),
      },
      orderBy: [{ kana: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, address: true, building: true, unitCount: true, keyboxStatus: true, status: true,
        customer: { select: { id: true, name: true } },
        _count: { select: { handovers: true } },
        jobs: { orderBy: PRIMARY_JOB_ORDER, take: 1, select: { department: true, category: true, contractType: true, ruleKind: true, ruleParams: true } },
      },
      take: shown + 1,
    }),
    db.customer.findMany({ select: { id: true, name: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
    db.property.count({ where: { ...countBase, jobs: { some: { department: "CLEANING" } } } }),
    db.property.count({ where: { ...countBase, jobs: { some: { department: "CONSTRUCTION" } } } }),
    db.property.count({ where: countBase }),
    db.property.count({ where: { ...countBase, jobs: { none: {} } } }),
  ]);
  const tabCount: Record<DeptTab, number> = { CLEANING: cleaningCount, CONSTRUCTION: constructionCount, ALL: allCount };
  const hasMore = raw.length > shown;
  const properties = hasMore ? raw.slice(0, shown) : raw;

  return (
    <div>
      <PageHeader title="現場" subtitle="ここを開けば全部載っている（作業内容・周期もここで登録）">
        {/* 自分でタブを選んだときだけ覚える（既定の部門で開いただけでは書き込まない） */}
        {pick(sp.dept) && <RememberDeptTab value={tab} />}
        {/* 部門タブ（クリーニング／工事を分けて見る） */}
        {/* 下線型：開いている部門は下線で示す */}
        <div className="mb-3 flex border-b border-line">
          {(["CLEANING", "CONSTRUCTION", "ALL"] as const).map((t) => (
            <Link
              key={t}
              href={href({ dept: t, freq: undefined, unset: undefined, page: undefined })}
              aria-current={tab === t ? "page" : undefined}
              className={cn(
                "relative flex min-h-[48px] flex-1 items-center justify-center gap-1.5 px-1 text-[15px] transition-colors",
                tab === t
                  ? "font-bold text-brand-700 after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-brand-600 dark:text-brand-300"
                  : "font-medium text-ink-muted hover:text-ink-soft",
              )}
            >
              {t !== "ALL" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DEPARTMENT_COLOR[t] }} />}
              <span className="truncate">{t === "ALL" ? "すべて" : DEPARTMENT_LABEL[t]}</span>
              <span className="shrink-0 text-sm font-semibold tnum text-ink-faint">{tabCount[t]}</span>
            </Link>
          ))}
        </div>
        <form action="/properties" className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" defaultValue={query} placeholder="現場名・住所・顧客名で検索" className="h-11 pl-10" />
            </div>
            <Select name="customer" defaultValue={customer ?? ""} className="h-11" wrapperClassName="sm:w-60 sm:shrink-0">
              <option value="">顧客：すべて</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            {status && <input type="hidden" name="status" value={status} />}
            <input type="hidden" name="dept" value={tab} />
            {unset && <input type="hidden" name="unset" value="1" />}
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
            <ChipLink href={href({ freq: undefined, unset: undefined })} active={!freq && !unset}>頻度：すべて</ChipLink>
            {CONTRACT_TYPE_OPTIONS.map((c) => (
              <ChipLink key={c} href={href({ freq: c, unset: undefined })} active={freq === c}>{CONTRACT_TYPE_LABEL[c]}</ChipLink>
            ))}
            {tab === "ALL" && unsetCount > 0 && (
              <ChipLink href={href({ freq: undefined, unset: true })} active={unset}>作業内容 未設定 {unsetCount}</ChipLink>
            )}
          </ChipBar>
        </form>
      </PageHeader>

      <PageContainer>
        <SearchParamToast />
        {properties.length === 0 ? (
          <EmptyState icon={<Building className="h-6 w-6" />} title={query || dept || freq || unset ? "該当する現場がありません" : "現場が登録されていません"} description={canManage ? "右下のボタンから登録できます" : "事務員が登録すると表示されます"} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {properties.map((p) => {
                const j = p.jobs[0];
                return (
                  <CardLink key={p.id} href={`/properties/${p.id}`} className="flex h-full flex-col p-4">
                    {/* 1行目：部門・種別（軽く）と状態。引き継ぎがあれば目立たせる */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {j ? (
                          <>
                            {isDepartment(j.department) && (
                              <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DEPARTMENT_COLOR[j.department] }} />
                                {DEPARTMENT_LABEL[j.department]}
                              </span>
                            )}
                            <CategoryBadge category={j.category} short />
                          </>
                        ) : (
                          <span className="text-sm font-semibold text-ink-faint">作業内容：未設定</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {p._count.handovers > 0 && <Badge tone="warn" className="font-bold">引き継ぎ {p._count.handovers}</Badge>}
                        {p.status !== "ACTIVE" && <Badge tone="past" className="px-3 py-1 text-sm font-bold">{PROPERTY_STATUS_LABEL[p.status as PropertyStatus] ?? p.status}</Badge>}
                      </div>
                    </div>

                    {/* 現場名を一番大きく */}
                    <div className="mt-1.5 flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-bold leading-snug text-ink [text-wrap:pretty]">{p.name}</h3>
                      <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    </div>
                    {p.building && <p className="break-words text-sm text-ink-soft">{p.building}</p>}

                    {/* メタ行：顧客・住所・周期 */}
                    <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
                      <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      <span className="truncate">{p.customer.name}</span>
                    </p>
                    {p.address && (
                      <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-ink-soft">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="min-w-0 break-words">{p.address}</span>
                      </p>
                    )}
                    {j && (isRuleKind(j.ruleKind) || isContractType(j.contractType)) && (
                      <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm font-semibold text-ink-soft">
                        <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                        <span className="min-w-0 break-words">
                          {isRuleKind(j.ruleKind)
                            ? describeRule(j.ruleKind, (j.ruleParams ?? {}) as RuleParams)
                            : isContractType(j.contractType)
                              ? CONTRACT_TYPE_LABEL[j.contractType]
                              : ""}
                        </span>
                      </p>
                    )}

                    <div className="mt-auto pt-3">
                      <div className="flex items-center gap-4 border-t border-line pt-2.5 text-sm font-medium text-ink-muted">
                        {p.unitCount != null && <span className="tnum">{p.unitCount}件</span>}
                        <span className="flex items-center gap-1">
                          <KeyRound className="h-4 w-4" />
                          {p.keyboxStatus === "HAS" ? "キーBOXあり" : p.keyboxStatus === "NONE" ? "キーBOXなし" : "未確認"}
                        </span>
                      </div>
                    </div>
                  </CardLink>
                );
              })}
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
