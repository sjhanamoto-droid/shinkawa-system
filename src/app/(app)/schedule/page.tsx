import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { jstDateKey } from "@/lib/date";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { parseFilters } from "@/features/schedule/filters";
import { loadSchedule } from "@/features/schedule/query";
import { ScheduleShell } from "@/features/schedule/schedule-shell";

export const metadata: Metadata = { title: "カレンダー" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp, { today: jstDateKey(), defaultMine: user.role === "STAFF" });
  const data = await loadSchedule(filters, user);

  return (
    <div>
      <PageHeader title="カレンダー" subtitle="白板とサイボウズの代わりに、ここで予定を組む" fluid />
      <PageContainer size="full">
        <ScheduleShell data={data} />
      </PageContainer>
    </div>
  );
}
