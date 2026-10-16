import "server-only";
import { db } from "@/lib/db";
import type { CustomerChoice } from "./property-form";

// 現場の顧客の選択肢。特定の顧客に紐付かない現場（個人客・単発など）用に「その他」を先頭に出す。
// 「その他」は顧客マスタの1件として持つ（無ければここで作る）。
export const OTHER_CUSTOMER_NAME = "その他";

export async function loadCustomerChoices(): Promise<CustomerChoice[]> {
  const customers = await db.customer.findMany({ select: { id: true, name: true, kana: true }, orderBy: [{ kana: "asc" }, { name: "asc" }] });
  let other = customers.find((c) => c.name === OTHER_CUSTOMER_NAME);
  if (!other) {
    other = await db.customer.create({ data: { name: OTHER_CUSTOMER_NAME, kana: "そのた" }, select: { id: true, name: true, kana: true } });
  }
  return [other, ...customers.filter((c) => c.id !== other.id)];
}
