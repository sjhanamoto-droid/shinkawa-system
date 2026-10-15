import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `オフライン | ${APP_NAME}` };

/**
 * オフラインフォールバックページ。
 * Service Worker（public/sw.js）がナビゲーション失敗時にキャッシュ済みのこのページを返す。
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4">
      <div className="card flex w-full max-w-sm flex-col items-center px-5 py-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-sunken">
          <WifiOff className="h-7 w-7 text-ink-muted" />
        </div>
        <h1 className="text-xl font-bold text-ink">オフラインです</h1>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-ink-soft">電波の良い場所で再読み込みしてください。</p>
      </div>
    </div>
  );
}
