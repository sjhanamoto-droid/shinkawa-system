import "server-only";
import type { Prisma } from "@prisma/client";
import { JOB_STATUS_FOR_PROPERTY, isDepartment, type PropertyStatus } from "@/lib/constants";
import { catLabel } from "@/lib/categories";

/**
 * 現場に「作業」（部門・種別・契約の形）が1つも無ければ、予定の部門・種別から作る。
 * カレンダーから現場を登録して予定を入れたとき、現場一覧で「作業内容：未設定」のままにならないように
 * （一覧の「工事」「クリーニング」の振り分けは作業の部門で行う）。
 * 契約の形は、工事なら「工事」、クリーニングなら「スポット」（定期にするときは現場の編集から）。作ったら作業のID、作らなければ null。
 */
export async function ensureJobForProperty(
  tx: Prisma.TransactionClient,
  input: { propertyId: string | null | undefined; department: string; category: string; actorId: string },
): Promise<string | null> {
  if (!input.propertyId || input.category === "OFF" || !isDepartment(input.department)) return null;
  const existing = await tx.job.findFirst({ where: { propertyId: input.propertyId }, select: { id: true } });
  if (existing) return null;
  const property = await tx.property.findUnique({ where: { id: input.propertyId }, select: { customerId: true, status: true } });
  if (!property) return null;
  // 種別の名前は同じトランザクションの中で読む（別の接続を待って止まらないように）
  const cat = await tx.category.findUnique({ where: { key: input.category }, select: { label: true } });
  const job = await tx.job.create({
    data: {
      customerId: property.customerId,
      propertyId: input.propertyId,
      name: cat?.label ?? catLabel([], input.category),
      department: input.department,
      category: input.category,
      contractType: input.department === "CONSTRUCTION" ? "CONSTRUCTION" : "SPOT",
      status: JOB_STATUS_FOR_PROPERTY[property.status as PropertyStatus] ?? "ACTIVE",
      createdById: input.actorId,
    },
    select: { id: true },
  });
  return job.id;
}
