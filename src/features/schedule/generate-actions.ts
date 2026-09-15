"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError, isManager } from "@/lib/permissions";
import { db } from "@/lib/db";
import { createNotificationForUsers } from "@/lib/notifications";
import { generateOccurrencesForMonth, type GenerateResult } from "@/lib/generate-occurrences";
import type { ActionResult } from "./types";

/**
 * 定期契約から指定月の実施回を生成する（手動ボタン用）。
 * SCHEDULER は自部門のみ。jobId 指定時はその案件だけ。
 */
export async function generateOccurrences(input: {
  month: string;
  jobId?: string;
  department?: string;
}): Promise<ActionResult<GenerateResult>> {
  const me = await requireUser();
  let department = input.department;
  try {
    if (input.jobId) {
      const job = await db.job.findUnique({ where: { id: input.jobId }, select: { department: true } });
      if (!job) return { ok: false, error: "案件が見つかりません", code: "NOT_FOUND" };
      assertCan(me, "generate.run", { department: job.department });
    } else if (department) {
      assertCan(me, "generate.run", { department });
    } else {
      // 部門未指定：管理者は全部門、手配担当は自部門に限定
      if (!isManager(me)) {
        if (!me.department) {
          assertCan(me, "generate.run");
        } else {
          department = me.department;
        }
      }
    }
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    throw e;
  }

  let result: GenerateResult;
  try {
    result = await generateOccurrencesForMonth({ month: input.month, jobId: input.jobId, department, actorId: me.id });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "生成に失敗しました", code: "VALIDATION" };
  }

  if (result.created > 0 && !input.jobId) {
    const managers = await db.user.findMany({
      where: { role: { in: ["OWNER", "OFFICE"] }, active: true, canLogin: true },
      select: { id: true },
    });
    await createNotificationForUsers(
      managers.map((u) => u.id).filter((id) => id !== me.id),
      {
        type: "GENERATED",
        title: `${input.month.replace("-", "年")}月分の定期を生成しました`,
        body: `${result.created}件を未割当に追加（${me.name}）`,
        href: `/schedule?view=week&d=${input.month}-01`,
        dedupeKey: `generated-${input.month}-${Date.now()}`,
      },
    );
  }

  revalidatePath("/schedule");
  revalidatePath("/jobs");
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, data: result };
}
