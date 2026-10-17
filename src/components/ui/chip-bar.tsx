"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// 横スクロールするフィルタチップ群。スマホは指で、PC はマウスのホイール・ドラッグ・左右のボタンで動かせる
export function ChipBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    // 縦ホイールを横スクロールに変える（はみ出しているときだけ。passive: false でページの縦スクロールを止める）
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return; // 端ではページを動かす
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={update}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !ref.current) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) d.moved = true;
          if (d.moved) ref.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => {
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        // リンクの画像ドラッグ（ブラウザ標準）を止めて、横ドラッグでスクロールさせる
        onDragStart={(e) => e.preventDefault()}
        // ドラッグで動かしたときは、チップのリンクを押したことにしない
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5"
      >
        {children}
      </div>
      {edge.left && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="左へ"
          className="absolute -left-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft shadow-card hover:bg-surface-subtle md:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {edge.right && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="右へ"
          className={cn(
            "absolute -right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-soft shadow-card hover:bg-surface-subtle md:flex",
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
