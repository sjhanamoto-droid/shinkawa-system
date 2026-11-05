"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PHOTO_KIND_LABEL, type PhotoKind } from "@/lib/constants";
import { photoSrc } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { PhotoData } from "./photo-grid";

const MAX_SCALE = 5;
const SWIPE_THRESHOLD = 60;

type View = { s: number; x: number; y: number };
type Point = { x: number; y: number };
const RESET: View = { s: 1, x: 0, y: 0 };

/**
 * 写真・動画のライトボックス。
 * 左右のボタン・スワイプ・矢印キーで前後の写真へ、拡大縮小はボタン・ピンチ・ダブルタップ・ホイール。
 * 拡大中はドラッグで写真の中を動かせる（アプリ全体はピンチズーム無効なので自前で実装）。
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: PhotoData[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const active = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const [view, setView] = useState<View>(RESET);
  const [swipeDx, setSwipeDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  // 端末が形式に対応していないと再生できない（iPhoneのHEVC動画をAndroidで開いた場合など）
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { kind: "swipe" | "pan"; start: Point; t0: Point; moved: boolean; onBackdrop: boolean }
    | { kind: "pinch"; d0: number; mid0: Point; v0: View }
    | null
  >(null);
  const lastTap = useRef(0);

  // 写真が切り替わったら拡大をリセット
  useEffect(() => {
    setView(RESET);
    setSwipeDx(0);
    setPlaybackFailed(false);
  }, [index]);

  // 前後の写真を先読みしておく
  useEffect(() => {
    for (const p of [photos[index - 1], photos[index + 1]]) {
      if (p && !p.isVideo) new Image().src = photoSrc(p.id);
    }
  }, [photos, index]);

  // 表示中は背面のページをスクロールさせない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const clampView = useCallback((v: View): View => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (v.s <= 1.01 || !stage || !img) return RESET;
    const maxX = Math.max(0, (img.offsetWidth * v.s - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * v.s - stage.clientHeight) / 2);
    return { s: v.s, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }, []);

  /** p（ステージ中央からの位置）を中心に拡大率を変える */
  const zoomAround = useCallback(
    (v: View, nextScale: number, p: Point = { x: 0, y: 0 }): View => {
      const s = Math.min(MAX_SCALE, Math.max(1, nextScale));
      return clampView({ s, x: p.x - (p.x - v.x) * (s / v.s), y: p.y - (p.y - v.y) * (s / v.s) });
    },
    [clampView],
  );

  const zoomBy = useCallback((factor: number) => setView((v) => zoomAround(v, v.s * factor)), [zoomAround]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < photos.length) onIndexChange(next);
    },
    [index, photos.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") zoomBy(1.5);
      else if (e.key === "-") zoomBy(1 / 1.5);
      else if (e.key === "0") setView(RESET);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go, zoomBy]);

  function fromCenter(clientX: number, clientY: number): Point {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  }

  // ホイール（トラックパッドのピンチ含む）で拡大縮小。preventDefault するため passive: false で登録
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || active?.isVideo) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = fromCenter(e.clientX, e.clientY);
      setView((v) => zoomAround(v, v.s * Math.exp(-e.deltaY * 0.002), p));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [active?.isVideo, zoomAround]);

  function startPinch() {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      kind: "pinch",
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid0: fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2),
      v0: view,
    };
    setSwipeDx(0);
  }

  function startSingle(p: Point, onBackdrop: boolean) {
    gesture.current = {
      kind: view.s > 1 ? "pan" : "swipe",
      start: p,
      t0: { x: view.x, y: view.y },
      moved: false,
      onBackdrop,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (active.isVideo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    if (pointers.current.size === 2) startPinch();
    else if (pointers.current.size === 1) startSingle({ x: e.clientX, y: e.clientY }, e.target === e.currentTarget);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const s = Math.min(MAX_SCALE, Math.max(1, (g.v0.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      const mid = fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      setView(
        clampView({
          s,
          x: mid.x - (g.mid0.x - g.v0.x) * (s / g.v0.s),
          y: mid.y - (g.mid0.y - g.v0.y) * (s / g.v0.s),
        }),
      );
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (g.kind === "pan") setView((v) => clampView({ s: v.s, x: g.t0.x + dx, y: g.t0.y + dy }));
    else if (photos.length > 1 && Math.abs(dx) > Math.abs(dy)) {
      // 端の写真ではそれ以上めくれないことが分かるよう抵抗をつける
      setSwipeDx((dx > 0 && !hasPrev) || (dx < 0 && !hasNext) ? dx / 4 : dx);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;

    if (g?.kind === "pinch") {
      // 指が1本残ったら、そのまま移動に切り替える
      const rest = [...pointers.current.values()][0];
      if (rest) startSingle(rest, false);
      else {
        gesture.current = null;
        setDragging(false);
      }
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    setDragging(false);
    if (!g) return;

    if (g.kind === "swipe") {
      const dx = e.clientX - g.start.x;
      setSwipeDx(0);
      if (dx <= -SWIPE_THRESHOLD && hasNext) return go(1);
      if (dx >= SWIPE_THRESHOLD && hasPrev) return go(-1);
    }
    if (g.moved) return;

    // タップ：ダブルタップで拡大/元に戻す、写真の外を1回タップで閉じる
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      const p = fromCenter(e.clientX, e.clientY);
      setView((v) => (v.s > 1 ? RESET : zoomAround(v, 2.5, p)));
      return;
    }
    lastTap.current = now;
    if (g.onBackdrop && view.s === 1) onClose();
  }

  const navButton = "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25";
  const toolButton = "flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={active.caption || (active.isVideo ? "動画" : "写真")}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 animate-fade-in"
    >
      {/* 上部：枚数・拡大縮小・閉じる */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3 safe-top">
        <span className="min-w-0 flex-1 text-sm font-medium tabular-nums text-white/80">
          {photos.length > 1 && `${index + 1} / ${photos.length}`}
        </span>
        {!active.isVideo && (
          <>
            <button onClick={() => zoomBy(1 / 1.5)} disabled={view.s <= 1} className={toolButton} aria-label="縮小">
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              onClick={() => setView(RESET)}
              disabled={view.s <= 1}
              className="h-10 min-w-14 rounded-full bg-white/15 px-2 text-[13px] font-bold tabular-nums text-white hover:bg-white/25 disabled:opacity-40"
              aria-label="元の大きさに戻す"
            >
              {Math.round(view.s * 100)}%
            </button>
            <button onClick={() => zoomBy(1.5)} disabled={view.s >= MAX_SCALE} className={toolButton} aria-label="拡大">
              <ZoomIn className="h-5 w-5" />
            </button>
          </>
        )}
        <button onClick={onClose} className={cn(toolButton, "ml-1")} aria-label="閉じる">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* 写真 */}
      <div
        ref={stageRef}
        className={cn(
          "relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden px-2",
          !active.isVideo && "touch-none",
          view.s > 1 && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          // 動画のときは写真の外のタップで閉じる（写真はポインター操作側で処理）
          if (active.isVideo && e.target === e.currentTarget) onClose();
        }}
      >
        {active.isVideo ? (
          playbackFailed ? (
            <div className="max-w-sm rounded-xl bg-white p-5 text-center text-sm">
              <p className="font-bold text-ink">この端末では再生できませんでした</p>
              <p className="mt-1.5 text-[12px] text-ink-muted">
                iPhoneの「高効率」設定で撮った動画は、Androidやパソコンで再生できないことがあります。
              </p>
              <a
                href={photoSrc(active.id)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex rounded-lg bg-brand-500 px-4 py-2 font-bold text-white"
              >
                ダウンロードして開く
              </a>
            </div>
          ) : (
            <video
              key={active.id}
              src={photoSrc(active.id)}
              controls
              playsInline
              preload="metadata"
              onError={() => setPlaybackFailed(true)}
              className="max-h-full max-w-full rounded-xl"
            />
          )
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active.id}
            ref={imgRef}
            src={photoSrc(active.id)}
            alt={active.caption ?? ""}
            decoding="async"
            draggable={false}
            className={cn(
              "max-h-full max-w-full rounded-xl object-contain will-change-transform",
              !dragging && "transition-transform duration-200",
            )}
            style={{ transform: `translate(${view.x + swipeDx}px, ${view.y}px) scale(${view.s})` }}
          />
        )}

        {hasPrev && (
          <button
            onClick={() => go(-1)}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(navButton, "left-2 md:left-4")}
            aria-label="前の写真"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => go(1)}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(navButton, "right-2 md:right-4")}
            aria-label="次の写真"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* 下部：種別・キャプション */}
      <div className="flex shrink-0 items-center justify-center gap-2 px-4 pb-4 pt-2 text-center text-white safe-bottom">
        <Badge tone="neutral">{PHOTO_KIND_LABEL[active.kind as PhotoKind] ?? active.kind}</Badge>
        {active.caption && <span className="text-sm">{active.caption}</span>}
      </div>
    </div>
  );
}
