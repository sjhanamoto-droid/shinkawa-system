import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { isPhotoKind } from "@/lib/constants";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ClaimForm } from "@/features/claims/claim-form";
import { claimPropertyOptions } from "@/features/claims/queries";

export const dynamic = "force-dynamic";

export default async function EditClaimPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("claim.manage");
  const { id } = await params;
  const [c, properties] = await Promise.all([
    db.claim.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        propertyId: true,
        occurredOn: true,
        content: true,
        cause: true,
        prevention: true,
        photos: { select: { id: true, caption: true, kind: true, isVideo: true, duration: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    claimPropertyOptions(),
  ]);
  if (!c) notFound();
  return (
    <div>
      <PageHeader title="クレームを編集" backHref={`/claims/${id}`} />
      <PageContainer size="narrow">
        <ClaimForm
          initial={{
            id: c.id,
            title: c.title,
            propertyId: c.propertyId ?? "",
            occurredOn: c.occurredOn ?? "",
            content: c.content,
            cause: c.cause ?? "",
            prevention: c.prevention ?? "",
          }}
          initialPhotos={c.photos.map((p) => ({
            id: p.id,
            caption: p.caption ?? "",
            kind: isPhotoKind(p.kind) ? p.kind : "WORK",
            isVideo: p.isVideo,
            duration: p.duration ?? undefined,
            width: p.width ?? undefined,
            height: p.height ?? undefined,
          }))}
          properties={properties}
          blobEnabled={isBlobConfigured()}
          aiEnabled={isAnthropicConfigured()}
        />
        <p className="mt-3 text-center text-xs text-ink-muted">編集しても、もう一度通知はしません（共有した相手と確認状況はそのままです）。</p>
      </PageContainer>
    </div>
  );
}
