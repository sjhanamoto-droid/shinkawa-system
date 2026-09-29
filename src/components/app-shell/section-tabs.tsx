"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; badge?: number; match?: string[] };

/** ページ上部のタブ（メニューで1つにまとめた画面どうしを行き来する） */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar -mb-3 flex gap-1 overflow-x-auto" aria-label="切り替え">
      {tabs.map((t) => {
        const active = (t.match ?? [t.href]).some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-bold transition-colors",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:text-ink-soft",
            )}
          >
            {t.label}
            {t.badge && t.badge > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger px-1 text-[10px] font-bold text-white">
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
