import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus, Pencil } from "lucide-react";
import { requireCan, avatarUrlFor } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { Card, SectionTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SearchParamToast } from "@/components/ui/toast";
import { PartnerForm } from "@/features/partners/partner-form";
import { loadTradeOptions } from "@/features/partners/trades";

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCan("partner.manage");
  const { id } = await params;
  const partner = await db.partner.findUnique({
    where: { id },
    include: { workers: { orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, phone: true, tags: true, active: true, canLogin: true, avatarColor: true, avatarImage: true, updatedAt: true } } },
  });
  if (!partner) notFound();
  const tradeOptions = await loadTradeOptions();

  return (
    <div>
      <PageHeader title="協力会社を編集" subtitle={partner.name} backHref="/partners" />
      <PageContainer size="narrow">
        <SearchParamToast />
        <div className="space-y-6">
          <PartnerForm partner={partner} tradeOptions={tradeOptions} />
          <section className="space-y-2.5">
            <SectionTitle action={<Link href="/workers/new" className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand-600 hover:bg-brand-50"><UserPlus className="h-4 w-4" />作業者を追加</Link>}>
              所属する作業者 <span className="text-base font-semibold text-ink-muted tnum">{partner.workers.length}名</span>
            </SectionTitle>
            {partner.workers.length === 0 ? (
              <p className="card p-4 text-center text-sm text-ink-muted">作業者はまだ登録されていません。「作業者を追加」で区分を「協力会社」「下請」にし、所属会社にこの会社を選んでください。</p>
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {partner.workers.map((w) => (
                  <div key={w.id} className={`flex items-center gap-3 px-4 py-3 ${!w.active ? "opacity-60" : ""}`}>
                    <Avatar name={w.name} color={w.avatarColor} image={avatarUrlFor(w)} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-ink">{w.name}{!w.active && <Badge tone="danger">無効</Badge>}{!w.canLogin && <Badge tone="past">ログインなし</Badge>}</p>
                      <p className="truncate text-sm text-ink-muted">{[w.phone, ...w.tags].filter(Boolean).join(" ・ ")}</p>
                    </div>
                    <Link href={`/workers/${w.id}/edit`} className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" />編集</Link>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      </PageContainer>
    </div>
  );
}
