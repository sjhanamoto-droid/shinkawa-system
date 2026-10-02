import { requireCan } from "@/lib/session";
import { getCategories } from "@/lib/categories-server";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { CategoryManager } from "@/features/settings/category-manager";

export default async function CategoriesSettingsPage() {
  await requireCan("settings.manage");
  const categories = await getCategories();
  return (
    <div>
      <PageHeader title="種別マスタ" subtitle="カレンダーのタグ（AC・定期など）の名称・略称・色・並び順" backHref="/settings" />
      <PageContainer size="narrow">
        <p className="mb-3 text-xs leading-relaxed text-ink-muted">
          変えた名称と色は、カレンダー・現場・日報などすべての画面にすぐ反映されます。並び順は、予定や現場の登録で選ぶときの順番です。
          使わなくなった種別は削除せず「使わない」にしてください（過去の予定の表示はそのまま残ります）。
        </p>
        <CategoryManager categories={categories} />
      </PageContainer>
    </div>
  );
}
