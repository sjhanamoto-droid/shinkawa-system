import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isPlanner } from "@/lib/permissions";
import { jstDateKey } from "@/lib/date";
import { isBlobConfigured } from "@/lib/media";
import { mapSearchUrl } from "@/lib/utils";
import { fmtDayLabel, fmtHm } from "@/lib/worker";
import { PhotoGrid } from "@/components/photo-grid";
import { HandoverPanel } from "@/features/properties/handover-panel";
import { WorkerSubPage } from "@/features/worker/ui/sub-page";
import { BackButton, FooterBar, FooterSpacer, PrimaryButton } from "@/features/worker/ui/parts";
import { MySitePhotos, SitePhotoUploader } from "@/features/worker/site-photo-uploader";
import { loadVisitInfo } from "@/features/worker/queries";
import { loadDrawings } from "@/features/properties/drawings";
import { DrawingList } from "@/features/properties/drawing-list";
import { reportHref } from "@/features/worker/links";

export const dynamic = "force-dynamic";

/**
 * 現場の詳細：キーBOX・住所・連絡先・注意、引き継ぎ事項、メモ、写真・図面（追加できる）、日報の後追加。
 * ホーム・カレンダーの「現場の情報を見る」からは ?visit=予定ID&date= 付きで開き、下に「日報を書く」を出す。
 */
