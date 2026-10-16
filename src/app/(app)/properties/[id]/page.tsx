import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MapPin, KeyRound, DoorOpen, Phone, CalendarDays, Copy, Repeat, Camera, Info, StickyNote, AlertTriangle, ExternalLink, Users, Building2, ChevronRight, ClipboardCheck, UserRound, Map as MapIcon } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, avatarUrlFor } from "@/lib/session";
import { can, canEditDepartment, canViewAmounts, isManager } from "@/lib/permissions";
import { dayRangeForKey, jstDateKey, jstMonthKey, addDaysKey, addMonthsKey, storedDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { Badge, CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { PhotoGrid } from "@/components/photo-grid";
import { PdfRow } from "@/components/pdf-row";
import { PropertyDetailTabs } from "@/features/properties/property-detail-tabs";
import { PropertyMemoPanel, type PropertyMemoAuthor } from "@/features/properties/property-memo-panel";
import { RelationControl } from "@/features/properties/relation-control";
import { HandoverPanel, ClampedText } from "@/features/properties/handover-panel";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { fmtKeyShort } from "@/features/schedule/filters";
import { CONTRACT_TYPE_LABEL, DEPARTMENT_LABEL, PROPERTY_STATUS_LABEL, isDepartment, isRuleKind, type ContractType, type PropertyStatus } from "@/lib/constants";
import { MoveJobButton } from "@/features/properties/move-job-button";
import { ChangeCustomerButton } from "@/features/properties/change-customer-button";
import { loadCustomerChoices, OTHER_CUSTOMER_NAME } from "@/features/properties/customer-choices";
import { PRIMARY_JOB_ORDER, describeWork } from "@/features/properties/work";
import { getCategories } from "@/lib/categories-server";
import { cn, mapSearchUrl } from "@/lib/utils";
import { canViewAllReports } from "@/lib/reports";
import { loadPropertyReports } from "@/features/reports/queries";
import { ReportListRow } from "@/features/reports/report-items";

const MEMO_LIMIT = 30;

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const canManage = can(user, "property.manage");
  const showAmount = canViewAmounts(user);
  const { id } = await params;
  const today = jstDateKey();

  const property = await db.property.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      photos: { select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
      memos: { orderBy: { createdAt: "desc" }, take: MEMO_LIMIT },
      _count: { select: { memos: true } },
      handovers: { orderBy: { createdAt: "desc" }, take: 50 },
      jobs: {
        orderBy: PRIMARY_JOB_ORDER,
        select: {
          id: true, name: true, department: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true, amount: showAmount,
          headcount: true, defaultStartTime: true, defaultEndTime: true, startsOn: true, endsOn: true, generatedThrough: true, note: true,
          vehicle: { select: { name: true, color: true } },
          _count: { select: { occurrences: true } },
        },
      },
      occurrences: {
        where: { date: { gte: dayRangeForKey(today).gte, lt: dayRangeForKey(addDaysKey(today, 60)).lt }, status: { notIn: ["CANCELLED"] } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 30,
        select: { id: true, date: true, startTime: true, category: true, status: true, title: true, assignments: { select: { user: { select: { name: true } } } } },
      },
      relationsA: { include: { propertyB: { select: { id: true, name: true, address: true } } } },
      relationsB: { include: { propertyA: { select: { id: true, name: true, address: true } } } },
    },
  });
  if (!property) notFound();

  // 顧客が「その他」の現場は、詳細から別の顧客に振り分けられる
  const customerChoices =
    canManage && property.customer.name === OTHER_CUSTOMER_NAME
      ? (await loadCustomerChoices()).filter((c) => c.id !== property.customerId)
      : null;

  // 関連物件（双方向）と候補（同じ顧客の他物件）
  const related = [
    ...property.relationsA.map((r) => ({ relationId: r.id, note: r.note, other: r.propertyB })),
    ...property.relationsB.map((r) => ({ relationId: r.id, note: r.note, other: r.propertyA })),
  ];
  const relatedIds = new Set(related.map((r) => r.other.id));
  const candidates = canManage
    ? await db.property.findMany({
        where: { customerId: property.customerId, id: { notIn: [id, ...relatedIds] } },
        select: { id: true, name: true, address: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    : [];

  // メモ・引き継ぎの投稿者
  const authorIds = Array.from(new Set([...property.memos.map((m) => m.createdById), ...property.handovers.flatMap((h) => [h.createdById, h.resolvedById])].filter((x): x is string => !!x)));
  const reports = canViewAllReports(user) ? await loadPropertyReports(id, 5) : null;
  const authorRows = await db.user.findMany({ where: { id: { in: [...authorIds, user.id] } }, select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true } });
  const authors: Record<string, PropertyMemoAuthor> = {};
  for (const a of authorRows) authors[a.id] = { id: a.id, name: a.name, avatarColor: a.avatarColor, avatarUrl: avatarUrlFor(a) };
  const me = authors[user.id] ?? { id: user.id, name: user.name, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl };

  const drawings = property.photos.filter((p) => p.kind === "DRAWING");
  const keyboxPhotos = property.photos.filter((p) => p.kind === "KEYBOX");
  const surveyPhotos = property.photos.filter((p) => p.kind === "SURVEY");
  const workPhotos = property.photos.filter((p) => !["DRAWING", "KEYBOX", "SURVEY"].includes(p.kind));
  const openHandovers = property.handovers.filter((h) => !h.resolvedAt);
  const [job, ...otherJobs] = property.jobs;
  const rule = job && isRuleKind(job.ruleKind) ? { kind: job.ruleKind, params: (job.ruleParams ?? {}) as RuleParams } : null;
  const thisMonth = jstMonthKey();
  const categories = await getCategories();
  // 定期（月◯回）：今月〜翌々月それぞれ、何回のうち何回の日付が決まったか
  const monthCounts = job && job.contractType === "REGULAR"
    ? await Promise.all(
        [0, 1, 2].map((i) => addMonthsKey(thisMonth, i)).map(async (ym) => {
          const rows = await db.occurrence.findMany({ where: { jobId: job.id, targetMonth: ym, status: { not: "CANCELLED" } }, select: { date: true } });
          return { ym, total: rows.length, placed: rows.filter((r) => r.date).length };
        }),
      )
    : [];

  // 見出しの件数（大見出しの横に控えめに出す）
  const countLabel = (n: number) => <span className="text-sm font-normal text-ink-muted tnum">{n}件</span>;
  const emptyBox = (text: string) => (
    <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center text-sm font-medium text-ink-muted">{text}</div>
  );
  const mapsUrl = property.address ? mapSearchUrl(property.address) : null;
  const calendarHref = `/schedule?view=month&d=${today}&q=${encodeURIComponent(property.name)}`;

  const basicTab = (
    <div className="space-y-6">
      {openHandovers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 border-t-4 border-t-amber-400 bg-amber-50 px-4 py-3.5 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-base font-bold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            未解決の引き継ぎが {openHandovers.length} 件あります
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-ink-soft">
            {openHandovers.slice(0, 3).map((h) => (
              <li key={h.id} className="line-clamp-2 break-words">・{h.content}</li>
            ))}
          </ul>
        </div>
      )}
      {property.handoverNote && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
            <ClipboardCheck className="h-4 w-4" />
            業務連絡
          </p>
          <ClampedText text={property.handoverNote} className="text-sm leading-relaxed text-amber-900 dark:text-amber-100" toggleClassName="text-amber-800 dark:text-amber-300" />
        </div>
      )}

      <section className="space-y-2.5">
        <SectionTitle>現場情報</SectionTitle>
        <Card className="space-y-4 p-4">
          {/* キーBOX（あり＝番号を大きく／なし＝受け渡し方法） */}
          <div className="rounded-xl bg-surface-sunken p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <KeyRound className="h-4 w-4" />
              {property.keyboxStatus === "HAS" ? "キーBOX番号" : "キーBOX"}
            </p>
            {property.keyboxStatus === "HAS" ? (
              <>
                <p className="mt-1 text-3xl font-bold tracking-wider text-ink tnum">{property.keyboxNumber ?? "番号未登録"}</p>
                {property.keyboxPlace && <p className="mt-1.5 text-sm font-medium text-ink-soft">場所: {property.keyboxPlace}</p>}
              </>
            ) : property.keyboxStatus === "NONE" ? (
              <>
                <p className="mt-1 text-lg font-bold text-ink">なし</p>
                {property.keyboxNoneReason && <p className="mt-1 text-sm font-medium text-ink-soft">{property.keyboxNoneReason}</p>}
              </>
            ) : (
              <p className="mt-1 text-lg font-bold text-ink-muted">未確認</p>
            )}
          </div>

          <DataList>
            <DataRow
              label="顧客"
              value={
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/customers/${property.customer.id}`} className="font-medium text-brand-600">{property.customer.name}</Link>
                  {customerChoices && <ChangeCustomerButton propertyId={id} customers={customerChoices} />}
                </span>
              }
            />
            <DataRow
              label="住所"
              value={
                property.address && mapsUrl ? (
                  // タップで Google マップを開く
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 font-medium text-brand-600 underline-offset-2 hover:underline">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {property.address}
                  </a>
                ) : null
              }
            />
            <DataRow label="建物・部屋" value={property.building} />
            <DataRow label="部屋数・箇所" value={property.unitCount != null ? `${property.unitCount}件` : null} />
            <DataRow
              label="現場連絡先"
              value={
                property.contactName || property.contactPhone ? (
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5 text-ink-muted" />
                    {property.contactName || property.contactPhone}
                  </span>
                ) : null
              }
            />
          </DataList>

          {property.accessNote && (
            <div className="rounded-xl bg-surface-sunken p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <DoorOpen className="h-4 w-4" />
                入館・注意
              </p>
              <ClampedText text={property.accessNote} className="mt-1 text-sm font-medium leading-relaxed text-ink-soft" toggleClassName="text-brand-600" />
            </div>
          )}

          {/* 地図は上部の概要カードにある。電話はここから */}
          {property.contactPhone && (
            <a href={`tel:${property.contactPhone}`} className={buttonClass({ size: "md", className: "w-full" })}>
              <Phone className="h-5 w-5" />
              {property.contactName ? `${property.contactName}に電話` : "現場連絡先に電話"}
              <span className="font-medium tnum opacity-80">{property.contactPhone}</span>
            </a>
          )}
        </Card>
      </section>

      {/* 作業内容（現場1件＝作業1つ） */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            canManage ? (
              <Link href={`/properties/new?copyFrom=${id}`} className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-brand-600">
                <Copy className="h-3.5 w-3.5" />コピーして別の作業を登録
              </Link>
            ) : undefined
          }
        >
          作業内容
        </SectionTitle>
        {!job ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-center">
            <p className="text-sm font-medium text-ink-muted">作業内容はまだ設定されていません</p>
            {canManage && (
              <Link href={`/properties/${id}/edit`} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-bold text-brand-600">編集から設定する</Link>
            )}
          </div>
        ) : (
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {isDepartment(job.department) && <Badge tone="info">{DEPARTMENT_LABEL[job.department]}</Badge>}
              <CategoryBadge category={job.category} />
              <Badge tone="neutral">{CONTRACT_TYPE_LABEL[job.contractType as ContractType] ?? job.contractType}</Badge>
              {job.status !== "ACTIVE" && <Badge tone="past">{job.status === "PAUSED" ? "休止中" : "終了"}</Badge>}
            </div>
            <DataList>
              {rule && <DataRow label="周期" value={<span className="flex items-center justify-end gap-1"><Repeat className="h-3.5 w-3.5 text-ink-faint" />{describeRule(rule.kind, rule.params)}</span>} />}
              {job.contractType === "REGULAR" && job.endsOn && <DataRow label="定期の終了" value={fmtKeyShort(storedDateKey(job.endsOn))} />}
              {job.contractType === "CONSTRUCTION" && (
                <DataRow label="工期" value={job.startsOn ? `${fmtKeyShort(storedDateKey(job.startsOn))}${job.endsOn ? ` 〜 ${fmtKeyShort(storedDateKey(job.endsOn))}` : ""}` : "未定"} />
              )}
              {monthCounts.map((m) => (
                <DataRow
                  key={m.ym}
                  label={`${Number(m.ym.slice(5))}月`}
                  value={
                    m.total === 0 ? (
                      "まだ未割当に入っていません"
                    ) : (
                      <span>
                        {m.total}回中 <span className="font-bold tnum">{m.placed}</span>回 日付決定
                        {m.total > m.placed && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">未割当 {m.total - m.placed}</span>}
                      </span>
                    )
                  }
                />
              ))}
            </DataList>
            {job.note && (
              <div className="mt-3 rounded-xl bg-surface-sunken p-3.5">
                <ClampedText text={job.note} className="text-sm leading-relaxed text-ink-soft" toggleClassName="text-brand-600" />
              </div>
            )}
            {rule && job.status === "ACTIVE" && (
              <p className="mt-4 flex items-start gap-1.5 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
                <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                今月〜翌々月の分が毎日自動で未割当に入ります（何もしなくて大丈夫です）。日付はカレンダーの「＋」から予定を追加するときに、未割当の現場を選んで決めます。
              </p>
            )}
          </Card>
        )}
        {otherJobs.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/40">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">この現場には、統合前に登録された作業がほかに {otherJobs.length} 件あります</p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">「別の現場に分ける」と、この現場をコピーした新しい現場にその作業と予定を移します。</p>
            {otherJobs.map((j) => (
              <div key={j.id} className="flex min-h-[52px] items-center gap-2 rounded-xl bg-surface px-3 py-2">
                <CategoryBadge category={j.category} short />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-bold text-ink">{j.name}</p>
                  <p className="break-words text-xs text-ink-muted">{describeWork(j, categories)}・予定 {j._count.occurrences}件</p>
                </div>
                {canManage && canEditDepartment(user, j.department) && <MoveJobButton jobId={j.id} jobName={j.name} />}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 今後の予定 */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            <Link href={calendarHref} className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-brand-600">
              <CalendarDays className="h-3.5 w-3.5" />カレンダー
            </Link>
          }
        >
          <span className="flex items-baseline gap-2">今後60日の予定{countLabel(property.occurrences.length)}</span>
        </SectionTitle>
        {property.occurrences.length === 0 ? (
          emptyBox("予定はありません")
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {property.occurrences.map((o) => {
              const key = o.date ? storedDateKey(o.date) : null;
              return (
                <Link key={o.id} href={key ? `/schedule?view=day&d=${key}` : "/schedule"} className="flex min-h-[52px] items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-surface-subtle">
                  <span className="w-20 shrink-0 tnum font-bold text-ink">{key ? fmtKeyShort(key) : "未定"}</span>
                  {o.startTime && <span className="w-12 shrink-0 tnum text-sm text-ink-muted">{o.startTime}</span>}
                  <CategoryBadge category={o.category} short />
                  <span className="min-w-0 flex-1 break-words text-sm text-ink-soft">
                    <Users className="mr-1 inline h-3.5 w-3.5 text-ink-muted" />
                    {o.assignments.map((a) => a.user.name).join("・") || "担当未定"}
                  </span>
                  <OccurrenceStatusBadge status={o.status} />
                </Link>
              );
            })}
          </Card>
        )}
      </section>

      {reports && (
        <section className="space-y-2.5">
          <SectionTitle
            action={
              reports.total > 0 ? (
                <Link href={`/reports/all?property=${id}`} className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-brand-600">
                  すべて見る（{reports.total}）
                </Link>
              ) : undefined
            }
          >
            <span className="flex items-baseline gap-2">日報{countLabel(reports.total)}</span>
          </SectionTitle>
          {reports.items.length === 0 ? (
            emptyBox("日報はまだありません")
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {reports.items.map((r) => (
                <ReportListRow key={r.id} r={r} />
              ))}
            </Card>
          )}
        </section>
      )}

      <section className="space-y-2.5">
        <SectionTitle>関連物件</SectionTitle>
        <RelationControl propertyId={id} related={related} candidates={candidates} canEdit={canManage} />
      </section>
    </div>
  );

  const photosTab = (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <SectionTitle>図面・資料（PDF）</SectionTitle>
        {drawings.length === 0 ? (
          emptyBox(`図面・資料はまだありません${canManage ? "（編集から追加できます）" : ""}`)
        ) : (
          <div className="space-y-2">
            {drawings.filter((p) => p.width == null).map((p, i) => (
              <PdfRow key={p.id} photoId={p.id} label={p.caption || `図面・資料 ${i + 1}`} />
            ))}
            {drawings.some((p) => p.width != null) && <PhotoGrid photos={drawings.filter((p) => p.width != null)} />}
          </div>
        )}
      </section>
      <section className="space-y-2.5">
        <SectionTitle>キーBOX写真</SectionTitle>
        {keyboxPhotos.length === 0 ? emptyBox("写真はありません") : <PhotoGrid photos={keyboxPhotos} />}
      </section>
      <section className="space-y-2.5">
        <SectionTitle>現調写真</SectionTitle>
        {surveyPhotos.length === 0 ? emptyBox("写真はありません") : <PhotoGrid photos={surveyPhotos} />}
      </section>
      {workPhotos.length > 0 && (
        <section className="space-y-2.5">
          <SectionTitle>作業写真</SectionTitle>
          <PhotoGrid photos={workPhotos} />
        </section>
      )}
    </div>
  );

  const memoTab = (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <SectionTitle>
          <span className="flex items-baseline gap-2">
            引き継ぎ事項
            {openHandovers.length > 0 && <span className="text-sm font-normal text-ink-muted tnum">未解決 {openHandovers.length}件</span>}
          </span>
        </SectionTitle>
        <HandoverPanel
          propertyId={id}
          items={property.handovers.map((h) => ({
            id: h.id,
            content: h.content,
            createdAt: h.createdAt.toISOString(),
            createdByName: h.createdById ? (authors[h.createdById]?.name ?? null) : null,
            resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
            resolvedByName: h.resolvedById ? (authors[h.resolvedById]?.name ?? null) : null,
          }))}
        />
      </section>
      <section className="space-y-2.5">
        <SectionTitle>物件メモ</SectionTitle>
        <PropertyMemoPanel
          propertyId={id}
          memos={property.memos.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(), createdById: m.createdById, atSurvey: m.atSurvey }))}
          authors={authors}
          totalCount={property._count.memos}
          currentUser={me}
          canManageAll={isManager(user)}
        />
      </section>
    </div>
  );

  // ───────────────── 上部の概要カード（状態・現場名・作業・場所・主な操作） ─────────────────
  const summaryCard = (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto w-full max-w-7xl px-5 pb-5 pt-5 md:px-8 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          {/* 顧客（タップで顧客情報へ） */}
          <Link href={`/customers/${property.customer.id}`} className="flex min-h-[32px] min-w-0 items-center gap-1.5 text-sm font-semibold text-ink-soft active:opacity-70">
            <Building2 className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="truncate">{property.customer.name}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          </Link>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {job && isDepartment(job.department) && <Badge tone="info">{DEPARTMENT_LABEL[job.department]}</Badge>}
            {job && <CategoryBadge category={job.category} short />}
            {property.status !== "ACTIVE" && <Badge tone="past" className="px-3 py-1 text-sm font-bold">{PROPERTY_STATUS_LABEL[property.status as PropertyStatus] ?? property.status}</Badge>}
          </div>
        </div>
        <h1 className="mt-3 break-words text-2xl font-bold leading-snug text-ink [text-wrap:pretty]">{property.name}</h1>
        {(property.building || property.unitCount != null || job) && (
          <p className="mt-2 text-sm text-ink-muted tnum">
            {[
              property.building,
              property.unitCount != null ? `${property.unitCount}件` : null,
              job ? (rule ? `${CONTRACT_TYPE_LABEL[job.contractType as ContractType] ?? job.contractType}（${describeRule(rule.kind, rule.params)}）` : (CONTRACT_TYPE_LABEL[job.contractType as ContractType] ?? job.contractType)) : null,
            ]
              .filter(Boolean)
              .join(" ・ ")}
          </p>
        )}

        {property.address && mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-3 flex min-w-0 items-start gap-1.5 text-sm font-medium text-brand-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{property.address}</span>
          </a>
        )}

        {/* 現場に着いて最初に要るもの：キーBOX番号 */}
        {property.keyboxStatus === "HAS" && property.keyboxNumber && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-sunken px-3.5 py-2.5">
            <KeyRound className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="text-sm font-semibold text-ink-muted">キーBOX</span>
            <span className="text-xl font-bold tracking-wider text-ink tnum">{property.keyboxNumber}</span>
            {property.keyboxPlace && <span className="min-w-0 truncate text-sm text-ink-muted">（{property.keyboxPlace}）</span>}
          </div>
        )}

        {/* カレンダー・地図（横並び） */}
        <div className={cn("mt-4 grid gap-3", mapsUrl ? "grid-cols-2" : "grid-cols-1")}>
          <LinkButton href={calendarHref} variant="outline" className="min-h-[52px] border-brand-200 text-brand-700 dark:border-brand-800">
            <CalendarDays className="h-5 w-5" aria-hidden />
            <span className="truncate">カレンダー</span>
          </LinkButton>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: "outline", className: "min-h-[52px] border-brand-200 text-brand-700 dark:border-brand-800" })}
            >
              <MapIcon className="h-5 w-5" aria-hidden />
              地図を開く
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="現場詳細"
        subtitle={property.customer.name}
        backHref="/properties"
        right={
          canManage ? (
            <LinkButton href={`/properties/${id}/edit`} variant="ghost" size="sm">
              <Pencil className="h-4 w-4" />編集
            </LinkButton>
          ) : undefined
        }
      />
      <SearchParamToast />

      {summaryCard}

      <PropertyDetailTabs
        defaultId="basic"
        tabs={[
          { id: "basic", label: "基本情報", icon: <Info className="h-4 w-4" />, count: openHandovers.length, alert: openHandovers.length > 0, content: basicTab },
          { id: "photos", label: "写真・図面", icon: <Camera className="h-4 w-4" />, count: property.photos.length, content: photosTab },
          { id: "memo", label: "メモ・引き継ぎ", icon: <StickyNote className="h-4 w-4" />, count: property._count.memos, content: memoTab },
        ]}
      />
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 md:px-8">
        <p className="flex items-center gap-1 px-1 text-xs text-ink-faint">
          <DoorOpen className="h-3.5 w-3.5 shrink-0" />
          キーBOX番号や入館方法は、カレンダーの予定を開いても確認できます
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </p>
      </div>
    </div>
  );
}
