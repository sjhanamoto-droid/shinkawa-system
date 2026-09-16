import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SearchParamToast } from "@/components/ui/toast";
import { VehicleForm } from "@/features/vehicles/vehicle-form";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("vehicle.manage");
  const { id } = await params;
  const vehicle = await db.vehicle.findUnique({
    where: { id },
    include: { _count: { select: { occurrences: true, jobs: true } } },
  });
  if (!vehicle) notFound();

  return (
    <div>
      <PageHeader title="車両を編集" subtitle={vehicle.name} backHref="/vehicles" />
      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-4">
          <VehicleForm vehicle={vehicle} />
          <p className="px-1 text-xs text-ink-muted">
            この車両を使う予定 {vehicle._count.occurrences} 件 ・ 既定にしている案件 {vehicle._count.jobs} 件
          </p>
        </div>
      </PageContainer>
    </div>
  );
}
