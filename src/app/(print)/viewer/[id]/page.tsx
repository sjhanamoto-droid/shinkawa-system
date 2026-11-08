import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PdfViewer } from "@/features/properties/pdf-viewer";

export const dynamic = "force-dynamic";

/** 大きな図面 PDF をアプリの中で表示する（見る権限は /api/photos で確かめる） */
export default async function PdfViewerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const p = await db.photo.findUnique({ where: { id }, select: { caption: true, mimeType: true, width: true, isVideo: true } });
  if (!p || p.isVideo) notFound();
  return <PdfViewer id={id} title={p.caption || "図面"} />;
}
