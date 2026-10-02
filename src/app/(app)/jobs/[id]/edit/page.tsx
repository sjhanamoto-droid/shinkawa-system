import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 案件は現場に統合した。作業内容は現場の編集画面で変更する。
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id }, select: { propertyId: true } });
  if (!job) notFound();
  redirect(`/properties/${job.propertyId}/edit`);
}
