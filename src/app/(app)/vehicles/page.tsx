import Link from "next/link";
import { Plus, Pencil, Car, CalendarDays } from "lucide-react";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { dateFromKey, jstDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SearchParamToast } from "@/components/ui/toast";
import { VehicleRowActions } from "@/features/vehicles/vehicle-row-actions";
import { DEPARTMENT_LABEL, isDepartment } from "@/lib/constants";

export default async function VehiclesPage() {
  await requireCan("vehicle.manage");
  const todayKey = jstDateKey();
  const today = dateFromKey(todayKey);
  const [vehicles, todayUse] = await Promise.all([
    db.vehicle.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { occurrences: true, jobs: true } } },
    }),
    // 今日使う予定（中止以外）を車両ごとに数える
    db.occurrenceVehicle.findMany({
      where: {
        occurrence: {
          status: { not: "CANCELLED" },
          OR: [{ date: today }, { date: { lte: today }, endDate: { gte: today } }],
        },
      },
      select: { vehicleId: true },
    }),
  ]);
  const todayCount = new Map<string, number>();
  for (const u of todayUse) todayCount.set(u.vehicleId, (todayCount.get(u.vehicleId) ?? 0) + 1);
  const active = vehicles.filter((v) => v.active);
  const inactive = vehicles.filter((v) => !v.active);

  const row = (v: (typeof vehicles)[number]) => {
    const n = todayCount.get(v.id) ?? 0;
    return (
      <div key={v.id} className={`card flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap ${!v.active ? "opacity-60" : ""}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: v.color }}>
          <Car className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-ink">{v.name}</span>
            {v.vehicleType && <span className="text-xs text-ink-muted">{v.vehicleType}</span>}
            {isDepartment(v.department) && <Badge tone="info">{DEPARTMENT_LABEL[v.department]}</Badge>}
            {!v.active && <Badge tone="danger">無効</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
            {v.plateNumber && <span className="tnum">{v.plateNumber}</span>}
            {v.active && (
              <Link href={`/schedule?view=day&d=${todayKey}`} className={`flex items-center gap-1 ${n > 0 ? "font-semibold text-brand-600" : ""}`}>
                <CalendarDays className="h-3 w-3" />
                今日 {n > 0 ? `${n}件で使用` : "空き"}
              </Link>
            )}
            {v.memo && <span className="truncate">{v.memo}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/vehicles/${v.id}/edit`} className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-600 hover:bg-brand-50"><Pencil className="h-3.5 w-3.5" />編集</Link>
          <VehicleRowActions id={v.id} active={v.active} canDelete={v._count.occurrences === 0 && v._count.jobs === 0} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="車両"
        subtitle="社有車の台帳。カレンダーで当日使う車両を選ぶときの選択肢になります"
        right={<LinkButton href="/vehicles/new" size="sm"><Plus className="h-4 w-4" />追加</LinkButton>}
      />
      <PageContainer>
        <SearchParamToast />
        {vehicles.length === 0 ? (
          <EmptyState icon={<Car className="h-6 w-6" />} title="車両が登録されていません" description="右上の「追加」から登録できます" />
        ) : (
          <div className="space-y-6">
            <section className="space-y-2.5">
              <h2 className="px-1 text-sm font-bold text-ink-soft">使用中 <span className="text-ink-faint">{active.length}台</span></h2>
              {active.length === 0 ? <p className="card p-4 text-center text-sm text-ink-muted">有効な車両がありません</p> : active.map(row)}
            </section>
            {inactive.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="px-1 text-sm font-bold text-ink-soft">無効 <span className="text-ink-faint">{inactive.length}台</span></h2>
                {inactive.map(row)}
              </section>
            )}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
