import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PropertyForm, type PropertyFormValues } from "@/features/properties/property-form";

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ customerId?: string; copyFrom?: string }> }) {
  const user = await requireCan("property.manage");
  const { customerId, copyFrom } = await searchParams;
  const [customers, source] = await Promise.all([
    db.customer.findMany({ select: { id: true, name: true, shortName: true, kana: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
    copyFrom ? db.property.findUnique({ where: { id: copyFrom } }) : null,
  ]);

  // 「この現場をコピーして別の作業を登録」：住所・キーBOX・入館メモなどを引き継ぐ（写真は引き継がない）
  let initial: PropertyFormValues | undefined = customerId ? { customerId } : undefined;
  if (source) {
    const { id: _id, status: _status, createdById: _c, createdAt: _ca, updatedAt: _u, ...rest } = source;
    void _id; void _status; void _c; void _ca; void _u;
    initial = rest;
  }

  return (
    <div>
      <PageHeader title="現場を登録" backHref={source ? `/properties/${source.id}` : "/properties"} />
      <PageContainer size="narrow">
        <PropertyForm
          customers={customers}
          property={initial}
          work={user.department ? { department: user.department } : null}
          copiedFrom={source?.name}
        />
      </PageContainer>
    </div>
  );
}
