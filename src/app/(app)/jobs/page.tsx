import Link from "next/link";
import { Plus, Briefcase, Repeat, Search, ChevronRight, ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { canViewAmounts, canEditDepartment } from "@/lib/permissions";
import { jstMonthKey, addMonthsKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CardLink } from "@/components/ui/card";
import { Badge, CategoryBadge } from "@/components/ui/badge";
import { Fab, EmptyState } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/form";
import { ChipBar, ChipLink } from "@/components/ui/chips";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { GenerateButton } from "@/features/jobs/generate-button";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import {
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_OPTIONS,
  DEPARTMENT_LABEL,
  JOB_STATUS_LABEL,
  isRuleKind,
  isDepartment,
  type ContractType,
  type JobStatus,
} from "@/lib/constants";
import { fmtYen } from "@/lib/utils";

const PAGE_SIZE = 40;

function buildHref(p: { q?: string; dept?: string; type?: string; status?: string; customer?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.dept) sp.set("dept", p.dept);
  if (p.type) sp.set("type", p.type);
  if (p.status) sp.set("status", p.status);
  if (p.customer) sp.set("customer", p.customer);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; type?: string; status?: string; customer?: string; page?: string }>;
}) {
  const user = await requireCan("job.manage");
  const showAmount = canViewAmounts(user);
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const dept = isDepartment(sp.dept) ? sp.dept : undefined;
  const type = sp.type && (CONTRACT_TYPE_OPTIONS as string[]).includes(sp.type) ? sp.type : undefined;
  const status = sp.status && sp.status in JOB_STATUS_LABEL ? sp.status : sp.status === "ALL" ? undefined : "ACTIVE";
  const customer = sp.customer || undefined;
  const pageNum = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  const shown = pageNum * PAGE_SIZE;

  const [raw, customers] = await Promise.all([
    db.job.findMany({
      where: {
        ...(query ? { OR: [{ name: { contains: query } }, { property: { name: { contains: query } } }, { customer: { OR: [{ name: { contains: query } }, { shortName: { contains: query } }] } }] } : {}),
        ...(dept ? { department: dept } : {}),
        ...(type ? { contractType: type } : {}),
        ...(status ? { status } : {}),
        ...(customer ? { customerId: customer } : {}),
      },
      orderBy: [{ status: "asc" }, { customer: { kana: "asc" } }, { name: "asc" }],
      select: {
        id: true, name: true, department: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true, headcount: true, unitCount: true, generatedThrough: true,
        amount: showAmount,
        customer: { select: { id: true, name: true, shortName: true } },
        property: { select: { id: true, name: true } },
        _count: { select: { occurrences: true } },
      },
      take: shown + 1,
    }),
    db.customer.findMany({ where: { jobs: { some: {} } }, select: { id: true, name: true, shortName: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
  ]);
  const hasMore = raw.length > shown;
  const jobs = hasMore ? raw.slice(0, shown) : raw;
  const thisMonth = jstMonthKey();
  const nextMonth = addMonthsKey(thisMonth, 1);
  const genDept = dept ?? (user.role === "SCHEDULER" && user.department ? user.department : undefined);
  const canGenerate = canEditDepartment(user, genDept ?? null);

  return (
    <div>
      <PageHeader title="案件" subtitle="定期契約・スポット・工事">
        <form action="/jobs" className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" defaultValue={query} placeholder="案件名・物件名・顧客名で検索" className="h-11 pl-10" />
            </div>
            <Select name="customer" defaultValue={customer ?? ""} className="h-11" wrapperClassName="sm:w-60 sm:shrink-0">
              <option value="">顧客：すべて</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.shortName ?? c.name}</option>
              ))}
            </Select>
            {dept && <input type="hidden" name="dept" value={dept} />}
            {type && <input type="hidden" name="type" value={type} />}
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            <button type="submit" className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">検索</button>
          </div>
          <ChipBar>
            <ChipLink href={buildHref({ q: query || undefined, type, status: sp.status, customer })} active={!dept}>全体</ChipLink>
            {(["CLEANING", "CONSTRUCTION"] as const).map((d) => (
              <ChipLink key={d} href={buildHref({ q: query || undefined, dept: d, type, status: sp.status, customer })} active={dept === d}>{DEPARTMENT_LABEL[d]}</ChipLink>
            ))}
            <span className="w-px shrink-0 bg-line" />
            <ChipLink href={buildHref({ q: query || undefined, dept, status: sp.status, customer })} active={!type}>全種別</ChipLink>
            {CONTRACT_TYPE_OPTIONS.map((t) => (
              <ChipLink key={t} href={buildHref({ q: query || undefined, dept, type: t, status: sp.status, customer })} active={type === t}>{CONTRACT_TYPE_LABEL[t]}</ChipLink>
            ))}
            <span className="w-px shrink-0 bg-line" />
            <ChipLink href={buildHref({ q: query || undefined, dept, type, customer })} active={status === "ACTIVE"}>有効</ChipLink>
            <ChipLink href={buildHref({ q: query || undefined, dept, type, status: "ALL", customer })} active={!status}>すべて</ChipLink>
          </ChipBar>
        </form>
      </PageHeader>

      <PageContainer>
        <SearchParamToast />
        {canGenerate && (
          <div className="card mb-4 flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Repeat className="h-4 w-4 text-ink-muted" />定期契約から実施回を生成</p>
              <p className="text-xs text-ink-muted">未割当として作られ、週ビューの左レーンから日付へ置けます。生成済みの回は重複しません。{genDept && `（${DEPARTMENT_LABEL[genDept as "CLEANING" | "CONSTRUCTION"]}のみ）`}</p>
            </div>
            <GenerateButton department={genDept} months={[{ ym: thisMonth, label: "今月分" }, { ym: nextMonth, label: "翌月分" }]} />
          </div>
        )}
        {jobs.length === 0 ? (
          <EmptyState icon={<Briefcase className="h-6 w-6" />} title="案件がありません" description="右下のボタンから登録できます" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((j) => (
                <CardLink key={j.id} href={`/jobs/${j.id}`} className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryBadge category={j.category} />
                        <Badge tone="neutral">{CONTRACT_TYPE_LABEL[j.contractType as ContractType] ?? j.contractType}</Badge>
                        {j.status !== "ACTIVE" && <Badge tone="past">{JOB_STATUS_LABEL[j.status as JobStatus] ?? j.status}</Badge>}
                      </div>
                      <h3 className="mt-1 truncate text-[15px] font-bold leading-snug text-ink">{j.name}</h3>
                      <p className="truncate text-xs text-ink-soft">{j.customer.shortName ?? j.customer.name} ・ {j.property.name}</p>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs font-medium text-ink-muted">
                    {isRuleKind(j.ruleKind) && (
                      <span className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />{describeRule(j.ruleKind, (j.ruleParams ?? {}) as RuleParams)}</span>
                    )}
                    {j.headcount ? <span>{j.headcount}名</span> : null}
                    {j.unitCount ? <span>{j.unitCount}件</span> : null}
                    <span>実施回 {j._count.occurrences}</span>
                    {j.generatedThrough && <span>生成済 〜{j.generatedThrough.replace("-", "/")}</span>}
                    {showAmount && "amount" in j && j.amount != null && <span className="ml-auto font-bold tnum text-emerald-700">{fmtYen(j.amount)}</span>}
                  </div>
                </CardLink>
              ))}
            </div>
            {hasMore && (
              <LinkButton href={buildHref({ q: query || undefined, dept, type, status: sp.status, customer, page: pageNum + 1 })} variant="outline" size="md" className="mt-4 w-full" scroll={false}>
                <ChevronDown className="h-4 w-4" />さらに表示
              </LinkButton>
            )}
          </>
        )}
      </PageContainer>
      <Fab href="/jobs/new" label="案件を登録" icon={<Plus className="h-5 w-5" />} />
      <Link href="/jobs" className="hidden" aria-hidden />
    </div>
  );
}
