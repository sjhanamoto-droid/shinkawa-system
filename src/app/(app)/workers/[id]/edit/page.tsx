import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { isOwner } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";

export default async function EditWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireCan("worker.manage");
  const { id } = await params;
  const [user, partners] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, kana: true, email: true, role: true, kind: true, department: true, partnerId: true,
        phone: true, canLogin: true, tags: true, avatarColor: true, avatarImage: true,
      },
    }),
    db.partner.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div>
      <PageHeader title="作業者を編集" subtitle={user.name} backHref="/workers" />
      <PageContainer size="narrow">
        <Card className="p-4 sm:p-5">
          <UserForm user={user} partners={partners} canAssignOwner={isOwner(me)} />
        </Card>
      </PageContainer>
    </div>
  );
}
