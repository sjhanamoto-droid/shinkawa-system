import "server-only";
import { db } from "@/lib/db";
import { jstMonthKey, storedDateKey } from "@/lib/date";
import { CATEGORY, CONTRACT_TYPE_LABEL, DEPARTMENT_LABEL, isCategory, isContractType, isDepartment, isRuleKind } from "@/lib/constants";
import { describeRule, type RuleParams } from "@/lib/recurrence";
import type { WorkFormValues } from "./property-form";

// 現場1件＝作業1つ。作業は現場にぶら下がる Job に保存している。
// 統合前のデータで複数ある場合は、最初に登録したものを主な作業として扱う（状態で並べると編集のたびに入れ替わるため）。
export const PRIMARY_JOB_ORDER = [{ createdAt: "asc" as const }];

/** 「クリーニング・定期清掃・定期（毎月第2火曜）」のような1行の説明 */
export function describeWork(j: { department: string; category: string; contractType: string; ruleKind: string | null; ruleParams: unknown }): string {
  const parts = [
    isDepartment(j.department) ? DEPARTMENT_LABEL[j.department] : null,
    isCategory(j.category) ? CATEGORY[j.category].label : j.category,
    isContractType(j.contractType) ? CONTRACT_TYPE_LABEL[j.contractType] : null,
  ].filter(Boolean);
  const rule = isRuleKind(j.ruleKind) ? `（${describeRule(j.ruleKind, (j.ruleParams ?? {}) as RuleParams)}）` : "";
  return parts.join("・") + rule;
}

/** 編集フォーム用：主な作業を読み込む */
export async function loadWorkForForm(propertyId: string, showAmount: boolean): Promise<{ work: WorkFormValues | null; department: string | null; summary: string | null }> {
  const job = await db.job.findFirst({
    where: { propertyId },
    orderBy: PRIMARY_JOB_ORDER,
    select: {
      department: true, category: true, contractType: true, ruleKind: true, ruleParams: true, startsOn: true, endsOn: true,
      headcount: true, defaultStartTime: true, defaultEndTime: true, vehicleId: true, amount: showAmount,
      _count: { select: { occurrences: true } },
    },
  });
  if (!job) return { work: null, department: null, summary: null };
  const startKey = job.startsOn ? storedDateKey(job.startsOn) : null;
  return {
    department: job.department,
    summary: describeWork(job),
    work: {
      department: job.department,
      category: job.category,
      contractType: job.contractType,
      ruleKind: job.ruleKind,
      ruleParams: job.ruleParams,
      startMonth: job.contractType === "REGULAR" ? (startKey?.slice(0, 7) ?? jstMonthKey()) : null,
      workStart: job.contractType === "CONSTRUCTION" ? startKey : null,
      workEnd: job.contractType === "CONSTRUCTION" && job.endsOn ? storedDateKey(job.endsOn) : null,
      headcount: job.headcount,
      defaultStartTime: job.defaultStartTime,
      defaultEndTime: job.defaultEndTime,
      vehicleId: job.vehicleId,
      amount: "amount" in job ? (job.amount ?? null) : null,
      occurrenceCount: job._count.occurrences,
    },
  };
}
