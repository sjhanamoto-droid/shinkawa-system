import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CsvImport } from "@/features/customers/csv-import";

export default async function CustomerImportPage() {
  await requireCan("customer.import");
  return (
    <div>
      <PageHeader title="顧客のCSV取込" subtitle="サイボウズ アドレス帳からの移行" backHref="/customers" />
      <PageContainer size="narrow">
        <CsvImport />
      </PageContainer>
    </div>
  );
}
