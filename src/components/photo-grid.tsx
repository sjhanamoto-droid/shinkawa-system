"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { photoSrc } from "@/lib/photos";
import { PhotoLightbox } from "./photo-lightbox";

/**
 * 表示用の写真メタデータ。base64（dataUrl/thumbUrl）は含めない。
 * ページ側は select: { id, caption, kind, isVideo, width, height } で取得し、
 * 実体は /api/photos/[id] から配信する（RSCペイロード削減）。
 */
export type PhotoData = {
  id: string;
  caption: string | null;
  kind: string;
  isVideo: boolean;
  width?: number | null;
  height?: number | null;
};

/**
 * 動画のタイル。サムネイル（先頭フレーム）があれば出し、無ければ再生アイコンにする。
 * サムネイルが無い動画に ?v=thumb を投げると API が 404 を返すので、本体を落とさずに済む。
 */
function VideoThumb({ photo }: { photo: PhotoData }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-full w-full items-center justify-center text-ink-muted">
        <Play className="h-8 w-8" />
      </span>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc(photo.id, true)}
        alt={photo.caption ?? ""}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Play className="h-7 w-7 text-white drop-shadow" />
      </span>
    </>
  );
}

export function PhotoGrid({ photos }: { photos: PhotoData[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setActiveIndex(i)}
            aria-label={p.caption || (p.isVideo ? "動画を再生" : "写真を拡大")}
            className="group relative aspect-square overflow-hidden rounded-xl bg-surface-sunken active:scale-95"
          >
            {p.isVideo ? (
              // 動画本体は一覧では読み込まない（タップでライトボックス再生）
              <VideoThumb photo={p} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc(p.id, true)}
                alt={p.caption ?? ""}
                loading="lazy"
                decoding="async"
                width={p.width ?? undefined}
                height={p.height ?? undefined}
                className="h-full w-full object-cover"
              />
            )}
            {p.kind === "COMPANY_STOCK" && (
              <span className="absolute left-1 top-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                弊社分
              </span>
            )}
            {p.caption && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-medium text-white">
                {p.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeIndex !== null && photos[activeIndex] && (
        <PhotoLightbox
          photos={photos}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </>
  );
}
