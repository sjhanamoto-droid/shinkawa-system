import Link from "next/link";
import {
  LogOut, Settings, ChevronRight, Bell, Building2, Briefcase, Users, Handshake, Car, Lightbulb, UserCog,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABEL, DEPARTMENT_LABEL, isDepartment, type Role } from "@/lib/constants";
import { logoutAction } from "@/features/auth/actions";

// スマホ用のメニュー。役割別のショートカット・通知・ログアウトを整理して表示する。
export default async function MenuPage() {
  const user = await requireUser();
  const unreadCount = await db.notification.count({ where: { userId: user.id, read: false } });

  const shortcuts: { href: string; label: string; icon: LucideIcon }[] = [
    ...(can(user, "customer.manage") ? [{ href: "/customers", label: "顧客", icon: Building2 }] : []),
    ...(can(user, "job.manage") ? [{ href: "/jobs", label: "案件（定期契約）", icon: Briefcase }] : []),
    ...(can(user, "worker.manage") ? [{ href: "/workers", label: "作業者（スタッフ・アルバイト）", icon: Users }] : []),
    ...(can(user, "partner.manage") ? [{ href: "/partners", label: "協力会社・下請", icon: Handshake }] : []),
    ...(can(user, "vehicle.manage") ? [{ href: "/vehicles", label: "車両", icon: Car }] : []),
    { href: "/settings/account", label: "アカウント設定", icon: UserCog },
    { href: "/help", label: "使い方・ヒント", icon: Lightbulb },
    { href: "/settings", label: "設定", icon: Settings },
  ];

  return (
    <div>
      <PageHeader title="メニュー" />
      <PageContainer size="narrow">
        <div className="space-y-5">
          <div className="card flex items-center gap-3.5 p-4">
            <Avatar name={user.name} color={user.avatarColor} image={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">{user.name}</p>
              {user.email && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
              <p className="mt-0.5 text-xs font-semibold text-brand-600">
                {ROLE_LABEL[user.role as Role] ?? user.role}
                {isDepartment(user.department) && ` ・ ${DEPARTMENT_LABEL[user.department]}`}
              </p>
            </div>
          </div>

          <div className="card divide-y divide-line overflow-hidden">
            <Link href="/notifications" className="tap-row flex items-center gap-3.5 p-4 active:bg-surface-sunken">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Bell className="h-5 w-5" />
              </span>
              <span className="flex-1 text-[15px] font-bold text-ink">通知</span>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
            </Link>
            {shortcuts.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="tap-row flex items-center gap-3.5 p-4 active:bg-surface-sunken">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-[15px] font-bold text-ink">{label}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
              </Link>
            ))}
          </div>

          <form action={logoutAction}>
            <button type="submit" className="card flex w-full items-center gap-3.5 p-4 text-status-danger active:bg-red-50">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-status-danger">
                <LogOut className="h-5 w-5" />
              </span>
              <span className="flex-1 text-left text-[15px] font-bold">ログアウト</span>
            </button>
          </form>
        </div>
      </PageContainer>
    </div>
  );
}
