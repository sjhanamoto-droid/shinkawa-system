import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { WorkerTabBar } from "./tab-bar";

// スタッフ画面の「タブの中の1ページ」の枠：緑のヘッダー（戻る・見出し）＋白い本文＋下のタブ
export async function WorkerSubPage({
  userId,
  title,
  backHref,
  subtitle,
  children,
  tabs = true,
}: {
  userId: string;
  title: string;
  backHref?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  tabs?: boolean;
}) {
  const unreadCount = tabs ? await db.notification.count({ where: { userId, read: false } }) : 0;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 pb-6 text-white w-safe-top">
        {backHref && (
          <Link href={backHref} className="-ml-2 mb-1 inline-flex h-11 items-center gap-0.5 pr-3 text-[16px] text-[var(--w-primary-soft)]">
            <ChevronLeft className="h-6 w-6" aria-hidden />
            戻る
          </Link>
        )}
        <h1 className="text-[28px] font-medium leading-[38px]">{title}</h1>
        {subtitle && <div className="mt-1 text-[16px] text-[var(--w-primary-soft)]">{subtitle}</div>}
      </header>
      <main className="flex-1 rounded-t-[20px] bg-white px-5 pb-8 pt-5 text-[var(--w-text)]">{children}</main>
      {tabs && <WorkerTabBar unreadCount={unreadCount} />}
    </div>
  );
}
