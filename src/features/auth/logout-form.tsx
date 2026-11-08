"use client";

import { useTransition, type ReactNode } from "react";
import { currentPushEndpoint, dropPushSubscription } from "@/features/notifications/push-endpoint";
import { logoutAction } from "./actions";

// ログアウトのフォーム。この端末で通知を受け取っていれば、その登録も消してからログアウトする
// （共有の端末に、ログアウトした人あての通知が届き続けないように。次にログインした人は通知をオンにし直す）。
// 通知まわりは最大1.5秒しか待たず、失敗してもログアウトは続ける。画面の準備ができる前に押されたときは、普通の送信でログアウトする。

export function LogoutForm({ className, children }: { className?: string; children: ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={logoutAction}
      className={className}
      aria-busy={pending}
      style={pending ? { opacity: 0.6, pointerEvents: "none" } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        start(async () => {
          const fd = new FormData();
          const endpoint = await currentPushEndpoint();
          if (endpoint) {
            fd.set("pushEndpoint", endpoint);
            dropPushSubscription();
          }
          try {
            await logoutAction(fd);
          } catch {
            window.location.href = "/login";
          }
        });
      }}
    >
      {children}
    </form>
  );
}
