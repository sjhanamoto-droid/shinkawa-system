import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
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
