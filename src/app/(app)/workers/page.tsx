import Link from "next/link";
import { Pencil, UserPlus, Mail, Phone, Tag, Search } from "lucide-react";
import { requireCan } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/app-shell/page-header";
import { PeopleTabs } from "@/components/app-shell/section-tab-sets";
import { PageContainer } from "@/components/app-shell/page-container";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { StaffRowActions } from "@/features/users/staff-actions";
import { avatarUrlFor } from "@/lib/session";
import {
  ROLE_LABEL, WORKER_KIND_LABEL, WORKER_KIND_OPTIONS, DEPARTMENT_LABEL, isDepartment,
  type Role, type WorkerKind,
} from "@/lib/constants";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const me = await requireCan("worker.manage");
  const { q, tag } = await searchParams;

  const users = await db.user.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q } }, { kana: { contains: q } }, { email: { contains: q } }] } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    },
    select: {
      id: true, name: true, kana: true, email: true, phone: true, role: true, kind: true, department: true,
      tags: true, canLogin: true, active: true, avatarColor: true, avatarImage: true, updatedAt: true,
      partner: { select: { name: true } },
      _count: { select: { assignments: true, reports: true } },
    },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const allTags = Array.from(new Set(users.flatMap((u) => u.tags))).sort();
  const groups = WORKER_KIND_OPTIONS.map((k) => ({ kind: k, items: users.filter((u) => u.kind === k) })).filter((g) => g.items.length > 0);

  return (
    <div>
      <PageHeader
        title="作業者"
        subtitle="スタッフ・アルバイト・協力会社スタッフ・下請の台帳"
        right={
          <LinkButton href="/workers/new" size="sm">
            <UserPlus className="h-4 w-4" />追加
          </LinkButton>
        }
      >
        <PeopleTabs />
      </PageHeader>
      <PageContainer>
        <form className="mb-4 flex gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input name="q" type="search" defaultValue={q ?? ""} placeholder="氏名・ふりがな・メールで検索" className="h-11 pl-10" />
          </div>
          {tag && <input type="hidden" name="tag" value={tag} />}
          <button type="submit" className={buttonClass({ className: "shrink-0 px-5" })}>検索</button>
        </form>
        {allTags.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 text-ink-faint" />
            <Link href="/workers" className={`flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ${!tag ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-soft"}`}>すべて</Link>
            {allTags.map((t) => (
              <Link key={t} href={`/workers?tag=${encodeURIComponent(t)}`} className={`flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ${tag === t ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-soft"}`}>
                {t}
              </Link>
            ))}
          </div>
        )}

        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.kind} className="space-y-2.5">
              <SectionTitle action={<span className="text-sm font-semibold text-ink-muted tnum">{g.items.length}名</span>}>
                {WORKER_KIND_LABEL[g.kind as WorkerKind]}
              </SectionTitle>
              {/* 1つのカードに行で並べる。スマホでは操作ボタンを下の段に回し、名前・連絡先を詰めない */}
              <div className="card divide-y divide-line overflow-hidden">
                {g.items.map((u) => {
                  const isSelf = u.id === me.id;
                  const canDelete = u._count.assignments === 0 && u._count.reports === 0 && !isSelf;
                  return (
                    <div key={u.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:flex-nowrap ${!u.active ? "opacity-60" : ""}`}>
                      <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
                        <Avatar name={u.name} color={u.avatarColor} image={avatarUrlFor(u)} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-base font-bold text-ink">{u.name}</span>
                            {u.canLogin ? (
                              <Badge tone={u.role === "STAFF" ? "neutral" : "brand"}>{ROLE_LABEL[u.role as Role] ?? u.role}</Badge>
                            ) : (
                              <Badge tone="past">ログインなし</Badge>
                            )}
                            {isDepartment(u.department) && <Badge tone="info">{DEPARTMENT_LABEL[u.department]}</Badge>}
                            {isSelf && <Badge tone="info">あなた</Badge>}
                            {!u.active && <Badge tone="danger">無効</Badge>}
                          </div>
                          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                            {u.partner && <span>{u.partner.name}</span>}
                            {u.email && (
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                                <span className="min-w-0 truncate">{u.email}</span>
                              </span>
                            )}
                            {u.phone && (
                              <span className="flex items-center gap-1.5 tnum">
                                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                                {u.phone}
                              </span>
                            )}
                          </div>
                          {u.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {u.tags.map((t) => (
                                <span key={t} className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="-my-1 ml-auto flex items-center gap-1.5">
                        <Link href={`/workers/${u.id}/edit`} aria-label="編集" className="flex h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50">
                          <Pencil className="h-4 w-4" />編集
                        </Link>
                        <StaffRowActions id={u.id} active={u.active} canDelete={canDelete} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {users.length === 0 && <p className="px-1 text-sm text-ink-muted">該当する作業者がいません。</p>}
        </div>

        <p className="mt-5 px-1 text-xs text-ink-muted">
          ※ 配員や日報の記録がある作業者は「無効化」で対応します（記録は保持され、ログインと配員候補から外れます）。
        </p>
      </PageContainer>
    </div>
  );
}
