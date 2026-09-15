import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PropertyForm } from "@/features/properties/property-form";

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireCan("property.manage");
  const { customerId } = await searchParams;
  const customers = await db.customer.findMany({ select: { id: true, name: true, shortName: true, kana: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] });
  return (
    <div>
      <PageHeader title="物件を登録" backHref="/properties" />
      <PageContainer size="narrow">
        <PropertyForm customers={customers} property={customerId ? { customerId } : undefined} />
      </PageContainer>
    </div>
  );
}
