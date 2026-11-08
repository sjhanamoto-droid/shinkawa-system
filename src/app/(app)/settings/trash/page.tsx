import { notFound } from "next/navigation";
import { FileText, Film, ImageIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstDateTimeLabel } from "@/lib/date";
import { TRASH_DAYS, trashParentExists } from "@/lib/trash";
import { isBackupConfigured } from "@/lib/media-backup";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { RestoreButton } from "@/features/trash/restore-button";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  DRAWING: "図面",
  KEYBOX: "キーBOX写真",
  SURVEY: "現調写真",
  RECEIPT: "領収書",
  WORK: "写真",
  BEFORE: "作業前の写真",
  AFTER: "作業後の写真",
  OTHER: "写真",
};

/** 削除済みの写真・図面・領収書（30日の猶予の間は元に戻せる）。最高管理者・事務のみ */
export default async function TrashPage() {
  const me = await requireUser();
  if (!isManager(me)) notFound();
  const rows = await db.deletedMedia.findMany({
    where: { purgeAfter: { gt: new Date() } },
    orderBy: { deletedAt: "desc" },
    take: 100,
    select: {
      id: true, kind: true, caption: true, isVideo: true, width: true, thumbUrl: true, revision: true, reason: true,
      deletedAt: true, purgeAfter: true, deletedById: true, propertyId: true, reportId: true, claimId: true, occurrenceId: true,
    },
  });
  const [props, reports, users, pendingBackup] = await Promise.all([
    db.property.findMany({ where: { id: { in: rows.map((r) => r.propertyId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db.dailyReport.findMany({ where: { id: { in: rows.map((r) => r.reportId).filter((x): x is string => !!x) } }, select: { id: true, workDate: true, user: { select: { name: true } }, property: { select: { name: true } } } }),
    db.user.findMany({ where: { id: { in: rows.map((r) => r.deletedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db.photo.count({ where: { backedUpAt: null, isVideo: false } }),
  ]);
  const propName = new Map(props.map((p) => [p.id, p.name]));
  // 現場・日報・クレームごと消えたものは戻せない（猶予の間は原本だけ残り、期限が来たら消える）
  const blocked = new Map(await Promise.all(rows.map(async (r) => [r.id, await trashParentExists(db, r)] as const)));
  const reportOf = new Map(reports.map((r) => [r.id, r]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const where = (r: (typeof rows)[number]) => {
    if (r.propertyId) return `現場：${propName.get(r.propertyId) ?? "（削除された現場）"}`;
    if (r.reportId) {
      const rep = reportOf.get(r.reportId);
      return rep ? `日報：${rep.property?.name ?? ""} ${rep.user.name}` : "日報：（削除された日報）";
    }
    if (r.claimId) return "クレーム";
    return "—";
  };

  return (
    <div>
      <PageHeader title="削除済みの写真・図面" backHref="/settings" />
      <PageContainer size="narrow">
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            削除した写真・図面・領収書は、すぐには消えずに{TRASH_DAYS}日間ここに残り、元に戻せます。{TRASH_DAYS}日を過ぎると原本ごと完全に削除されます（バックアップには残ります）。
            領収書は、付いていた経費が残っていれば元どおりつなぎ直します。現場・日報・クレームごと削除したものは戻せません。
          </p>
          <p className="rounded-xl bg-surface-subtle px-4 py-3 text-sm text-ink-soft">
            バックアップ：{isBackupConfigured() ? `毎日、別の保存先へコピーしています（動画を除く）。まだコピーしていないもの ${pendingBackup}件` : "保存先が未設定のため、まだ取っていません"}
          </p>
          {rows.length === 0 ? (
            <EmptyState title="削除済みのものはありません" description={`削除してから${TRASH_DAYS}日以内のものがここに出ます。`} />
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {rows.map((r) => {
                const isPdf = r.width == null && !r.isVideo;
                const days = Math.max(0, Math.ceil((r.purgeAfter.getTime() - Date.now()) / 86_400_000));
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    {r.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbUrl} alt="" className="h-14 w-11 shrink-0 rounded border border-line object-cover" />
                    ) : (
                      <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded border border-line bg-surface-subtle text-ink-faint">
                        {r.isVideo ? <Film className="h-5 w-5" /> : isPdf ? <FileText className="h-5 w-5 text-red-500" /> : <ImageIcon className="h-5 w-5" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">
                        {KIND_LABEL[r.kind] ?? "写真"}
                        {r.isVideo ? "（動画）" : isPdf ? "（PDF）" : ""}
                        {r.kind === "DRAWING" && r.revision > 1 ? `・第${r.revision}版` : ""}
                        {r.caption ? `：${r.caption}` : ""}
                      </p>
                      <p className="truncate text-xs text-ink-muted">{where(r)}</p>
                      <p className="text-xs text-ink-faint">
                        {jstDateTimeLabel(r.deletedAt)}に{r.deletedById ? (userName.get(r.deletedById) ?? "") : ""}が削除（{r.reason ?? "—"}）・あと{days}日
                      </p>
                    </div>
                    {blocked.get(r.id) ? (
                      <p className="max-w-[9rem] shrink-0 text-right text-xs text-ink-muted">元に戻せません（{blocked.get(r.id)!.replace("ため戻せません", "")}）</p>
                    ) : (
                      <RestoreButton id={r.id} />
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
