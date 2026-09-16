import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Repeat, CalendarDays, Building, Users, Car, Clock, StickyNote } from "lucide-react";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { canViewAmounts, canEditDepartment } from "@/lib/permissions";
import { jstMonthKey, addMonthsKey, storedDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { Badge, CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { GenerateButton } from "@/features/jobs/generate-button";
import { JobStatusControl } from "@/features/jobs/job-status-control";
import { describeRule, slotsForMonth, addMonths, type RuleParams } from "@/lib/recurrence";
import { fmtKeyShort } from "@/features/schedule/filters";
import { CONTRACT_TYPE_LABEL, DEPARTMENT_LABEL, JOB_STATUS_LABEL, isRuleKind, isDepartment, type ContractType, type JobStatus } from "@/lib/constants";
import { fmtYen, fmtDate } from "@/lib/utils";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("job.manage");
  const showAmount = canViewAmounts(user);
  const { id } = await params;
  const job = await db.job.findUnique({
    where: { id },
    select: {
      id: true, name: true, department: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true,
      headcount: true, unitCount: true, defaultStartTime: true, defaultEndTime: true, note: true, startsOn: true, endsOn: true, generatedThrough: true,
      vehicle: { select: { id: true, name: true, color: true, active: true } },
      amount: showAmount,
      customer: { select: { id: true, name: true, shortName: true } },
      property: { select: { id: true, name: true, address: true } },
      occurrences: {
        orderBy: [{ targetMonth: "desc" }, { date: "desc" }],
        take: 60,
        select: { id: true, date: true, targetMonth: true, startTime: true, status: true, windowStart: true, windowEnd: true, assignments: { select: { user: { select: { name: true } } } } },
      },
      _count: { select: { occurrences: true } },
    },
  });
  if (!job) notFound();
  const canEdit = canEditDepartment(user, job.department);
  const thisMonth = jstMonthKey();
  const nextMonth = addMonthsKey(thisMonth, 1);
  const rule = isRuleKind(job.ruleKind) ? { kind: job.ruleKind, params: (job.ruleParams ?? {}) as RuleParams } : null;
  const preview = rule ? [0, 1, 2].map((i) => ({ ym: addMonths(thisMonth, i), slots: slotsForMonth(rule.kind, rule.params, addMonths(thisMonth, i)) })) : [];

  return (
    <div>
      <PageHeader
        title={job.name}
        subtitle={`${job.customer.shortName ?? job.customer.name} ・ ${job.property.name}`}
        backHref="/jobs"
        right={canEdit ? <LinkButton href={`/jobs/${id}/edit`} variant="ghost" size="sm"><Pencil className="h-4 w-4" />編集</LinkButton> : undefined}
      />
      <PageContainer>
        <SearchParamToast />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-5">
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <CategoryBadge category={job.category} />
                <Badge tone="neutral">{CONTRACT_TYPE_LABEL[job.contractType as ContractType] ?? job.contractType}</Badge>
                {isDepartment(job.department) && <Badge tone="info">{DEPARTMENT_LABEL[job.department]}</Badge>}
                <Badge tone={job.status === "ACTIVE" ? "active" : "past"}>{JOB_STATUS_LABEL[job.status as JobStatus] ?? job.status}</Badge>
              </div>
              <DataList>
                <DataRow label="物件" value={<Link href={`/properties/${job.property.id}`} className="flex items-center justify-end gap-1 text-brand-600"><Building className="h-3.5 w-3.5" />{job.property.name}</Link>} />
                <DataRow label="周期" value={rule ? <span className="flex items-center justify-end gap-1"><Repeat className="h-3.5 w-3.5 text-ink-faint" />{describeRule(rule.kind, rule.params)}</span> : "単発"} />
                <DataRow label="標準" value={[job.headcount ? `${job.headcount}名` : null, job.unitCount ? `${job.unitCount}件` : null, job.defaultStartTime ? `${job.defaultStartTime}〜${job.defaultEndTime ?? ""}` : null].filter(Boolean).join(" ・ ") || null} />
                <DataRow label="既定の車両" value={job.vehicle ? <span className="flex items-center justify-end gap-1.5"><Car className="h-3.5 w-3.5 text-ink-faint" /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: job.vehicle.color }} />{job.vehicle.name}{!job.vehicle.active && <span className="text-xs text-ink-faint">（無効）</span>}</span> : null} />
                {showAmount && <DataRow label="金額（1回・税抜）" value={"amount" in job && job.amount != null ? <span className="font-bold tnum text-emerald-700">{fmtYen(job.amount)}</span> : "未設定"} />}
                <DataRow label="契約期間" value={job.startsOn || job.endsOn ? `${job.startsOn ? fmtDate(job.startsOn) : "—"} 〜 ${job.endsOn ? fmtDate(job.endsOn) : "—"}` : null} />
                <DataRow label="生成済み" value={job.generatedThrough ? `〜 ${job.generatedThrough.replace("-", "年")}月` : "未生成"} />
              </DataList>
              {job.note && (
                <p className="mt-3 flex items-start gap-2 whitespace-pre-wrap rounded-xl bg-surface-subtle p-3 text-sm text-ink-soft"><StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />{job.note}</p>
              )}
            </Card>

            {rule && canEdit && (
              <Card className="space-y-3 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Repeat className="h-4 w-4 text-ink-muted" />実施回を生成</p>
                <div className="grid gap-1 text-xs sm:grid-cols-3">
                  {preview.map((p) => (
                    <div key={p.ym} className="rounded-lg bg-surface-subtle p-2">
                      <p className="font-bold text-ink-soft">{p.ym.replace("-", "年")}月</p>
                      {p.slots.length === 0 ? <p className="text-ink-faint">実施なし</p> : p.slots.map((s) => <p key={s.index} className="text-ink-soft">{s.date ? fmtKeyShort(s.date) : `日付未定（${s.label ?? "月内"}）`}</p>)}
                    </div>
                  ))}
                </div>
                <GenerateButton jobId={id} months={[{ ym: thisMonth, label: "今月分" }, { ym: nextMonth, label: "翌月分" }, { ym: addMonths(thisMonth, 2), label: "翌々月分" }]} />
              </Card>
            )}

            <section className="space-y-2.5">
              <SectionTitle action={<Link href={`/schedule?view=month&d=${thisMonth}-01&q=${encodeURIComponent(job.property.name)}`} className="flex items-center gap-1 text-xs font-bold text-brand-600"><CalendarDays className="h-3.5 w-3.5" />カレンダー</Link>}>
                実施回 <span className="text-ink-faint">{job._count.occurrences}件（直近60件）</span>
              </SectionTitle>
              {job.occurrences.length === 0 ? (
                <p className="card p-4 text-center text-sm text-ink-muted">実施回はまだありません{rule && canEdit && "。「生成」で作れます"}</p>
              ) : (
                <Card className="divide-y divide-line">
                  {job.occurrences.map((o) => {
                    const key = o.date ? storedDateKey(o.date) : null;
                    return (
                      <Link key={o.id} href={key ? `/schedule?view=day&d=${key}` : `/schedule?view=week&d=${o.targetMonth}-01`} className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-subtle">
                        <span className="w-24 shrink-0 tnum font-semibold text-ink-soft">{key ? fmtKeyShort(key) : `${o.targetMonth.slice(5)}月 未定`}</span>
                        {o.startTime && <span className="w-12 shrink-0 tnum text-xs text-ink-muted">{o.startTime}</span>}
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted"><Users className="mr-1 inline h-3 w-3" />{o.assignments.map((a) => a.user.name).join("・") || "担当未定"}</span>
                        <OccurrenceStatusBadge status={o.status} />
                      </Link>
                    );
                  })}
                </Card>
              )}
            </section>
          </div>
          <aside className="space-y-5">
            {canEdit && (
              <section className="space-y-2.5">
                <SectionTitle>状態</SectionTitle>
                <Card className="p-4">
                  <JobStatusControl jobId={id} status={job.status} jobName={job.name} />
                </Card>
              </section>
            )}
            <p className="flex items-center gap-1 px-1 text-[11px] text-ink-faint"><Clock className="h-3 w-3" />定期契約は毎月の設定日に翌月分が自動生成されます（設定 → アプリ設定）</p>
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}
