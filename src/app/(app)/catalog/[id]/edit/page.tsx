import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CatalogForm } from "@/features/catalog/catalog-form";
import { catalogGroups } from "@/features/catalog/queries";

export const dynamic = "force-dynamic";

export default async function EditCatalogLinkPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("catalog.manage");
  const { id } = await params;
  const [l, groups] = await Promise.all([db.catalogLink.findUnique({ where: { id } }), catalogGroups()]);
  if (!l) notFound();
  return (
    <div>
      <PageHeader title="リンクを編集" backHref="/catalog" />
      <PageContainer size="narrow">
        <CatalogForm
          initial={{ id: l.id, title: l.title, url: l.url, groupName: l.groupName, note: l.note ?? "", sortOrder: l.sortOrder }}
          groups={groups.map((g) => g.name)}
        />
      </PageContainer>
    </div>
  );
}
