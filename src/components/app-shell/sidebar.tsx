"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChevronRight, Settings, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { sidebarNavForUser } from "./nav-items";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type ShellUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatarColor: string;
  avatarUrl: string | null;
  department: string | null;
  kind?: string;
};

// PC / タブレット用の固定サイドバー（md 以上で表示。スマホは BottomNav）
// collapsed = true のときはアイコンのみの最小表示。
export function Sidebar({
  user,
  collapsed,
  onToggle,
  unreadCount = 0,
}: {
  user: ShellUser;
  collapsed: boolean;
  onToggle: () => void;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const items = sidebarNavForUser(user);

  const railLink = (href: string, label: string, Icon: typeof Settings, active: boolean, badge?: number) => (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center rounded-xl text-sm font-semibold transition-colors",
        collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3 py-2.5",
        active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-surface-subtle",
      )}
    >
      <span className="relative shrink-0">
        <Icon className="h-5 w-5" strokeWidth={2} />
        {badge && badge > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {!collapsed && label}
    </Link>
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-60 lg:w-64",
      )}
    >
      {/* ブランド ＋ 開閉トグル */}
      <div
        className={cn(
          "flex h-16 shrink-0 border-b border-line",
          collapsed ? "flex-col items-center justify-center gap-1" : "items-center gap-2.5 px-4",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line",
            collapsed ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Image src="/shinkawa-logo.png" alt={APP_NAME} width={36} height={36} className="h-full w-full object-cover" />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-lg font-black tracking-tight text-ink">{APP_NAME}</p>
            <p className="text-[10px] font-medium text-ink-faint">スケジュール</p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          title={collapsed ? "メニューを開く" : "メニューを閉じる"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink-soft",
            collapsed ? "h-6 w-6" : "h-8 w-8",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {/* ナビ */}
      <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        <ul className="space-y-1">
          {items.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-sm font-semibold transition-colors",
                    collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3 py-2.5",
                    active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-surface-subtle",
                  )}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                    {item.href === "/notifications" && unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </span>
                  {!collapsed && item.label}
                  {!collapsed && active && <ChevronRight className="ml-auto h-4 w-4 text-brand-400" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("space-y-1 border-t border-line py-2", collapsed ? "px-2" : "px-3")}>
        {/* 使い方は設定の中（通知はメニューの「通知」） */}
        {railLink("/settings", "設定", Settings, ["/settings", "/help"].some((p) => pathname.startsWith(p)))}
      </div>

    </aside>
  );
}
