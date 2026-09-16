import { requireCan } from "@/lib/session";
import { canViewAmounts } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstMonthKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { JobForm } from "@/features/jobs/job-form";

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ propertyId?: string; customerId?: string }> }) {
  const user = await requireCan("job.manage");
  const { propertyId, customerId } = await searchParams;
  const [properties, vehicles] = await Promise.all([
    db.property.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, customerId: true, customer: { select: { shortName: true, name: true } } },
      orderBy: [{ customer: { kana: "asc" } }, { name: "asc" }],
    }),
    db.vehicle.findMany({ select: { id: true, name: true, vehicleType: true, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <div>
      <PageHeader title="案件を登録" backHref="/jobs" />
      <PageContainer size="narrow">
        <JobForm
          job={{ propertyId: propertyId ?? null, customerId: customerId ?? null, department: user.department ?? "CLEANING" }}
          properties={properties.map((p) => ({ id: p.id, name: p.name, customerId: p.customerId, customerName: p.customer.shortName ?? p.customer.name }))}
          vehicles={vehicles}
          showAmount={canViewAmounts(user)}
          currentMonth={jstMonthKey()}
        />
      </PageContainer>
    </div>
  );
}
