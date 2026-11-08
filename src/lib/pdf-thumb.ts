// PDF の1ページ目を小さな画像（サムネイル）にする（ブラウザ側）。
// 一覧はこのサムネイルで見せ、PDF の本体は開いたときだけ取りに行く。
// 作れないとき（壊れたPDF・パスワード付きなど）は null（一覧は PDF のアイコンになる）。

const THUMB_MAX = 360;

export async function pdfThumbnail(file: File): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_MAX / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport }).promise;
      return canvas.toDataURL("image/jpeg", 0.7);
    } finally {
      void task.destroy();
    }
  } catch {
    return null;
  }
}
