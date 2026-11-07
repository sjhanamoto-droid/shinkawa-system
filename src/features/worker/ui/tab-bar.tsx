"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, ClipboardList, House, Menu } from "lucide-react";

// スタッフ画面の下のタブ（ホーム・カレンダー・日報・現場・メニュー）。白地、選んでいるタブは緑
const TABS = [
  { href: "/w", label: "ホーム", icon: House, match: (p: string) => p === "/w" || p.startsWith("/w/visits") },
  { href: "/w/calendar", label: "カレンダー", icon: CalendarDays, match: (p: string) => p.startsWith("/w/calendar") },
  { href: "/w/reports", label: "日報", icon: ClipboardList, match: (p: string) => p.startsWith("/w/reports") || p.startsWith("/w/statement") },
  { href: "/w/sites", label: "現場", icon: Building2, match: (p: string) => p.startsWith("/w/sites") },
  { href: "/w/menu", label: "メニュー", icon: Menu, match: (p: string) => p.startsWith("/w/menu") || p.startsWith("/w/notifications") || p.startsWith("/w/catalog") || p.startsWith("/w/help") || p.startsWith("/w/account") },
];

export function WorkerTabBar({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();
  return (
    <>
      {/* タブの高さ分の余白 */}
      <div className="h-[calc(62px+env(safe-area-inset-bottom))]" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white w-safe-bottom">
        <ul className="grid h-[62px] grid-cols-5">
          {TABS.map((t) => {
            const active = t.match(pathname);
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-full flex-col items-center justify-center gap-1 ${active ? "text-[var(--w-primary)]" : "text-[var(--w-text-muted)]"}`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} aria-hidden />
                  <span className="text-[12px] leading-none">{t.label}</span>
                  {t.href === "/w/menu" && unreadCount > 0 && (
                    <span className="absolute right-[calc(50%-20px)] top-2 h-2.5 w-2.5 rounded-full bg-[var(--w-danger)]" aria-label={`未読 ${unreadCount} 件`} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
