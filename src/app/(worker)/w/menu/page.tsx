import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Bell, BookOpen, ChevronRight, CircleHelp, Clock, LayoutDashboard, Monitor, UserRound } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { UI_COOKIE, canUseAdminUi, isPhoneUserAgent } from "@/lib/ui-mode";
import { logoutAction } from "@/features/auth/actions";
import { clearUiMode, setUiMode } from "@/features/worker/actions";
import { WorkerTabBar } from "@/features/worker/ui/tab-bar";

export const dynamic = "force-dynamic";

/** メニュー：お知らせ・自分の稼働時間・カタログ・使い方・アカウント設定・（権限者）管理画面・ログアウト */
export default async function WorkerMenu() {
  const me = await requireUser();
  const [unreadCount, store, h] = await Promise.all([db.notification.count({ where: { userId: me.id, read: false } }), cookies(), headers()]);
  const phone = isPhoneUserAgent(h.get("user-agent"));
  // PC でスタッフ画面を開いている（cookie で選んだ）ときは、通常の画面に戻れるようにする
  const forcedOnPc = !phone && store.get(UI_COOKIE)?.value === "worker";
  const items = [
    { href: "/w/notifications", label: "お知らせ", icon: Bell, badge: unreadCount > 0 ? `${unreadCount}件` : null },
    { href: "/w/statement", label: "自分の稼働時間", icon: Clock, badge: null },
    { href: "/w/catalog", label: "カタログ", icon: BookOpen, badge: null },
    { href: "/w/help", label: "使い方", icon: CircleHelp, badge: null },
    { href: "/w/account", label: "アカウント設定", icon: UserRound, badge: null },
  ];

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 text-white w-safe-top">
      <h1 className="text-[30px] font-medium leading-[42px]">メニュー</h1>
      <div className="mt-4 flex items-center gap-4">
        <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-white text-[26px] text-[var(--w-primary)]">{me.name.slice(0, 1)}</span>
        <div className="min-w-0">
          <p className="truncate text-[24px]">{me.name}</p>
          <p className="text-[16px] text-[var(--w-primary-soft)]">{me.role === "STAFF" ? "作業者" : (ROLE_LABEL[me.role as Role] ?? me.role)}</p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-[var(--w-divider)] overflow-hidden rounded-[18px] bg-white text-[var(--w-text)]">
        {items.map(({ href, label, icon: Icon, badge }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-[74px] items-center gap-4 px-5 active:bg-[var(--w-soft-bg)]">
              <Icon className="h-6 w-6 shrink-0 text-[var(--w-primary)]" aria-hidden />
              <span className="flex-1 text-[19px]">{label}</span>
              {badge && <span className="rounded-full bg-[var(--w-warning-bg)] px-3 py-1 text-[15px] text-[var(--w-warning-text)]">{badge}</span>}
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {canUseAdminUi(me.role) && (
        <form action={setUiMode.bind(null, "admin")} className="mt-4">
          <button type="submit" className="flex min-h-[64px] w-full items-center gap-4 rounded-[18px] bg-white/[.16] px-5 text-left">
            <LayoutDashboard className="h-6 w-6 shrink-0" aria-hidden />
            <span className="flex-1">
              <span className="block text-[18px]">管理画面を開く</span>
              <span className="block text-[14px] text-[var(--w-primary-soft)]">カレンダー・現場・日報の管理など</span>
            </span>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </form>
      )}
      {forcedOnPc && (
        <form action={clearUiMode} className="mt-3">
          <button type="submit" className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] bg-white/[.16] px-5 text-left text-[17px]">
            <Monitor className="h-5 w-5" aria-hidden />
            PC用の画面に戻る
          </button>
        </form>
      )}

      <form action={logoutAction} className="mt-4">
        <button type="submit" className="h-16 w-full rounded-[18px] border border-white/50 text-[18px]">
          ログアウト
        </button>
      </form>
      <WorkerTabBar unreadCount={unreadCount} />
    </div>
  );
}
