import { requireCan } from "@/lib/session";
import { isBlobConfigured } from "@/lib/media";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { ClaimForm } from "@/features/claims/claim-form";
import { audienceRoleCounts, claimPropertyOptions, claimWorkerOptions } from "@/features/claims/queries";

export const dynamic = "force-dynamic";

export default async function NewClaimPage({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const me = await requireCan("claim.manage");
  const { propertyId } = await searchParams;
  const [properties, roleCounts, workers] = await Promise.all([claimPropertyOptions(), audienceRoleCounts(me.id), claimWorkerOptions()]);
  return (
    <div>
      <PageHeader title="クレームを登録・共有" backHref="/claims" />
      <PageContainer size="narrow">
        <ClaimForm
          initial={{ title: "", propertyId: properties.some((p) => p.value === propertyId) ? propertyId! : "", occurredOn: "", content: "", cause: "", prevention: "", siteContact: "", involvedUserIds: [], involvedOthers: "" }}
          properties={properties}
          workers={workers}
          roleCounts={roleCounts}
          blobEnabled={isBlobConfigured()}
          aiEnabled={isAnthropicConfigured()}
        />
      </PageContainer>
    </div>
  );
}
