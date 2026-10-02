import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { canEditDepartment, canViewAmounts } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { PropertyForm } from "@/features/properties/property-form";
import { DeletePropertyButton } from "@/features/properties/delete-property-button";
import { loadWorkForForm } from "@/features/properties/work";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("property.manage");
  const showAmount = canViewAmounts(user);
  const { id } = await params;
  const [property, customers, work, depts] = await Promise.all([
    db.property.findUnique({
      where: { id },
      include: { photos: { where: { kind: { in: ["KEYBOX", "DRAWING", "SURVEY"] } }, select: { id: true, caption: true, isVideo: true, width: true, kind: true }, orderBy: { createdAt: "asc" } } },
    }),
    db.customer.findMany({ select: { id: true, name: true, shortName: true, kana: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] }),
    loadWorkForForm(id, showAmount),
    db.job.findMany({ where: { propertyId: id }, select: { department: true }, distinct: ["department"] }),
  ]);
  // 他部門の作業が付いている現場は、作業内容とステータスを表示のみにする（保存処理と同じ判定）
  const workEditable = depts.every((j) => canEditDepartment(user, j.department));
  if (!property) notFound();
  const pick = (kind: string) => property.photos.filter((p) => p.kind === kind).map(({ id, caption, isVideo, width }) => ({ id, caption, isVideo, width }));

  return (
    <div>
      <PageHeader title="現場を編集" subtitle={property.name} backHref={`/properties/${id}`} />
      <PageContainer size="narrow">
        <div className="space-y-6">
          <PropertyForm
            customers={customers}
            property={property}
            work={work.work}
            workEditable={workEditable}
            workSummary={work.summary ?? undefined}
            photos={{ keybox: pick("KEYBOX"), drawing: pick("DRAWING"), survey: pick("SURVEY") }}
          />
          <DeletePropertyButton propertyId={id} propertyName={property.name} status={property.status} />
        </div>
      </PageContainer>
    </div>
  );
}
