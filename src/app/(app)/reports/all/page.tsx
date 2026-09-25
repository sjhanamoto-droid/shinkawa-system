import { redirect } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canViewAllReports, isReportStatus, REPORT_STATUS_LABEL } from "@/lib/reports";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReportList, type ReportListItem } from "@/features/reports/queries";
import { ReportListRow } from "@/features/reports/report-items";

export const dynamic = "force-dynamic";

const PAGE = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SP = { q?: string; user?: string; status?: string; from?: string; to?: string; property?: string; take?: string };

function hrefWith(sp: SP, patch: Partial<SP>): string {
  const n = { ...sp, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(n)) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `/reports/all?${qs}` : "/reports/all";
}

// 全員分の日報（最高管理者・事務・手配担当）。日付ごとにまとめて新しい順。
export default async function AllReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser();
  if (!canViewAllReports(me)) redirect("/reports");
  const sp = await searchParams;
  const take = Math.min(500, Math.max(PAGE, Number.parseInt(sp.take ?? "", 10) || PAGE));
  const status = isReportStatus(sp.status) ? sp.status : undefined;

  const [{ items, hasMore }, workers, property] = await Promise.all([
    loadReportList({
      q: (sp.q ?? "").trim() || undefined,
      userId: sp.user || undefined,
      propertyId: sp.property || undefined,
      status,
      from: sp.from && DATE_RE.test(sp.from) ? sp.from : undefined,
      to: sp.to && DATE_RE.test(sp.to) ? sp.to : undefined,
      take,
    }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    sp.property ? db.property.findUnique({ where: { id: sp.property }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const groups: { date: string; items: ReportListItem[] }[] = [];
  for (const r of items) {
    const g = groups[groups.length - 1];
    if (g && g.date === r.workDateKey) g.items.push(r);
    else groups.push({ date: r.workDateKey, items: [r] });
  }

  return (
    <div>
      <PageHeader title="すべての日報" subtitle={property ? `現場：${property.name}` : "日付の新しい順"} backHref="/reports">
        <form action="/reports/all" className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="現場名・顧客名・作業内容・作業者で検索" className="h-11 pl-10" />
            </div>
            <Select name="user" defaultValue={sp.user ?? ""} className="h-11" wrapperClassName="sm:w-48 sm:shrink-0">
              <option value="">作業者：すべて</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={status ?? ""} className="h-11" wrapperClassName="sm:w-36 sm:shrink-0">
              <option value="">状態：すべて</option>
              <option value="SUBMITTED">{REPORT_STATUS_LABEL.SUBMITTED}</option>
              <option value="DRAFT">{REPORT_STATUS_LABEL.DRAFT}</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input name="from" type="date" defaultValue={sp.from ?? ""} aria-label="開始日" className="h-11 w-auto" />
            <span className="text-sm text-ink-muted">〜</span>
            <Input name="to" type="date" defaultValue={sp.to ?? ""} aria-label="終了日" className="h-11 w-auto" />
            {sp.property && <input type="hidden" name="property" value={sp.property} />}
            <button type="submit" className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-5 text-sm font-bold text-white">
              検索
            </button>
            {(sp.q || sp.user || sp.status || sp.from || sp.to || sp.property) && (
              <LinkButton href="/reports/all" variant="ghost" size="sm">
                絞り込みを解除
              </LinkButton>
            )}
          </div>
        </form>
      </PageHeader>
      <PageContainer size="narrow">
        {groups.length === 0 ? (
          <EmptyState title="日報がありません" description="条件を変えて検索してください" />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.date} className="space-y-2">
                <h2 className="px-1 text-sm font-bold text-ink-soft">
                  {fmtKeyLong(g.date)} <span className="text-ink-faint">{g.items.length}件</span>
                </h2>
                <Card className="divide-y divide-line">
                  {g.items.map((r) => (
                    <ReportListRow key={r.id} r={r} showDate={false} />
                  ))}
                </Card>
              </section>
            ))}
            {hasMore && (
              <LinkButton href={hrefWith(sp, { take: String(take + PAGE) })} variant="outline" className="w-full" scroll={false}>
                <ChevronDown className="h-4 w-4" />
                さらに表示
              </LinkButton>
            )}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
