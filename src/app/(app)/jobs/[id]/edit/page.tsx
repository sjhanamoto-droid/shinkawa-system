import { notFound, redirect } from "next/navigation";
import { requireCan } from "@/lib/session";
import { canViewAmounts, canEditDepartment } from "@/lib/permissions";
import { db } from "@/lib/db";
import { jstMonthKey, storedDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { JobForm } from "@/features/jobs/job-form";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("job.manage");
  const showAmount = canViewAmounts(user);
  const { id } = await params;
  const [job, properties, vehicles] = await Promise.all([
    db.job.findUnique({
      where: { id },
      select: {
        id: true, propertyId: true, customerId: true, name: true, department: true, category: true, contractType: true, ruleKind: true, ruleParams: true,
        unitCount: true, headcount: true, defaultStartTime: true, defaultEndTime: true, vehicleId: true, note: true, status: true, startsOn: true, endsOn: true,
        amount: showAmount,
      },
    }),
    db.property.findMany({
      select: { id: true, name: true, customerId: true, customer: { select: { shortName: true, name: true } } },
      orderBy: [{ customer: { kana: "asc" } }, { name: "asc" }],
    }),
    db.vehicle.findMany({ select: { id: true, name: true, vehicleType: true, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  if (!job) notFound();
  if (!canEditDepartment(user, job.department)) redirect(`/jobs/${id}`);

  return (
    <div>
      <PageHeader title="案件を編集" subtitle={job.name} backHref={`/jobs/${id}`} />
      <PageContainer size="narrow">
        <JobForm
          job={{
            ...job,
            amount: showAmount && "amount" in job ? (job.amount as number | null) : null,
            startsOn: job.startsOn ? storedDateKey(job.startsOn) : null,
            endsOn: job.endsOn ? storedDateKey(job.endsOn) : null,
          }}
          properties={properties.map((p) => ({ id: p.id, name: p.name, customerId: p.customerId, customerName: p.customer.shortName ?? p.customer.name }))}
          vehicles={vehicles}
          showAmount={showAmount}
          currentMonth={jstMonthKey()}
        />
      </PageContainer>
    </div>
  );
}
