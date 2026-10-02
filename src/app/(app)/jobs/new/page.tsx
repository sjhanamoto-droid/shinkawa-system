import { redirect } from "next/navigation";

// 案件は現場に統合した。作業内容は現場の登録・編集画面で設定する。
export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; customerId?: string }> }) {
  const { propertyId, customerId } = await searchParams;
  if (propertyId) redirect(`/properties/${encodeURIComponent(propertyId)}/edit`);
  redirect(customerId ? `/properties/new?customerId=${encodeURIComponent(customerId)}` : "/properties/new");
}
