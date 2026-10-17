import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PartnerForm } from "@/features/partners/partner-form";
import { loadTradeOptions } from "@/features/partners/trades";

export default async function NewPartnerPage() {
  await requireCan("partner.manage");
  const tradeOptions = await loadTradeOptions();
  return (
    <div>
      <PageHeader title="協力会社を追加" backHref="/partners" />
      <PageContainer size="narrow">
        <PartnerForm tradeOptions={tradeOptions} />
      </PageContainer>
    </div>
  );
}