export default async function WorkerSiteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ visit?: string; date?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const p = await db.property.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      building: true,
      keyboxStatus: true,
      keyboxNumber: true,
      keyboxPlace: true,
      keyboxNoneReason: true,
      accessNote: true,
      contactName: true,
      contactPhone: true,
      customer: { select: { name: true } },
      photos: { where: { supersededAt: null }, select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true, createdById: true }, orderBy: { createdAt: "asc" } },
      memos: { select: { id: true, content: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 },
      handovers: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!p) notFound();
  const people = await db.user.findMany({
    where: { id: { in: p.handovers.flatMap((h) => [h.createdById, h.resolvedById]).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(people.map((u) => [u.id, u.name]));
  const keybox = p.keyboxStatus === "NONE" ? `なし${p.keyboxNoneReason ? `（${p.keyboxNoneReason}）` : ""}` : p.keyboxNumber;
  const today = jstDateKey();
  // 予定から開いたとき（その予定がこの現場のものなら）
  const visit = sp.visit ? await loadVisitInfo(sp.visit, me.id, isPlanner(me), sp.date) : null;
  const v = visit && visit.property?.id === p.id ? visit : null;
  const drawings = p.photos.filter((x) => x.kind === "DRAWING");
  const drawingItems = await loadDrawings(p.id);
  const others = p.photos.filter((x) => x.kind !== "DRAWING");
  const canDeleteAll = isPlanner(me);
  const mine = (list: typeof p.photos) =>
    list.filter((x) => canDeleteAll || x.createdById === me.id).map((x) => ({ id: x.id, isPdf: x.width == null && !x.isVideo, caption: x.caption }));
  const blobEnabled = isBlobConfigured();
  const sent = v?.report?.status === "SUBMITTED";

  return (
    <WorkerSubPage
      userId={me.id}
      title={p.name}
      backHref={v ? "/w" : "/w/sites"}
      tabs={!v}
      subtitle={
        v ? (
          <>
            {v.customerName && <span className="mr-3">{v.customerName}</span>}
            {fmtDayLabel(v.dateKey)} {v.startTime ? `${fmtHm(v.startTime)}${v.endTime ? `〜${fmtHm(v.endTime)}` : ""}` : "時間未定"}
            <span className="block text-[#d1fae5]">{v.workLabel}</span>
          </>
        ) : (
          p.customer?.name
        )
      }
    >
      <div className="space-y-3">
        {keybox && (
          <div className="rounded-[14px] bg-[var(--w-primary-soft)] px-4 py-4">
            <p className="text-[14px] font-semibold text-[var(--w-primary)]">キーBOX{p.keyboxPlace ? `（${p.keyboxPlace}）` : ""}</p>
            <p className="mt-1 text-[32px] leading-10 tracking-wider">{keybox}</p>
          </div>
        )}
        {p.address && (
          <div className="flex min-h-[76px] items-center gap-3 rounded-[14px] border border-[var(--w-border)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-[var(--w-text-muted)]">住所</p>
              <p className="break-words text-[17px] leading-7">
                {p.address}
                {p.building ? ` ${p.building}` : ""}
              </p>
            </div>
            <a href={mapSearchUrl(p.address)} target="_blank" rel="noreferrer" className="flex h-12 items-center px-2 text-[17px] font-semibold text-[var(--w-primary)]">
              地図
            </a>
          </div>
        )}
        {p.contactPhone && (
          <div className="flex min-h-[76px] items-center gap-3 rounded-[14px] border border-[var(--w-border)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-[var(--w-text-muted)]">現場連絡先{p.contactName ? `（${p.contactName}）` : ""}</p>
              <p className="text-[17px]">{p.contactPhone}</p>
            </div>
            <a href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`} className="flex h-12 items-center px-2 text-[17px] font-semibold text-[var(--w-primary)]">
              電話
            </a>
          </div>
        )}
        {(p.accessNote || v?.note) && (
          <div className="rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-4">
            <p className="text-[14px] font-semibold text-[var(--w-text-sub)]">入館・注意</p>
            {p.accessNote && <p className="mt-1 whitespace-pre-wrap text-[17px] leading-7">{p.accessNote}</p>}
            {v?.note && <p className="mt-1 whitespace-pre-wrap text-[17px] leading-7">{v.note}</p>}
          </div>
        )}
      </div>

      <section id="memo" className="mt-8 scroll-mt-4">
        <h2 className="text-[20px] font-semibold">引き継ぎ事項</h2>
        <div className="mt-3">
          <HandoverPanel
            propertyId={p.id}
            items={p.handovers.map((h) => ({
              id: h.id,
              content: h.content,
              createdAt: h.createdAt.toISOString(),
              createdByName: h.createdById ? (nameOf.get(h.createdById) ?? null) : null,
              resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
              resolvedByName: h.resolvedById ? (nameOf.get(h.resolvedById) ?? null) : null,
            }))}
          />
        </div>
        {p.memos.length > 0 && (
          <>
            <h2 className="mt-8 text-[20px] font-semibold">メモ</h2>
            <ul className="mt-3 space-y-2">
              {p.memos.map((m) => (
                <li key={m.id} className="whitespace-pre-wrap rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-3 text-[16px] leading-7">
                  {m.content}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section id="photos" className="mt-8 scroll-mt-4">
        <h2 className="text-[20px] font-semibold">写真</h2>
        <div className="mt-3">{others.length === 0 ? <p className="text-[16px] text-[var(--w-text-muted)]">写真はまだありません</p> : <PhotoGrid photos={others} />}</div>
        <div className="mt-3">
          <SitePhotoUploader propertyId={p.id} kind="WORK" blobEnabled={blobEnabled} />
          <MySitePhotos photos={mine(others)} />
        </div>
      </section>

      <section id="drawings" className="mt-8 scroll-mt-4">
        <h2 className="text-[20px] font-semibold">図面</h2>
        <p className="mt-1 text-[14px] text-[var(--w-text-muted)]">一覧は縮小画像です。開くとPDF・図面の本体を表示します。図面が変わったら「改訂版を上げる」で新しい版にしてください（前の版も残ります）。</p>
        <div className="mt-3">
          {drawingItems.length === 0 ? <p className="text-[16px] text-[var(--w-text-muted)]">図面はまだありません</p> : <DrawingList items={drawingItems} canRevise blobEnabled={blobEnabled} />}
        </div>
        <div className="mt-3">
          <SitePhotoUploader propertyId={p.id} kind="DRAWING" blobEnabled={blobEnabled} />
          <MySitePhotos photos={mine(drawings)} />
        </div>
      </section>

      {/* 書き忘れた日報・担当に入っていなかった日の日報をあとから書く */}
      <section className="mt-8 rounded-[14px] border border-[var(--w-border)] px-4 py-4">
        <h2 className="text-[18px] font-semibold">日報を後から追加</h2>
        <p className="mt-1 text-[15px] text-[var(--w-text-sub)]">書き忘れた日の日報を、この現場に追加できます。</p>
        <form action="/w/late" className="mt-3 flex gap-2">
          <input type="hidden" name="propertyId" value={p.id} />
          <input type="date" name="date" defaultValue={today} max={today} required className="h-14 min-w-0 flex-1 rounded-xl border border-[#94a3b8] px-3 text-[17px]" />
          <button type="submit" className="h-14 shrink-0 rounded-xl bg-[var(--w-primary)] px-5 text-[17px] font-semibold text-white">
            書く
          </button>
        </form>
      </section>

      {v && (
        <>
          <FooterSpacer />
          <FooterBar wide>
            <BackButton href="/w">閉じる</BackButton>
            {sent ? (
              <PrimaryButton disabled>提出済み</PrimaryButton>
            ) : v.assigned ? (
              <PrimaryButton href={reportHref({ occurrenceId: v.occurrenceId, dateKey: v.dateKey, reportId: v.report?.id ?? null })}>{v.report ? "日報の続きを書く" : "日報を書く"}</PrimaryButton>
            ) : (
              <PrimaryButton disabled>担当ではありません</PrimaryButton>
            )}
          </FooterBar>
        </>
      )}
    </WorkerSubPage>
  );
}
