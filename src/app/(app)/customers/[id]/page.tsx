import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Building, Briefcase, ChevronDown, Plus, CalendarDays, UserRound, MapPin, KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can, canViewAmounts } from "@/lib/permissions";
import { dayRangeForKey, jstDateKey, addDaysKey, storedDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, CardLink, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { Badge, CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { Field, Input, Select } from "@/components/ui/form";
import { addContact, setContactInactive } from "@/features/customers/actions";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { fmtKeyShort } from "@/features/schedule/filters";
import {
  REGISTRATION_TYPE_LABEL,
  TRADE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  CONTACT_TYPE_LABEL,
  CONTRACT_TYPE_LABEL,
  JOB_STATUS_LABEL,
  labelOf,
  isRuleKind,
  type ContactType,
  type ContractType,
  type JobStatus,
} from "@/lib/constants";
import { fmtDate, fmtYen } from "@/lib/utils";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const canManage = can(user, "customer.manage");
  const showAmount = canViewAmounts(user);
  const { id } = await params;
  const today = jstDateKey();

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      properties: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, address: true, keyboxStatus: true, status: true, _count: { select: { jobs: true } } },
      },
      jobs: {
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true, amount: showAmount, property: { select: { name: true } } },
      },
      contacts: { orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] },
      occurrences: {
        where: { date: { gte: dayRangeForKey(today).gte, lt: dayRangeForKey(addDaysKey(today, 30)).lt }, status: { notIn: ["CANCELLED"] } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 30,
        select: { id: true, date: true, startTime: true, category: true, status: true, title: true, property: { select: { name: true } }, assignments: { select: { user: { select: { name: true } } } } },
      },
    },
  });
  if (!customer) notFound();

  const detailValues = [customer.phone, customer.fax, customer.email, customer.headOfficeAddress, customer.billingAddress, customer.closingDay, customer.paymentDueTerm, customer.paymentMethod];
  const hasDetails = detailValues.some((v) => v);
  const activeContacts = customer.contacts.filter((c) => c.isActive);
  const pastContacts = customer.contacts.filter((c) => !c.isActive);

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={[customer.shortName, labelOf(REGISTRATION_TYPE_LABEL, customer.registrationType), labelOf(TRADE_STATUS_LABEL, customer.tradeStatus)].filter(Boolean).join(" ・ ")}
        backHref="/customers"
        right={
          canManage ? (
            <LinkButton href={`/customers/${id}/edit`} variant="ghost" size="sm">
              <Pencil className="h-4 w-4" />
              編集
            </LinkButton>
          ) : undefined
        }
      />

      <PageContainer>
        <SearchParamToast />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-5">
            {customer.memo && (
              <section className="space-y-2.5">
                <SectionTitle>メモ</SectionTitle>
                <Card className="p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{customer.memo}</p>
                </Card>
              </section>
            )}

            {/* 物件 */}
            <section className="space-y-2.5">
              <SectionTitle
                action={
                  can(user, "property.manage") ? (
                    <Link href={`/properties/new?customerId=${id}`} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                      <Plus className="h-3.5 w-3.5" />
                      物件を追加
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-ink-muted">{customer.properties.length} 件</span>
                  )
                }
              >
                物件（現場）
              </SectionTitle>
              {customer.properties.length === 0 ? (
                <EmptyState icon={<Building className="h-6 w-6" />} title="物件がありません" description="この顧客の物件（現場）はまだ登録されていません" />
              ) : (
                <div className="space-y-2">
                  {customer.properties.map((p) => (
                    <CardLink key={p.id} href={`/properties/${p.id}`} className="flex items-center gap-3 p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                          {p.name}
                          {p.status === "INACTIVE" && <Badge tone="past">終了</Badge>}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                          {p.address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {p.address}
                            </span>
                          )}
                          {p.keyboxStatus === "HAS" && (
                            <span className="flex items-center gap-1">
                              <KeyRound className="h-3 w-3" />
                              キーBOXあり
                            </span>
                          )}
                          <span>案件 {p._count.jobs}</span>
                        </p>
                      </div>
                    </CardLink>
                  ))}
                </div>
              )}
            </section>

            {/* 案件 */}
            <section className="space-y-2.5">
              <SectionTitle
                action={
                  can(user, "job.manage") ? (
                    <Link href={`/jobs/new?customerId=${id}`} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                      <Plus className="h-3.5 w-3.5" />
                      案件を追加
                    </Link>
                  ) : undefined
                }
              >
                案件 <span className="text-ink-faint">{customer.jobs.length}件</span>
              </SectionTitle>
              {customer.jobs.length === 0 ? (
                <EmptyState icon={<Briefcase className="h-6 w-6" />} title="案件がありません" description="定期契約・スポット・工事を登録すると表示されます" />
              ) : (
                <Card className="divide-y divide-line">
                  {customer.jobs.map((j) => (
                    <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-subtle">
                      <CategoryBadge category={j.category} short />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{j.name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {j.property.name} ・ {CONTRACT_TYPE_LABEL[j.contractType as ContractType] ?? j.contractType}
                          {isRuleKind(j.ruleKind) && ` ・ ${describeRule(j.ruleKind, (j.ruleParams ?? {}) as RuleParams)}`}
                        </p>
                      </div>
                      {showAmount && "amount" in j && j.amount != null && <span className="text-xs font-bold tnum text-emerald-700">{fmtYen(j.amount)}</span>}
                      {j.status !== "ACTIVE" && <Badge tone="past">{JOB_STATUS_LABEL[j.status as JobStatus] ?? j.status}</Badge>}
                    </Link>
                  ))}
                </Card>
              )}
            </section>

            {/* 今後の予定 */}
            <section className="space-y-2.5">
              <SectionTitle
                action={
                  <Link href={`/schedule?view=month&d=${today}&customer=${id}`} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    カレンダーで見る
                  </Link>
                }
              >
                今後30日の予定 <span className="text-ink-faint">{customer.occurrences.length}件</span>
              </SectionTitle>
              {customer.occurrences.length === 0 ? (
                <p className="card p-4 text-center text-sm text-ink-muted">予定はありません</p>
              ) : (
                <Card className="divide-y divide-line">
                  {customer.occurrences.map((o) => {
                    const key = o.date ? storedDateKey(o.date) : null;
                    return (
                      <Link key={o.id} href={key ? `/schedule?view=day&d=${key}` : "/schedule"} className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-subtle">
                        <span className="w-20 shrink-0 tnum font-semibold text-ink-soft">{key ? fmtKeyShort(key) : "未定"}</span>
                        {o.startTime && <span className="w-12 shrink-0 tnum text-xs text-ink-muted">{o.startTime}</span>}
                        <CategoryBadge category={o.category} short />
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{o.title ?? o.property?.name ?? customer.shortName ?? customer.name}</span>
                        <span className="hidden truncate text-xs text-ink-muted sm:block">{o.assignments.map((a) => a.user.name).join("・")}</span>
                        <OccurrenceStatusBadge status={o.status} />
                      </Link>
                    );
                  })}
                </Card>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            {/* 担当者 */}
            <section className="space-y-2.5">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" />
                  先方の担当者
                </span>
              </SectionTitle>
              {activeContacts.length === 0 ? (
                <p className="card p-4 text-center text-xs text-ink-muted">担当者は登録されていません</p>
              ) : (
                <Card className="divide-y divide-line">
                  {activeContacts.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink">
                          {c.name}
                          <span className="ml-1.5 text-xs font-semibold text-ink-muted">{CONTACT_TYPE_LABEL[c.contactType as ContactType] ?? c.contactType}</span>
                        </p>
                        <p className="text-xs text-ink-muted">{[c.department, c.position].filter(Boolean).join(" ")}</p>
                        <p className="text-xs text-ink-soft">
                          {c.mobile && <a href={`tel:${c.mobile}`} className="mr-2 text-brand-600">{c.mobile}</a>}
                          {c.phone && <a href={`tel:${c.phone}`} className="mr-2 text-brand-600">{c.phone}</a>}
                          {c.email && <span>{c.email}</span>}
                        </p>
                        {c.note && <p className="text-xs text-ink-muted">{c.note}</p>}
                      </div>
                      {canManage && (
                        <form action={setContactInactive}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-[11px] font-semibold text-ink-faint hover:text-status-danger">異動・退任</button>
                        </form>
                      )}
                    </div>
                  ))}
                </Card>
              )}
              {pastContacts.length > 0 && (
                <details className="group rounded-xl border border-line bg-surface text-xs">
                  <summary className="cursor-pointer list-none px-3 py-2 font-bold text-ink-muted [&::-webkit-details-marker]:hidden">
                    過去の担当者（{pastContacts.length}）
                  </summary>
                  <div className="divide-y divide-line border-t border-line">
                    {pastContacts.map((c) => (
                      <p key={c.id} className="px-3 py-1.5 text-ink-muted">
                        {c.name}（{c.activeFrom ? fmtDate(c.activeFrom) : "?"} 〜 {c.activeTo ? fmtDate(c.activeTo) : "?"}）
                      </p>
                    ))}
                  </div>
                </details>
              )}
              {canManage && (
                <details className="group rounded-2xl border border-dashed border-line-strong bg-surface">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-bold text-ink-soft [&::-webkit-details-marker]:hidden">
                    <Plus className="h-4 w-4" />
                    担当者を追加
                  </summary>
                  <form action={addContact} className="space-y-3 border-t border-line p-4">
                    <input type="hidden" name="customerId" value={id} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="氏名" htmlFor="ct-name" required className="col-span-2">
                        <Input id="ct-name" name="name" required />
                      </Field>
                      <Field label="区分" htmlFor="ct-type">
                        <Select id="ct-type" name="contactType" defaultValue="SITE">
                          {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((k) => (
                            <option key={k} value={k}>{CONTACT_TYPE_LABEL[k]}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="部署・役職" htmlFor="ct-dept">
                        <Input id="ct-dept" name="department" />
                      </Field>
                      <Field label="携帯" htmlFor="ct-mobile">
                        <Input id="ct-mobile" name="mobile" type="tel" />
                      </Field>
                      <Field label="電話" htmlFor="ct-phone">
                        <Input id="ct-phone" name="phone" type="tel" />
                      </Field>
                      <Field label="メール" htmlFor="ct-email" className="col-span-2">
                        <Input id="ct-email" name="email" type="email" />
                      </Field>
                      <Field label="メモ" htmlFor="ct-note" className="col-span-2">
                        <Input id="ct-note" name="note" />
                      </Field>
                    </div>
                    <button type="submit" className={buttonClass({ size: "md", className: "w-full" })}>追加する</button>
                  </form>
                </details>
              )}
            </section>

            {hasDetails && (
              <details className="group rounded-2xl border border-line bg-surface" open>
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-ink-soft [&::-webkit-details-marker]:hidden">
                  連絡先・取引条件
                  <ChevronDown className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line px-4 py-1">
                  <DataList>
                    <DataRow label="電話" value={customer.phone} />
                    <DataRow label="FAX" value={customer.fax} />
                    <DataRow label="メール" value={customer.email} />
                    <DataRow label="本社住所" value={customer.headOfficeAddress ? <span className="whitespace-pre-wrap">{customer.headOfficeAddress}</span> : null} />
                    <DataRow label="請求書送付先" value={customer.billingAddress ? <span className="whitespace-pre-wrap">{customer.billingAddress}</span> : null} />
                    <DataRow label="締め日" value={customer.closingDay} />
                    <DataRow label="支払期日" value={customer.paymentDueTerm} />
                    <DataRow label="支払方法" value={customer.paymentMethod ? labelOf(PAYMENT_METHOD_LABEL, customer.paymentMethod) : null} />
                    {customer.cybozuId && <DataRow label="サイボウズID" value={customer.cybozuId} />}
                  </DataList>
                </div>
              </details>
            )}
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}
