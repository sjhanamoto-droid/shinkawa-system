"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, DEPARTMENT_LABEL, isDepartment, type Role } from "@/lib/constants";
import { logoutAction } from "@/features/auth/actions";
import type { ShellUser } from "./sidebar";

const ShellUserContext = createContext<{ user: ShellUser; unreadCount: number } | null>(null);

export function ShellUserProvider({ user, unreadCount, children }: { user: ShellUser; unreadCount: number; children: React.ReactNode }) {
  return <ShellUserContext.Provider value={{ user, unreadCount }}>{children}</ShellUserContext.Provider>;
}

export function useShellUser() {
  return useContext(ShellUserContext);
}

/** ヘッダー右上のログイン中のユーザー（PC・タブレットのみ）。押すとアカウント設定・ログアウト */
export function HeaderUserMenu() {
  const ctx = useShellUser();
  const [open, setOpen] = useState(false);
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
  const { user } = ctx;
  const roleLabel = `${ROLE_LABEL[user.role as Role] ?? user.role}${isDepartment(user.department) ? ` ・ ${DEPARTMENT_LABEL[user.department]}` : ""}`;

  return (
    <div ref={ref} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-surface-sunken"
      >
        <Avatar name={user.name} color={user.avatarColor} image={user.avatarUrl} size="sm" />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[10rem] truncate text-sm font-bold text-ink">{user.name}</span>
          <span className="block max-w-[10rem] truncate text-[11px] text-ink-muted">{roleLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-ink-faint" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-float">
          <div className="border-b border-line px-3 py-2.5 lg:hidden">
            <p className="truncate text-sm font-bold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-ink-muted">{roleLabel}</p>
          </div>
          <Link href="/settings/account" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-subtle">
            <UserCog className="h-4 w-4" />
            アカウント設定
          </Link>
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-status-danger hover:bg-red-50">
              <LogOut className="h-4 w-4" />
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
