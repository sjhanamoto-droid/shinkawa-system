import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PropertyForm } from "@/features/properties/property-form";
import { DeletePropertyButton } from "@/features/properties/delete-property-button";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("property.manage");
  const { id } = await params;
  const [property, customers] = await Promise.all([
    db.property.findUnique({
      where: { id },
      include: { photos: { where: { kind: { in: ["KEYBOX", "DRAWING", "SURVEY"] } }, select: { id: true, caption: true, isVideo: true, width: true, kind: true }, orderBy: { createdAt: "asc" } } },
    }),
    db.customer.findMany({ select: { id: true, name: true, shortName: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
  ]);
  if (!property) notFound();
  const pick = (kind: string) => property.photos.filter((p) => p.kind === kind).map(({ id, caption, isVideo, width }) => ({ id, caption, isVideo, width }));

  return (
    <div>
      <PageHeader title="物件を編集" subtitle={property.name} backHref={`/properties/${id}`} />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <PropertyForm customers={customers} property={property} photos={{ keybox: pick("KEYBOX"), drawing: pick("DRAWING"), survey: pick("SURVEY") }} />
          <DeletePropertyButton propertyId={id} propertyName={property.name} status={property.status} />
        </div>
      </PageContainer>
    </div>
  );
}
