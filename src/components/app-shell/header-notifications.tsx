"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { listNotifications, markAllRead, markRead, type NotificationItem } from "@/features/notifications/actions";
import { notificationMeta } from "@/features/notifications/notification-meta";
import { IconBadge } from "@/components/ui/icon-badge";
import { useToast } from "@/components/ui/toast";
import { relativeTime, cn } from "@/lib/utils";
import { useShellUser } from "./shell-user";

const PREVIEW_LIMIT = 8;

/** ヘッダー右上の通知ベル。未読数のバッジ、押すと最近の通知（既読化・すべて既読・一覧へ） */
export function HeaderNotifications() {
  const ctx = useShellUser();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ctx) return null;
  // 開いている間は手元の一覧、閉じているときはサーバーの未読数
  const unread = open && items ? items.filter((n) => !n.read).length : ctx.unreadCount;

  function toggle() {
    const next = !open;
    setOpen(next);
    // 開くたびに最新を取り直す
    if (next) {
      startTransition(async () => {
        try {
          setItems(await listNotifications());
        } catch {
          toast("通知を読み込めませんでした", { type: "error" });
        }
      });
    }
  }

  function openItem(n: NotificationItem) {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
      startTransition(async () => {
        const res = await markRead(n.id);
        if (res?.error) toast(res.error, { type: "error" });
        router.refresh();
      });
    }
    router.push(n.href ?? "/notifications");
  }

  function readAll() {
    const snapshot = items;
    setItems((prev) => prev?.map((x) => ({ ...x, read: true })) ?? prev);
    startTransition(async () => {
      const res = await markAllRead();
      if (res?.error) {
        setItems(snapshot);
        toast(res.error, { type: "error" });
        return;
      }
      router.refresh();
    });
  }

  const shown = items?.slice(0, PREVIEW_LIMIT) ?? [];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `通知（未読 ${unread} 件）` : "通知"}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-surface-sunken"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tnum">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-float">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-bold text-ink">通知</p>
            <button
              type="button"
              onClick={readAll}
              disabled={unread === 0 || pending}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-brand-600 hover:bg-brand-50 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              すべて既読
            </button>
          </div>
          <div className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {items === null ? (
              <p className="p-4 text-center text-xs text-ink-muted">読み込み中…</p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-center text-xs text-ink-muted">通知はありません</p>
            ) : (
              shown.map((n) => {
                const meta = notificationMeta(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="menuitem"
                    onClick={() => openItem(n)}
                    className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-subtle", !n.read && "bg-brand-50/50 dark:bg-brand-950/20")}
                  >
                    <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm text-ink", !n.read ? "font-bold" : "font-semibold")}>{n.title}</span>
                        {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="未読" />}
                      </span>
                      {n.body && <span className="block truncate text-xs text-ink-muted">{n.body}</span>}
                      <span className="block text-[11px] text-ink-faint">{relativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1 border-t border-line px-3 py-2.5 text-xs font-bold text-brand-600 hover:bg-surface-subtle">
            すべての通知を見る
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
