import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { avatarUrlFor } from "@/lib/session";
import type { WorkerOption } from "@/features/schedule/types";
import { can, type Actor } from "@/lib/permissions";
import { ROLE_OPTIONS, type Role } from "@/lib/constants";
import { ANNOUNCEMENT_WORKER_KINDS, isInAudience, isInternalWorker } from "@/lib/announcements";

type Viewer = Actor & { kind: string };

/** その人が見られるクレーム（登録できる人は全部。社員・アルバイトは自分の役割宛て。協力会社・下請は見られない） */
export function claimVisibleWhere(me: Viewer): Prisma.ClaimWhereInput {
  if (can(me, "claim.manage")) return {};
  if (!isInternalWorker(me.kind)) return { id: { in: [] } };
  return { OR: [{ audience: { has: "ALL" } }, { audience: { has: me.role } }] };
}

/** 1件のクレームをその人が見られるか（写真の配信などで使う） */
export function canViewClaim(me: Viewer, audience: string[]): boolean {
  if (can(me, "claim.manage")) return true;
  return isInternalWorker(me.kind) && isInAudience(me.role, audience);
}

/** 現場の選択肢（現場名・顧客名で探せる） */
export async function claimPropertyOptions() {
  const rows = await db.property.findMany({
    orderBy: [{ kana: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kana: true, customer: { select: { name: true, shortName: true } } },
  });
  return rows.map((p) => ({
    value: p.id,
    label: p.name,
    sub: p.customer.shortName ?? p.customer.name,
    keywords: [p.kana, p.customer.name].filter(Boolean).join(" "),
  }));
}

/** 役割ごとの届く人数（ログインできる在籍の社員・アルバイト。自分は除く） */
export async function audienceRoleCounts(meId: string): Promise<Record<Role, number>> {
  const groups = await db.user.groupBy({
    by: ["role"],
    where: { active: true, canLogin: true, kind: { in: ANNOUNCEMENT_WORKER_KINDS }, id: { not: meId } },
    _count: { _all: true },
  });
  return Object.fromEntries(ROLE_OPTIONS.map((r) => [r, groups.find((g) => g.role === r)?._count._all ?? 0])) as Record<Role, number>;
}

/** 「関わった人」の選択肢（在籍の作業者全員。ログインなし・協力会社も含む） */
export async function claimWorkerOptions(): Promise<WorkerOption[]> {
  const [users, withAvatar] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, avatarColor: true, updatedAt: true, kind: true, department: true, tags: true, partner: { select: { name: true } } },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.user.findMany({ where: { active: true, avatarImage: { not: null } }, select: { id: true } }),
  ]);
  const hasAvatar = new Set(withAvatar.map((u) => u.id));
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    avatarColor: u.avatarColor,
    avatarUrl: hasAvatar.has(u.id) ? avatarUrlFor({ id: u.id, updatedAt: u.updatedAt, avatarImage: "x" }) : null,
    kind: u.kind,
    department: u.department,
    tags: u.tags,
    partnerName: u.partner?.name ?? null,
  }));
}

/** 関わった人の表示名（選んだ作業者＋自由記入） */
export async function involvedNames(ids: string[], others: string | null): Promise<string[]> {
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return [...ids.map((id) => byId.get(id)).filter((n): n is string => !!n), ...(others ? [others] : [])];
}
