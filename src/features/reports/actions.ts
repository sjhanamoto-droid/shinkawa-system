"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dateFromKey, jstDateKey, storedDateKey } from "@/lib/date";
import { deleteBlobPaths } from "@/lib/media";
import { parseAndValidatePhotosField } from "@/lib/photos";
import {
  canEditReport,
  canViewReport,
  canWriteReportFor,
  isReportDue,
  lastWorkDay,
  occurrenceWorkDays,
  shouldAutoComplete,
} from "@/lib/reports";
import { loadOccurrenceReportState, type OccurrenceReportState } from "./queries";
import type { ActionResult } from "@/features/schedule/types";

// 日報の保存・提出。フォームは useActionState から呼ばれ、成功時は詳細画面へリダイレクトする。

export type ReportFormState = {
  error?: string;
  fieldErrors?: Partial<Record<ReportField, string>>;
  /** 同じ作業日の日報がすでにあったとき、その日報のID（上書きせず、そちらを開いてもらう） */
  existingReportId?: string;
};

// 日報に付ける写真の種別（それ以外は「作業」にそろえる。物件の図面・キーBOX等と混ざらないように）
const REPORT_PHOTO_KINDS = new Set(["WORK", "BEFORE", "AFTER", "OTHER"]);

type ReportField = "workDate" | "startTime" | "endTime" | "detail" | "parking" | "train" | "expenses" | "handover" | "photos";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPENSES = 20;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** 「あり／なし」＋金額の欄。null=未選択、0=なし */
function parseFee(choice: string, amountRaw: string, submit: boolean, label: string): { value: number | null } | { error: string } {
  if (choice === "no") return { value: 0 };
  if (choice === "yes") {
    const n = Number(amountRaw);
    if (!Number.isInteger(n) || n < (submit ? 1 : 0) || n > 1_000_000) {
      return { error: `${label}は1円以上の整数で入力してください（0円の場合は「なし」を選択）` };
    }
    return { value: n };
  }
  if (submit) return { error: `${label}のあり／なしを選択してください` };
  return { value: null };
}

function parseExpenses(raw: string): { label: string; amount: number }[] | { error: string } {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return { error: "経費の入力内容が不正です" };
  }
  if (!Array.isArray(arr)) return { error: "経費の入力内容が不正です" };
  const out: { label: string; amount: number }[] = [];
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 50) : "";
    const amountRaw = typeof o.amount === "string" || typeof o.amount === "number" ? String(o.amount).trim() : "";
    if (!label && !amountRaw) continue; // 空行は無視
    const amount = Number(amountRaw);
    if (!label) return { error: "経費の名目を入力してください" };
    if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) return { error: `「${label}」の金額は0以上の整数で入力してください` };
    out.push({ label, amount });
  }
  if (out.length > MAX_EXPENSES) return { error: `経費は${MAX_EXPENSES}件までです` };
  return out;
}

