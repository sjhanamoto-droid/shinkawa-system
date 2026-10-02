import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// 案件は現場に統合した。古いリンク用に、その作業の現場へ転送する。
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const job = await db.job.findUnique({ where: { id }, select: { propertyId: true } });
  if (!job) notFound();
  redirect(`/properties/${job.propertyId}`);
}
