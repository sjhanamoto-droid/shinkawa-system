import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MapPin, KeyRound, DoorOpen, Phone, Briefcase, CalendarDays, Plus, FileText, Camera, Info, StickyNote, AlertTriangle, ExternalLink, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser, avatarUrlFor } from "@/lib/session";
import { can, canViewAmounts, isManager } from "@/lib/permissions";
import { dayRangeForKey, jstDateKey, addDaysKey, storedDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, DataList, DataRow, SectionTitle } from "@/components/ui/card";
import { Badge, CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { SearchParamToast } from "@/components/ui/toast";
import { PhotoGrid } from "@/components/photo-grid";
import { PdfRow } from "@/components/pdf-row";
import { PropertyDetailTabs } from "@/features/properties/property-detail-tabs";
import { PropertyMemoPanel, type PropertyMemoAuthor } from "@/features/properties/property-memo-panel";
import { RelationControl } from "@/features/properties/relation-control";
import { HandoverPanel } from "@/features/properties/handover-panel";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import { fmtKeyShort } from "@/features/schedule/filters";
import { CONTRACT_TYPE_LABEL, JOB_STATUS_LABEL, isRuleKind, type ContractType, type JobStatus } from "@/lib/constants";
import { fmtYen, mapSearchUrl } from "@/lib/utils";

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
      customer: { select: { id: true, name: true, shortName: true, phone: true } },
      photos: { select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
      memos: { orderBy: { createdAt: "desc" }, take: MEMO_LIMIT },
      _count: { select: { memos: true } },
      handovers: { orderBy: { createdAt: "desc" }, take: 50 },
      jobs: {
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: { id: true, name: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true, amount: showAmount, headcount: true, unitCount: true },
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
  const authorRows = await db.user.findMany({ where: { id: { in: [...authorIds, user.id] } }, select: { id: true, name: true, avatarColor: true, avatarImage: true, updatedAt: true } });
  const authors: Record<string, PropertyMemoAuthor> = {};
  for (const a of authorRows) authors[a.id] = { id: a.id, name: a.name, avatarColor: a.avatarColor, avatarUrl: avatarUrlFor(a) };
  const me = authors[user.id] ?? { id: user.id, name: user.name, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl };

  const drawings = property.photos.filter((p) => p.kind === "DRAWING");
  const keyboxPhotos = property.photos.filter((p) => p.kind === "KEYBOX");
  const surveyPhotos = property.photos.filter((p) => p.kind === "SURVEY");
  const workPhotos = property.photos.filter((p) => !["DRAWING", "KEYBOX", "SURVEY"].includes(p.kind));
  const openHandovers = property.handovers.filter((h) => !h.resolvedAt);

  const basicTab = (
    <div className="space-y-5">
      {openHandovers.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            未解決の引き継ぎが {openHandovers.length} 件あります
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
            {openHandovers.slice(0, 3).map((h) => (
              <li key={h.id} className="truncate">・{h.content}</li>
            ))}
          </ul>
        </div>
      )}
      {property.handoverNote && (
        <div className="rounded-xl border border-line bg-surface-subtle p-3 text-sm text-ink-soft">
          <p className="mb-1 text-xs font-bold text-ink-muted">常時の申し送り</p>
          <p className="whitespace-pre-wrap">{property.handoverNote}</p>
        </div>
      )}
      <Card className="p-4">
        <DataList>
          <DataRow label="顧客" value={<Link href={`/customers/${property.customer.id}`} className="text-brand-600">{property.customer.name}</Link>} />
          <DataRow
            label="住所"
            value={
              property.address ? (
                <span className="flex items-center justify-end gap-2">
                  <span>{property.address}</span>
                  <a href={mapSearchUrl(property.address)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-brand-600">
                    <MapPin className="h-3.5 w-3.5" />地図
                  </a>
                </span>
              ) : null
            }
          />
          <DataRow label="建物・部屋" value={property.building} />
          <DataRow label="部屋数・箇所" value={property.unitCount != null ? `${property.unitCount}件` : null} />
          <DataRow
            label="キーBOX"
            value={
              property.keyboxStatus === "HAS" ? (
                <span className="flex items-center justify-end gap-1.5">
                  <KeyRound className="h-4 w-4 text-ink-faint" />
                  <span className="font-bold tnum">{property.keyboxNumber ?? "番号未登録"}</span>
                  {property.keyboxPlace && <span className="text-ink-muted">（{property.keyboxPlace}）</span>}
                </span>
              ) : property.keyboxStatus === "NONE" ? (
                <span>なし{property.keyboxNoneReason && ` — ${property.keyboxNoneReason}`}</span>
              ) : (
                "未確認"
              )
            }
          />
          <DataRow label="入館・注意" value={property.accessNote ? <span className="whitespace-pre-wrap text-left">{property.accessNote}</span> : null} />
          <DataRow
            label="現場連絡先"
            value={
              property.contactName || property.contactPhone ? (
                <span>
                  {property.contactName}
                  {property.contactPhone && (
                    <a href={`tel:${property.contactPhone}`} className="ml-2 inline-flex items-center gap-0.5 text-brand-600">
                      <Phone className="h-3.5 w-3.5" />
                      {property.contactPhone}
                    </a>
                  )}
                </span>
              ) : null
            }
          />
        </DataList>
      </Card>

      {/* 案件 */}
      <section className="space-y-2.5">
        <SectionTitle
          action={
            can(user, "job.manage") ? (
              <Link href={`/jobs/new?propertyId=${id}`} className="flex items-center gap-1 text-xs font-bold text-brand-600">
                <Plus className="h-3.5 w-3.5" />案件を追加
              </Link>
            ) : undefined
          }
        >
          <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" />案件 <span className="text-ink-faint">{property.jobs.length}件</span></span>
        </SectionTitle>
        {property.jobs.length === 0 ? (
          <p className="card p-4 text-center text-sm text-ink-muted">案件はまだありません</p>
        ) : (
          <Card className="divide-y divide-line">
            {property.jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-subtle">
                <CategoryBadge category={j.category} short />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{j.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {CONTRACT_TYPE_LABEL[j.contractType as ContractType] ?? j.contractType}
                    {isRuleKind(j.ruleKind) && ` ・ ${describeRule(j.ruleKind, (j.ruleParams ?? {}) as RuleParams)}`}
                    {j.headcount ? ` ・ ${j.headcount}名` : ""}
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
            <Link href={`/schedule?view=month&d=${today}&q=${encodeURIComponent(property.name)}`} className="flex items-center gap-1 text-xs font-bold text-brand-600">
              <CalendarDays className="h-3.5 w-3.5" />カレンダー
            </Link>
          }
        >
          今後60日の予定 <span className="text-ink-faint">{property.occurrences.length}件</span>
        </SectionTitle>
        {property.occurrences.length === 0 ? (
          <p className="card p-4 text-center text-sm text-ink-muted">予定はありません</p>
        ) : (
          <Card className="divide-y divide-line">
            {property.occurrences.map((o) => {
              const key = o.date ? storedDateKey(o.date) : null;
              return (
                <Link key={o.id} href={key ? `/schedule?view=day&d=${key}` : "/schedule"} className="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-subtle">
                  <span className="w-20 shrink-0 tnum font-semibold text-ink-soft">{key ? fmtKeyShort(key) : "未定"}</span>
                  {o.startTime && <span className="w-12 shrink-0 tnum text-xs text-ink-muted">{o.startTime}</span>}
                  <CategoryBadge category={o.category} short />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                    <Users className="mr-1 inline h-3 w-3" />
                    {o.assignments.map((a) => a.user.name).join("・") || "担当未定"}
                  </span>
                  <OccurrenceStatusBadge status={o.status} />
                </Link>
              );
            })}
          </Card>
        )}
      </section>

      <section className="space-y-2.5">
        <SectionTitle>関連物件</SectionTitle>
        <RelationControl propertyId={id} related={related} candidates={candidates} canEdit={canManage} />
      </section>
    </div>
  );

  const photosTab = (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <SectionTitle><span className="flex items-center gap-1.5"><FileText className="h-4 w-4" />図面・資料（PDF）</span></SectionTitle>
        {drawings.length === 0 ? (
          <p className="card p-4 text-center text-sm text-ink-muted">図面・資料はまだありません{canManage && "（編集から追加できます）"}</p>
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
        <SectionTitle><span className="flex items-center gap-1.5"><KeyRound className="h-4 w-4" />キーBOX写真</span></SectionTitle>
        {keyboxPhotos.length === 0 ? <p className="card p-4 text-center text-sm text-ink-muted">写真はありません</p> : <PhotoGrid photos={keyboxPhotos} />}
      </section>
      <section className="space-y-2.5">
        <SectionTitle><span className="flex items-center gap-1.5"><Camera className="h-4 w-4" />現調写真</span></SectionTitle>
        {surveyPhotos.length === 0 ? <p className="card p-4 text-center text-sm text-ink-muted">写真はありません</p> : <PhotoGrid photos={surveyPhotos} />}
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
    <div className="space-y-5">
      <section className="space-y-2.5">
        <SectionTitle><span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />引き継ぎ事項</span></SectionTitle>
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
        <SectionTitle><span className="flex items-center gap-1.5"><StickyNote className="h-4 w-4" />物件メモ</span></SectionTitle>
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

  return (
    <div>
      <PageHeader
        title={property.name}
        subtitle={
          <span className="flex items-center gap-1.5">
            {property.customer.shortName ?? property.customer.name}
            {property.status === "INACTIVE" && <Badge tone="past">終了</Badge>}
          </span>
        }
        backHref="/properties"
        right={
          canManage ? (
            <LinkButton href={`/properties/${id}/edit`} variant="ghost" size="sm">
              <Pencil className="h-4 w-4" />編集
            </LinkButton>
          ) : undefined
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        <PropertyDetailTabs
          defaultId="basic"
          tabs={[
            { id: "basic", label: "基本情報", icon: <Info className="h-4 w-4" />, count: openHandovers.length, alert: openHandovers.length > 0, content: basicTab },
            { id: "photos", label: "写真・図面", icon: <Camera className="h-4 w-4" />, count: property.photos.length, content: photosTab },
            { id: "memo", label: "メモ・引き継ぎ", icon: <StickyNote className="h-4 w-4" />, count: property._count.memos, content: memoTab },
          ]}
        />
        <p className="mt-4 flex items-center gap-1 px-1 text-[11px] text-ink-faint">
          <DoorOpen className="h-3 w-3" />
          キーBOX番号や入館方法は、カレンダーの予定を開いても確認できます
          <ExternalLink className="h-3 w-3" />
        </p>
      </PageContainer>
    </div>
  );
}
