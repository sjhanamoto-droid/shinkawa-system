import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PartnerForm } from "@/features/partners/partner-form";

export default async function NewPartnerPage() {
  await requireCan("partner.manage");
  return (
    <div>
      <PageHeader title="協力会社を追加" backHref="/partners" />
      <PageContainer size="narrow">
        <PartnerForm />
      </PageContainer>
    </div>
  );
}
