// 図面・資料の PDF を Vercel Blob へ直接アップロードする（ブラウザ側）。
// 関数を通さないので 4.5MB の上限に当たらない。上限は PDF_MAX_BYTES（20MB）。

import { formatMb, PDF_MAX_BYTES, PDF_MIME } from "./media-limits";

export type UploadedPdf = { blobPath: string; mimeType: string; sizeBytes: number };

export async function uploadPdfToBlob(file: File): Promise<UploadedPdf> {
  if (file.size > PDF_MAX_BYTES) throw new Error(`${file.name}：PDF は${formatMb(PDF_MAX_BYTES)}までです`);
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: PDF_MIME, sizeBytes: file.size }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `${file.name}：保存先を用意できませんでした`);
  }
  const { uploadUrl, blobPath } = (await res.json()) as { uploadUrl: string; blobPath: string };
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": PDF_MIME }, body: file });
  if (!put.ok) throw new Error(`${file.name}：アップロードできませんでした。電波の良い場所でもう一度お試しください`);
  return { blobPath, mimeType: PDF_MIME, sizeBytes: file.size };
}
