import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { VehicleForm } from "@/features/vehicles/vehicle-form";

export default async function NewVehiclePage() {
  await requireCan("vehicle.manage");
  return (
    <div>
      <PageHeader title="車両を追加" backHref="/vehicles" />
      <PageContainer size="narrow">
        <VehicleForm />
      </PageContainer>
    </div>
  );
}
