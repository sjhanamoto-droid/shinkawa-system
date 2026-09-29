import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CatalogForm } from "@/features/catalog/catalog-form";
import { catalogGroups } from "@/features/catalog/queries";

export const dynamic = "force-dynamic";

export default async function NewCatalogLinkPage() {
  await requireCan("catalog.manage");
  const groups = await catalogGroups();
  // 新しいリンクは一番下に並ぶ並び順を入れておく
  const maxOrder = Math.max(0, ...groups.flatMap((g) => g.links.map((l) => l.sortOrder)));
  return (
    <div>
      <PageHeader title="リンクを追加" backHref="/catalog" />
      <PageContainer size="narrow">
        <CatalogForm initial={{ title: "", url: "", groupName: "", note: "", sortOrder: maxOrder + 10 }} groups={groups.map((g) => g.name)} />
      </PageContainer>
    </div>
  );
}
