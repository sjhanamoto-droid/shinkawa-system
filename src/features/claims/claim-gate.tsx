"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ClaimBody, type ClaimView } from "./claim-body";
import { acknowledgeClaim } from "./actions";

export type PendingClaim = ClaimView & { id: string; createdByName: string | null };

/**
 * クレーム再発防止の確認画面。未確認のクレームがあると全画面で最前面に出し、
 * 「内容を確認しました」を押すまで閉じられない（閉じるボタン・背景タップなし）。
 * 複数あれば古い順に1件ずつ確認する。
 */
export function ClaimGate({ claims }: { claims: PendingClaim[] }) {
  const router = useRouter();
  const toast = useToast();
  const [queue, setQueue] = useState(claims);
  const [pending, start] = useTransition();
  const current = queue[0];

  // サーバーから新しい未確認が届いたら追加する
  useEffect(() => {
    setQueue((prev) => {
      const ids = new Set(prev.map((c) => c.id));
      const added = claims.filter((c) => !ids.has(c.id));
      return added.length ? [...prev, ...added] : prev;
    });
  }, [claims]);

  // 表示中は背景のスクロールを止める
  useEffect(() => {
    if (!current) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [current]);

  if (!current) return null;

  function confirm() {
    start(async () => {
      const r = await acknowledgeClaim(current.id);
      if (r.error) {
        toast(r.error, { type: "error" });
        return;
      }
      setQueue((prev) => prev.filter((c) => c.id !== current.id));
      if (queue.length <= 1) router.refresh();
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="claim-gate-title" className="fixed inset-0 z-[100] flex flex-col bg-surface-subtle">
      <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p id="claim-gate-title" className="font-black text-red-700">
              クレーム再発防止の共有{queue.length > 1 && <span className="ml-1 text-sm font-bold">（あと{queue.length}件）</span>}
            </p>
            <p className="text-xs text-red-700/80">内容を読んで「確認しました」を押すと、アプリを使えるようになります</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">
        <div className="card mx-auto max-w-2xl p-4">
          <ClaimBody claim={current} />
          {current.createdByName && <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">共有：{current.createdByName}</p>}
        </div>
      </div>
      <div className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="mx-auto flex h-14 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-black text-white active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          内容を確認しました
        </button>
      </div>
    </div>
  );
}
