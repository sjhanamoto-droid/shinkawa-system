// 現場の写真・図面のファイルを、保存できる形にする（ブラウザ側）。
// 画像：圧縮（Blob があれば直接アップロード）＋サムネイル。
// PDF：原本は非公開の Blob（無ければデータベース、2.5MBまで）、一覧用に1ページ目のサムネイル。

import { prepareReceipt } from "@/features/reports/expense-editor";
import { uploadPdfToBlob } from "./upload-pdf";
import { pdfThumbnail } from "./pdf-thumb";

const MAX_DB_PDF_BYTES = 2.5 * 1024 * 1024;

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function prepareSiteFile(file: File, opts: { kind: string; blobEnabled: boolean; allowPdf: boolean }): Promise<Record<string, unknown>> {
  const { kind, blobEnabled } = opts;
  if (file.type === "application/pdf") {
    if (!opts.allowPdf) throw new Error("PDF は図面に追加してください");
    const caption = file.name.replace(/\.pdf$/i, "");
    const thumbUrl = (await pdfThumbnail(file)) ?? undefined;
    if (blobEnabled) return { ...(await uploadPdfToBlob(file)), thumbUrl, caption, kind };
    if (file.size > MAX_DB_PDF_BYTES) throw new Error(`${file.name}：PDF は2.5MBまでです`);
    return { dataUrl: await readDataUrl(file), thumbUrl, caption, kind };
  }
  if (file.type.startsWith("image/")) {
    const { receipt } = await prepareReceipt(file, blobEnabled);
    return { ...receipt, caption: "", kind };
  }
  throw new Error(`${file.name}：写真（画像）${opts.allowPdf ? "か PDF " : ""}を選んでください`);
}
