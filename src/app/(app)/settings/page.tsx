import Link from "next/link";
import { Users2, Building2, UserCog, ChevronRight, Info, Bell, Handshake, Car, Lightbulb, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/brand";

function SettingRow({ href, icon, title, desc, badge = 0 }: { href: string; icon: React.ReactNode; title: string; desc: string; badge?: number }) {
  return (
    <Link href={href} className="card tap-row flex items-center gap-3.5 p-4 transition-all hover:border-line-strong hover:shadow-float">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink">{title}</p>
        <p className="truncate text-xs text-ink-muted">{desc}</p>
      </div>
      {badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1.5 text-[11px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
    </Link>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const manager = can(user, "worker.manage");
  const unreadCount = await db.notification.count({ where: { userId: user.id, read: false } });
  const [workerCount, vehicleCount] = manager
    ? await Promise.all([db.user.count({ where: { active: true } }), db.vehicle.count({ where: { active: true } })])
    : [0, 0];

  return (
    <div>
      <PageHeader title="設定" />
      <PageContainer size="narrow">
        <div className="space-y-6">
          {manager && (
            <section className="space-y-2.5">
              <SectionTitle>管理メニュー</SectionTitle>
              <div className="space-y-2.5">
                <SettingRow
                  href="/workers"
                  icon={<Users2 className="h-5 w-5" />}
                  title="作業者管理"
                  desc={`スタッフ・アルバイト・協力会社スタッフの追加・権限（${workerCount}名）`}
                />
                <SettingRow
                  href="/partners"
                  icon={<Handshake className="h-5 w-5" />}
                  title="協力会社・下請"
                  desc="会社マスターと所属作業者"
                />
                <SettingRow
                  href="/vehicles"
                  icon={<Car className="h-5 w-5" />}
                  title="車両管理"
                  desc={`カレンダーで選ぶ社有車の台帳（${vehicleCount}台）`}
                />
                <SettingRow
                  href="/settings/app"
                  icon={<Building2 className="h-5 w-5" />}
                  title="アプリ設定・会社情報"
                  desc="会社情報・予定の既定時刻・翌月分の生成日"
                />
              </div>
            </section>
          )}

          <section className="space-y-2.5">
            <SectionTitle>アカウント</SectionTitle>
            <SettingRow
              href="/settings/account"
              icon={<UserCog className="h-5 w-5" />}
              title="アカウント設定"
              desc="氏名・アバター・パスワードの変更"
            />
          </section>

          <section className="space-y-2.5">
            <SectionTitle>通知</SectionTitle>
            <SettingRow
              href="/notifications"
              icon={<Bell className="h-5 w-5" />}
              title="通知センター"
              desc={unreadCount > 0 ? `未読 ${unreadCount} 件・予定の移動・確定などのお知らせ` : "予定の移動・確定などのお知らせを確認"}
              badge={unreadCount}
            />
            <SettingRow
              href="/announcements"
              icon={<Megaphone className="h-5 w-5" />}
              title="全体連絡"
              desc={can(user, "announcement.send") ? "役割ごと・全員に一括で連絡を送る・送った連絡の既読" : "会社からのお知らせ・行事・クレームの共有"}
            />
          </section>

          <section className="space-y-2.5">
            <SectionTitle>使い方</SectionTitle>
            <SettingRow href="/help" icon={<Lightbulb className="h-5 w-5" />} title="使い方・ヒント" desc="画面ごとの操作のコツ" />
          </section>

          <section className="space-y-2.5">
            <SectionTitle>このアプリについて</SectionTitle>
            <div className="card flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                <Info className="h-5 w-5" />
              </span>
              <div className="text-sm">
                <p className="font-bold text-ink">{APP_NAME} スケジュール</p>
                <p className="text-xs text-ink-muted">清掃・工事の予定管理 ・ バージョン 0.1</p>
              </div>
            </div>
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
