"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { photoSrc } from "@/lib/photos";

// アプリの中で PDF を表示する（4MB を超える図面用。サーバーを通せないので、PDF の本体はブラウザが保存先から直接読む）。
// ページを順に描き、＋−で拡大・縮小する。

export function PdfViewer({ id, title }: { id: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [directUrl, setDirectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        setState("loading");
        const res = await fetch(`${photoSrc(id)}?url=1`);
        if (!res.ok) throw new Error("url");
        const { url } = (await res.json()) as { url: string | null };
        const src = url ?? photoSrc(id);
        if (!cancelled) setDirectUrl(src);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        // 部分読み込みは保存先が事前確認を受け付けないため使わない（全体を1回で読む）
        const task = pdfjs.getDocument({ url: src, disableRange: true, disableStream: true });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled) return;
        setPages(doc.numPages);
        const el = box.current;
        if (!el) return;
        el.innerHTML = "";
        const width = el.clientWidth * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;
          canvas.className = "mx-auto mb-3 block bg-white shadow";
          el.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (n === 1 && !cancelled) setState("ok");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [id, zoom]);

  return (
    <div className="min-h-dvh bg-slate-700">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-slate-900 px-3 py-2 text-white" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
        <button type="button" onClick={() => (history.length > 1 ? history.back() : window.close())} className="flex h-11 items-center gap-0.5 pr-2 text-[15px]">
          <ChevronLeft className="h-6 w-6" />
          戻る
        </button>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {title}
          {pages > 0 && <span className="ml-2 text-xs font-normal text-slate-300">{pages}ページ</span>}
        </p>
        <button type="button" aria-label="縮小" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
          <Minus className="h-5 w-5" />
        </button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="拡大" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))} className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
          <Plus className="h-5 w-5" />
        </button>
      </header>
      {state === "loading" && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-200">
          <Loader2 className="h-5 w-5 animate-spin" />
          図面を読み込んでいます...
        </p>
      )}
      {state === "error" && (
        <div className="px-6 py-10 text-center text-sm text-slate-100">
          <p>図面を表示できませんでした。</p>
          {directUrl && (
            <a href={directUrl} className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg bg-white px-4 font-semibold text-slate-900">
              <ExternalLink className="h-4 w-4" />
              ファイルを直接開く
            </a>
          )}
        </div>
      )}
      <div className="overflow-x-auto px-2 py-3">
        <div ref={box} />
      </div>
    </div>
  );
}