export async function saveReport(_prev: ReportFormState, fd: FormData): Promise<ReportFormState> {
  const me = await requireUser();
  const reportId = str(fd, "reportId");
  let submit = str(fd, "intent") === "submit";
  const today = jstDateKey();

  // ── 対象の特定と権限 ──
  let occurrenceId: string | null;
  let userId: string;
  let workDate: string;
  let existing: { id: string; status: string; submittedAt: Date | null; propertyId: string | null } | null = null;

  if (reportId) {
    const r = await db.dailyReport.findUnique({
      where: { id: reportId },
      select: { id: true, userId: true, createdById: true, occurrenceId: true, propertyId: true, workDate: true, status: true, submittedAt: true },
    });
    if (!r) return { error: "日報が見つかりません（削除された可能性があります）" };
    if (!canEditReport(me, r)) return { error: "この日報を編集する権限がありません" };
    occurrenceId = r.occurrenceId;
    userId = r.userId;
    workDate = storedDateKey(r.workDate);
    existing = r;
  } else {
    occurrenceId = str(fd, "occurrenceId") || null;
    userId = str(fd, "userId");
    workDate = str(fd, "workDate");
    if (!occurrenceId || !userId) return { error: "予定または作業者が指定されていません" };
    if (!canWriteReportFor(me, userId)) return { error: "この作業者の日報を書く権限がありません" };
    if (!DATE_RE.test(workDate)) return { fieldErrors: { workDate: "作業日を選んでください" } };
    if (workDate > today) return { fieldErrors: { workDate: "未来の日付では日報を作成できません" } };
    const found = await db.dailyReport.findUnique({
      where: { occurrenceId_userId_workDate: { occurrenceId, userId, workDate: dateFromKey(workDate) } },
      select: { id: true },
    });
    if (found) {
      // 別の端末などで先に作られていた場合は上書きしない（写真などを消さないため）。そちらを開いてもらう
      return { error: "この作業日の日報はすでにあります。下のボタンから開いて編集してください。", existingReportId: found.id };
    }
  }

  const occ = occurrenceId
    ? await db.occurrence.findUnique({
        where: { id: occurrenceId },
        select: {
          id: true,
          version: true,
          status: true,
          category: true,
          date: true,
          endDate: true,
          propertyId: true,
          assignments: { select: { userId: true } },
        },
      })
    : null;
  if (!reportId) {
    if (!occ || !occ.date) return { error: "予定が見つかりません（削除された可能性があります）" };
    if (!occ.assignments.some((a) => a.userId === userId)) return { error: "この予定の担当者ではありません" };
    const dateKey = storedDateKey(occ.date);
    if (!isReportDue({ date: dateKey, status: occ.status, category: occ.category })) return { error: "この予定には日報は不要です（中止・休みなど）" };
    const days = occurrenceWorkDays(dateKey, occ.endDate ? storedDateKey(occ.endDate) : null);
    if (!days.includes(workDate)) return { fieldErrors: { workDate: "予定の作業日ではありません" } };
  }

  // 提出済みは下書きに戻せない（「保存して提出」のみ）
  if (existing?.status === "SUBMITTED") submit = true;

  // ── 入力の検証 ──
  const fieldErrors: ReportFormState["fieldErrors"] = {};
  const startTime = str(fd, "startTime");
  const endTime = str(fd, "endTime");
  if (!TIME_RE.test(startTime)) fieldErrors.startTime = "開始時刻を入力してください";
  if (!TIME_RE.test(endTime)) fieldErrors.endTime = "終了時刻を入力してください";
  if (TIME_RE.test(startTime) && TIME_RE.test(endTime) && endTime <= startTime) fieldErrors.endTime = "終了時刻は開始時刻より後にしてください";

  const detail = str(fd, "detail").slice(0, 4000);
  if (submit && !detail) fieldErrors.detail = "提出には作業内容の入力が必要です";

  const parking = parseFee(str(fd, "parkingChoice"), str(fd, "parkingFee"), submit, "駐車場代");
  if ("error" in parking) fieldErrors.parking = parking.error;
  const train = parseFee(str(fd, "trainChoice"), str(fd, "trainFare"), submit, "電車賃");
  if ("error" in train) fieldErrors.train = train.error;

  const expenses = parseExpenses(str(fd, "expenses"));
  if ("error" in expenses) fieldErrors.expenses = expenses.error;

  const handoverChoice = str(fd, "handoverChoice");
  const handoverText = str(fd, "handover").slice(0, 1000);
  if (submit) {
    if (handoverChoice !== "yes" && handoverChoice !== "no") fieldErrors.handover = "引き継ぎのあり／なしを選択してください";
    else if (handoverChoice === "yes" && !handoverText) fieldErrors.handover = "引き継ぎ内容を入力してください（無い場合は「なし」を選択）";
  }

  const photos = parseAndValidatePhotosField(str(fd, "photos"));
  if ("error" in photos) fieldErrors.photos = photos.error;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if ("error" in parking || "error" in train || "error" in expenses || "error" in photos) return { error: "入力内容を確認してください" };

  const handover = handoverChoice === "yes" ? handoverText : null;
  const handoverNone = handoverChoice === "no" ? true : handoverChoice === "yes" ? false : null;
  const status = submit ? "SUBMITTED" : "DRAFT";
  // 既存の日報は、書いたときの現場のまま（予定が消えたり別の現場に動いても変えない）
  const propertyId = existing ? existing.propertyId : (occ?.propertyId ?? null);
  const firstSubmit = submit && existing?.status !== "SUBMITTED";

  // ── 保存 ──
  let savedId: string;
  let removedBlobs: string[] = [];
  let completed = false;
  try {
    const result = await db.$transaction(async (tx) => {
      const data = {
        startTime,
        endTime,
        detail: detail || null,
        parkingFee: parking.value,
        trainFare: train.value,
        handover,
        handoverNone,
        status,
        submittedAt: submit ? (existing?.submittedAt ?? new Date()) : null,
      } satisfies Prisma.DailyReportUncheckedUpdateInput;

      const report = existing
        ? await tx.dailyReport.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.dailyReport.create({
            data: { ...data, occurrenceId, userId, workDate: dateFromKey(workDate), propertyId, createdById: me.id },
            select: { id: true },
          });

      // 経費：作り直す
      await tx.reportExpense.deleteMany({ where: { reportId: report.id } });
      if (expenses.length) {
        await tx.reportExpense.createMany({
          data: expenses.map((e, i) => ({ reportId: report.id, label: e.label, amount: e.amount, sortOrder: i })),
        });
      }

      // 写真：残すもの以外を消し、新しいものを足す
      const gone = await tx.photo.findMany({
        where: { reportId: report.id, id: { notIn: photos.kept } },
        select: { id: true, blobPath: true },
      });
      if (gone.length) await tx.photo.deleteMany({ where: { id: { in: gone.map((p) => p.id) } } });
      if (photos.added.length) {
        await tx.photo.createMany({
          // 日報の写真は reportId だけで紐づける（予定や現場の削除に巻き込まれないように）
          data: photos.added.map((p) => ({
            reportId: report.id,
            kind: REPORT_PHOTO_KINDS.has(p.kind) ? p.kind : "WORK",
            dataUrl: p.dataUrl ?? null,
            thumbUrl: p.thumbUrl ?? null,
            blobPath: p.blobPath ?? null,
            mimeType: p.mimeType ?? null,
            sizeBytes: p.sizeBytes ?? null,
            duration: p.duration ?? null,
            caption: p.caption.trim() === "" ? null : p.caption.trim().slice(0, 200),
            isVideo: p.isVideo,
            width: p.width ?? null,
            height: p.height ?? null,
            createdById: me.id,
          })),
        });
      }

      // 引き継ぎ：提出済みで内容があれば現場に起票する。
      // すでに起票済みなら、内容が変わったときだけ更新して未確認に戻す（確認済みを勝手に復活させない）。
      // 下書きに戻った・「なし」になったときは、未確認のものだけ取り下げる。
      const prevHandover = await tx.handover.findFirst({
        where: { reportId: report.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, resolvedAt: true },
      });
      if (submit && handover && propertyId) {
        if (!prevHandover) {
          await tx.handover.create({ data: { propertyId, reportId: report.id, content: handover, createdById: me.id } });
        } else if (prevHandover.content !== handover) {
          await tx.handover.update({ where: { id: prevHandover.id }, data: { content: handover, resolvedAt: null, resolvedById: null } });
        }
      } else if (prevHandover && !prevHandover.resolvedAt) {
        await tx.handover.delete({ where: { id: prevHandover.id } });
      }

      // 担当者全員の最終日の日報がそろったら、実施回を完了にする。
      // 初めて提出したときだけ判定する（完了を手で戻した予定を、日報の修正で勝手に完了にしない）
      let done = false;
      if (firstSubmit && occ?.date) {
        const last = lastWorkDay(storedDateKey(occ.date), occ.endDate ? storedDateKey(occ.endDate) : null);
        if (workDate === last) {
          // 同時に提出されても取りこぼさないよう、予定の行をロックしてから数える
          await tx.$queryRaw`SELECT id FROM "Occurrence" WHERE id = ${occ.id} FOR UPDATE`;
          const current = await tx.occurrence.findUnique({
            where: { id: occ.id },
            select: { version: true, status: true, assignments: { select: { userId: true } } },
          });
          if (current) {
            const submitted = await tx.dailyReport.findMany({
              where: { occurrenceId: occ.id, workDate: dateFromKey(last), status: "SUBMITTED" },
              select: { userId: true },
            });
            if (
              shouldAutoComplete({
                status: current.status,
                assigneeIds: current.assignments.map((a) => a.userId),
                submittedOnLastDay: submitted.map((s) => s.userId),
              })
            ) {
              const upd = await tx.occurrence.updateMany({
                where: { id: occ.id, version: current.version },
                data: { status: "DONE", version: { increment: 1 } },
              });
              if (upd.count > 0) {
                await tx.occurrenceChangeLog.create({
                  data: {
                    occurrenceId: occ.id,
                    actorId: me.id,
                    action: "STATUS",
                    field: "status",
                    fromValue: current.status,
                    toValue: "DONE",
                    reason: "担当者全員の日報が提出されたため自動で完了",
                  },
                });
                done = true;
              }
            }
          }
        }
      }

      return { id: report.id, gone: gone.map((p) => p.blobPath).filter((p): p is string => !!p), done };
    });
    savedId = result.id;
    removedBlobs = result.gone;
    completed = result.done;
  } catch (e) {
    // 同じ日報が同時に新規作成された（ユニーク制約）→ 先にできた方を開いてもらう
    if (!existing && occurrenceId && typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      const dup = await db.dailyReport.findUnique({
        where: { occurrenceId_userId_workDate: { occurrenceId, userId, workDate: dateFromKey(workDate) } },
        select: { id: true },
      });
      if (dup) return { error: "この作業日の日報はすでにあります。下のボタンから開いて編集してください。", existingReportId: dup.id };
    }
    console.error("[reports] save failed", e);
    return { error: "保存に失敗しました。電波状況を確認してもう一度お試しください（入力内容は端末に自動保存されています）" };
  }

  if (removedBlobs.length) await deleteBlobPaths(removedBlobs).catch(() => {});

  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath("/schedule");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
  const toast = submit ? (completed ? "日報を提出しました。担当者全員の日報がそろったので予定を完了にしました" : "日報を提出しました") : "下書きを保存しました";
  redirect(`/reports/${savedId}?toast=${encodeURIComponent(toast)}`);
}

export async function addReportComment(reportId: string, raw: string): Promise<{ error?: string }> {
  const me = await requireUser();
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return { error: "コメントを入力してください" };
  if (body.length > 1000) return { error: "1000文字以内で入力してください" };
  const r = await db.dailyReport.findUnique({ where: { id: reportId }, select: { userId: true, createdById: true } });
  if (!r || !canViewReport(me, r)) return { error: "日報が見つかりません" };
  await db.comment.create({ data: { reportId, userId: me.id, body } });
  revalidatePath(`/reports/${reportId}`);
  return {};
}

/** 予定の詳細画面（カレンダー）で、担当者ごとの日報の状況を出す */
export async function getOccurrenceReportState(occurrenceId: string): Promise<ActionResult<{ state: OccurrenceReportState | null }>> {
  await requireUser();
  const state = await loadOccurrenceReportState(occurrenceId);
  return { ok: true, data: { state } };
}
