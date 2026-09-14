import { requireCan } from "@/lib/session";
import { isOwner } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card } from "@/components/ui/card";
import { UserForm } from "@/features/users/user-form";

export default async function NewWorkerPage() {
  const me = await requireCan("worker.manage");
  const partners = await db.partner.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="作業者を追加" backHref="/workers" />
      <PageContainer size="narrow">
        <Card className="p-4 sm:p-5">
          <UserForm partners={partners} canAssignOwner={isOwner(me)} />
        </Card>
      </PageContainer>
    </div>
  );
}
