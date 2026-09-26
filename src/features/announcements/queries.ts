import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Actor } from "@/lib/permissions";
import { announcementDedupeKey, isInternalWorker } from "@/lib/announcements";

/** その人が見られる全体連絡の条件（送る権限のある人は全部。社員・アルバイトは自分宛て＝全員 or 自分の役割。協力会社・下請は見られない） */
export function visibleWhere(me: Actor & { kind: string }): Prisma.AnnouncementWhereInput {
  if (can(me, "announcement.send")) return {};
  if (!isInternalWorker(me.kind)) return { id: { in: [] } };
  return { OR: [{ audience: { has: "ALL" } }, { audience: { has: me.role } }] };
}

/** 自分に届いた全体連絡のうち未読の id */
export async function unreadAnnouncementIds(userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.notification.findMany({
    where: { userId, read: false, dedupeKey: { in: ids.map(announcementDedupeKey) } },
    select: { dedupeKey: true },
  });
  return new Set(rows.map((r) => (r.dedupeKey ?? "").replace(/^announce:/, "")));
}
