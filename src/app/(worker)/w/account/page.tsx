import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AccountForm, PasswordForm } from "@/features/settings/account-form";
import { PushSubscribe } from "@/features/notifications/push-subscribe";
import { WorkerSubPage } from "@/features/worker/ui/sub-page";

export const dynamic = "force-dynamic";

export default async function WorkerAccount() {
  const me = await requireUser();
  const user = await db.user.findUnique({
    where: { id: me.id },
    select: { name: true, kana: true, email: true, phone: true, department: true, avatarColor: true },
  });
  if (!user) notFound();
  return (
    <WorkerSubPage userId={me.id} title="アカウント設定" backHref="/w/menu">
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-[18px] font-semibold">プロフィール</h2>
          <AccountForm user={user} />
        </section>
        <section>
          <h2 className="mb-3 text-[18px] font-semibold">パスワード変更</h2>
          <PasswordForm />
        </section>
        <section>
          <h2 className="mb-3 text-[18px] font-semibold">この端末の通知</h2>
          <PushSubscribe />
        </section>
      </div>
    </WorkerSubPage>
  );
}
