import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/date";
import { isRuleKind } from "@/lib/constants";
import { slotsForMonth, seriesKey, type RuleParams } from "@/lib/recurrence";

// 定期契約（Job）から、指定月の実施回（Occurrence）を「未割当」で生成する。
// seriesKey（jobId:YYYY-MM:slotIndex）を冪等キーにし、再実行しても重複しない（skipDuplicates）。
// 日付が決まっているスロットは date 付き、決まっていない（window のみ）スロットは date=null で未割当レーンへ。

export type GenerateInput = {
  month: string; // "YYYY-MM"
  jobId?: string;
  department?: string;
  actorId?: string | null;
};

export type GenerateResult = { created: number; skipped: number; jobs: number };

export async function generateOccurrencesForMonth(input: GenerateInput): Promise<GenerateResult> {
  const { month } = input;
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("月の形式が正しくありません（YYYY-MM）");
  const monthStart = dateFromKey(`${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const nextMonthStart = new Date(monthStart);
  nextMonthStart.setMonth(m); // 翌月1日（monthStart は y-m-01 なので setMonth(m) で翌月）
  void y;

  const jobs = await db.job.findMany({
    where: {
      status: "ACTIVE",
      ruleKind: { not: null },
      ...(input.jobId ? { id: input.jobId } : {}),
      ...(input.department ? { department: input.department } : {}),
      OR: [{ startsOn: null }, { startsOn: { lt: nextMonthStart } }],
      AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: monthStart } }] }],
    },
    select: {
      id: true,
      customerId: true,
      propertyId: true,
      name: true,
      department: true,
      category: true,
      ruleKind: true,
      ruleParams: true,
      unitCount: true,
      headcount: true,
      defaultStartTime: true,
      defaultEndTime: true,
      vehicleId: true,
      amount: true,
    },
  });

  const rows: Prisma.OccurrenceCreateManyInput[] = [];
  const vehicleBySeriesKey = new Map<string, string>(); // 既定の車両を持つ案件の回 → vehicleId
  for (const job of jobs) {
    if (!isRuleKind(job.ruleKind)) continue;
    const params = (job.ruleParams ?? {}) as RuleParams;
    const slots = slotsForMonth(job.ruleKind, params, month);
    for (const slot of slots) {
      const key = seriesKey(job.id, month, slot.index);
      if (job.vehicleId) vehicleBySeriesKey.set(key, job.vehicleId);
      rows.push({
        jobId: job.id,
        propertyId: job.propertyId,
        customerId: job.customerId,
        seriesKey: key,
        title: null,
        department: job.department,
        category: job.category,
        targetMonth: month,
        date: slot.date ? dateFromKey(slot.date) : null,
        windowStart: dateFromKey(slot.windowStart),
        windowEnd: dateFromKey(slot.windowEnd),
        startTime: job.defaultStartTime,
        endTime: job.defaultEndTime,
        status: "UNASSIGNED",
        headcount: job.headcount,
        unitCount: job.unitCount,
        amount: job.amount,
        source: "GENERATED",
        createdById: input.actorId ?? null,
      });
    }
  }

  let created = 0;
  if (rows.length > 0) {
    // 既定の車両は「この実行で新しく作った回」にだけ付ける（既存の回で外した車両を復活させない）
    const keys = Array.from(vehicleBySeriesKey.keys());
    const existing = keys.length
      ? new Set((await db.occurrence.findMany({ where: { seriesKey: { in: keys } }, select: { seriesKey: true } })).map((o) => o.seriesKey))
      : new Set<string | null>();
    const res = await db.occurrence.createMany({ data: rows, skipDuplicates: true });
    created = res.count;
    const fresh = keys.filter((k) => !existing.has(k));
    if (fresh.length) {
      const made = await db.occurrence.findMany({ where: { seriesKey: { in: fresh } }, select: { id: true, seriesKey: true } });
      await db.occurrenceVehicle.createMany({
        data: made.map((o) => ({ occurrenceId: o.id, vehicleId: vehicleBySeriesKey.get(o.seriesKey!)!, createdById: input.actorId ?? null })),
        skipDuplicates: true,
      });
    }
  }
  const skipped = rows.length - created;

  if (jobs.length > 0) {
    // 生成済み月を更新（既により先の月まで生成済みなら進めない）
    await db.job.updateMany({
      where: {
        id: { in: jobs.map((j) => j.id) },
        OR: [{ generatedThrough: null }, { generatedThrough: { lt: month } }],
      },
      data: { generatedThrough: month },
    });
  }

  return { created, skipped, jobs: jobs.length };
}
