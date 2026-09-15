"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X, MapPin, KeyRound, Clock, Users, Car, Repeat, Pencil, ArrowRightLeft, CheckCircle2, Ban, Trash2, History, Loader2, Inbox, DoorOpen, StickyNote, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { CHANGE_ACTION_LABEL, DEPARTMENT_LABEL, OCCURRENCE_SOURCE_LABEL, isDepartment, type ChangeAction } from "@/lib/constants";
import { can, type Actor } from "@/lib/permissions";
import { cn, fmtYen, mapSearchUrl } from "@/lib/utils";
import { AssigneePicker } from "./assignee-picker";
import { getChangeLog } from "./actions";
import { fmtKeyLong, fmtKeyShort } from "./filters";
import { timeLabel } from "./occurrence-card";
import type { ChangeLogView, OccurrenceView, WorkerOption } from "./types";

function fmtLogValue(field: string | null, v: string | null, people: Map<string, string>): string {
  if (v == null) return "—";
  if (field === "assignee") return people.get(v) ?? v;
  if (field === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtKeyShort(v);
  return v;
}

export function OccurrenceDrawer({
  occurrence: o,
  workers,
  me,
  onClose,
  onEdit,
  onMove,
  onStatus,
  onAssign,
  onDelete,
  busy = false,
}: {
  occurrence: OccurrenceView | null;
  workers: WorkerOption[];
  me: Actor;
  onClose: () => void;
  onEdit: (o: OccurrenceView) => void;
  onMove: (o: OccurrenceView) => void;
  onStatus: (o: OccurrenceView, status: string, reason?: string) => Promise<void>;
  onAssign: (o: OccurrenceView, ids: string[]) => Promise<void>;
  onDelete: (o: OccurrenceView, scope: "ONE" | "FOLLOWING") => Promise<void>;
  busy?: boolean;
}) {
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [logs, setLogs] = useState<ChangeLogView[] | null>(null);
  const [loadingLogs, startLogs] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);
  const [deleteScope, setDeleteScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [cancelReason, setCancelReason] = useState("");

  const open = !!o;
  useEffect(() => {
    if (!o) return;
    setTab("detail");
    setLogs(null);
    setAssignIds(o.assignees.map((a) => a.id));
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!o || tab !== "history" || logs !== null) return;
    startLogs(async () => {
      const r = await getChangeLog(o.id);
      setLogs(r.ok ? r.data.items : []);
    });
  }, [tab, o, logs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!o) return null;

  const people = new Map(workers.map((w) => [w.id, w.name]));
  const assigneeIds = o.assignees.map((a) => a.id);
  const canEdit = can(me, "occurrence.edit", { department: o.department });
  const canMove = can(me, "occurrence.move", { department: o.department }) && o.status !== "DONE" && o.status !== "CANCELLED";
  const canDelete = can(me, "occurrence.delete", { department: o.department });
  const canConfirm = can(me, "occurrence.status", { department: o.department, assigneeIds, nextStatus: "CONFIRMED" }) && o.status !== "CONFIRMED" && o.status !== "DONE" && o.status !== "CANCELLED";
  const canDone = can(me, "occurrence.status", { department: o.department, assigneeIds, nextStatus: "DONE" }) && o.status !== "DONE" && o.status !== "CANCELLED";
  const canCancel = can(me, "occurrence.status", { department: o.department, assigneeIds, nextStatus: "CANCELLED" }) && o.status !== "CANCELLED" && o.status !== "DONE";
  const canReopen = can(me, "occurrence.status", { department: o.department, assigneeIds, nextStatus: "TENTATIVE" }) && (o.status === "DONE" || o.status === "CANCELLED");
  const t = timeLabel(o);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 md:bg-black/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border border-line bg-surface shadow-float animate-slide-up md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:max-h-none md:rounded-none md:border-l md:animate-none"
      >
        {/* ヘッダ */}
        <div className="flex items-start gap-2 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={o.category} />
              <OccurrenceStatusBadge status={o.status} />
              {isDepartment(o.department) && <span className="text-[11px] font-semibold text-ink-faint">{DEPARTMENT_LABEL[o.department]}</span>}
            </div>
            <h2 className="mt-1.5 text-lg font-bold leading-tight text-ink">{o.title}</h2>
            {o.property && o.property.name !== o.title && <p className="text-sm font-semibold text-ink-soft">{o.property.name}</p>}
            {o.customerNameRaw && !o.customer && (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">顧客「{o.customerNameRaw}」は台帳に見つかりませんでした。編集で顧客を選んでください。</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-line px-4">
          {(
            [
              ["detail", "詳細"],
              ["history", "変更履歴"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-bold", tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "detail" ? (
            <div className="space-y-4">
              {/* 日時 */}
              <div className="rounded-xl bg-surface-subtle p-3">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Clock className="h-4 w-4 text-ink-muted" />
                  {o.date ? fmtKeyLong(o.date) : "日付未定"}
                  {o.endDate && o.endDate !== o.date && <span className="text-ink-soft">〜 {fmtKeyShort(o.endDate)}</span>}
                </p>
                <p className="mt-0.5 pl-6 text-sm text-ink-soft">
                  {t ?? "終日"}
                  {o.windowLabel && !o.date && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">{o.targetMonth.replace("-", "年")}月 {o.windowLabel}</span>}
                </p>
                {o.ruleKind && (
                  <p className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-ink-muted">
                    <Repeat className="h-3.5 w-3.5" />
                    定期：{o.ruleSummary}
                    {o.jobId && (
                      <Link href={`/jobs/${o.jobId}`} className="ml-1 inline-flex items-center gap-0.5 font-semibold text-brand-600">
                        案件 <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </p>
                )}
              </div>

              {/* 物件 */}
              {o.property && (
                <div className="space-y-1.5 text-sm">
                  {o.property.address && (
                    <p className="flex items-start gap-2 text-ink-soft">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="flex-1">{o.property.address}</span>
                      <a href={mapSearchUrl(o.property.address)} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-bold text-brand-600">
                        地図
                      </a>
                    </p>
                  )}
                  {o.property.keyboxNumber && (
                    <p className="flex items-center gap-2 text-ink-soft">
                      <KeyRound className="h-4 w-4 shrink-0 text-ink-faint" />
                      キーBOX <span className="font-bold tnum text-ink">{o.property.keyboxNumber}</span>
                      {o.property.keyboxPlace && <span className="text-ink-muted">（{o.property.keyboxPlace}）</span>}
                    </p>
                  )}
                  {o.property.accessNote && (
                    <p className="flex items-start gap-2 text-ink-soft">
                      <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="whitespace-pre-wrap">{o.property.accessNote}</span>
                    </p>
                  )}
                  <Link href={`/properties/${o.property.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-brand-600">
                    物件の詳細を見る <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {/* 数量など */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                {o.unitCount != null && <span>{o.unitCount}件（部屋・箇所）</span>}
                {o.headcount != null && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-ink-faint" />
                    {o.headcount}名
                  </span>
                )}
                {o.vehicle && (
                  <span className="flex items-center gap-1">
                    <Car className="h-4 w-4 text-ink-faint" />
                    {o.vehicle}
                  </span>
                )}
                {o.amount !== undefined && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">金額 {o.amount != null ? fmtYen(o.amount) : "未設定"}</span>
                )}
              </div>

              {o.note && (
                <p className="flex items-start gap-2 whitespace-pre-wrap rounded-xl border border-line p-3 text-sm text-ink-soft">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  <span>{o.note}</span>
                </p>
              )}

              {/* 担当者 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">担当者 {o.assignees.length > 0 && <span className="text-ink-muted">{o.assignees.length}名</span>}</p>
                  {canEdit && (
                    <button type="button" onClick={() => setAssignOpen(true)} className="text-xs font-bold text-brand-600">
                      変更
                    </button>
                  )}
                </div>
                {o.assignees.length === 0 ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">担当者が決まっていません</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {o.assignees.map((p) => (
                      <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2.5 text-sm font-semibold text-ink">
                        <Avatar name={p.name} color={p.avatarColor} image={p.avatarUrl} size="sm" />
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-ink-faint">
                {OCCURRENCE_SOURCE_LABEL[o.source as keyof typeof OCCURRENCE_SOURCE_LABEL] ?? o.source}
                {o.createdBy && ` ・ 入力: ${o.createdBy.name}`}
              </p>
            </div>
          ) : (
            <div>
              {loadingLogs || logs === null ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中...
                </p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-ink-muted">履歴はありません</p>
              ) : (
                <ol className="space-y-2">
                  {logs.map((l) => (
                    <li key={l.id} className="flex gap-2.5 text-sm">
                      <History className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">
                          {CHANGE_ACTION_LABEL[l.action as ChangeAction] ?? l.action}
                          {l.field && (l.fromValue || l.toValue) && (
                            <span className="ml-1.5 font-normal text-ink-soft">
                              {fmtLogValue(l.field, l.fromValue, people)} → {fmtLogValue(l.field, l.toValue, people)}
                            </span>
                          )}
                          {l.scope === "FOLLOWING" && <span className="ml-1.5 rounded bg-violet-50 px-1 text-[10px] font-bold text-violet-700">以降も</span>}
                        </p>
                        {l.reason && <p className="text-xs text-ink-soft">理由：{l.reason}</p>}
                        <p className="text-[11px] text-ink-faint">
                          {l.actor?.name ?? "システム"} ・ {new Date(l.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>

        {/* アクション */}
        <div className="border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {canMove && (
              <Button type="button" variant="outline" size="sm" onClick={() => onMove(o)} disabled={busy}>
                <ArrowRightLeft className="h-4 w-4" /> 移動
              </Button>
            )}
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(o)} disabled={busy}>
                <Pencil className="h-4 w-4" /> 編集
              </Button>
            )}
            {canConfirm && (
              <Button type="button" size="sm" onClick={() => onStatus(o, "CONFIRMED")} disabled={busy || !o.date}>
                <CheckCircle2 className="h-4 w-4" /> 確定
              </Button>
            )}
            {canDone && (
              <Button type="button" variant="accent" size="sm" onClick={() => onStatus(o, "DONE")} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> 完了
              </Button>
            )}
            {canReopen && (
              <Button type="button" variant="outline" size="sm" onClick={() => onStatus(o, o.assignees.length ? "TENTATIVE" : "UNASSIGNED")} disabled={busy}>
                <Inbox className="h-4 w-4" /> 戻す
              </Button>
            )}
            {canCancel && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm("cancel")} disabled={busy}>
                <Ban className="h-4 w-4" /> 中止
              </Button>
            )}
            {canDelete && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto text-status-danger" onClick={() => setConfirm("delete")} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* 担当者変更 */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="担当者を変更">
        <AssigneePicker workers={workers} value={assignIds} onChange={setAssignIds} department={o.department} />
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setAssignOpen(false)}>
            キャンセル
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={async () => {
              await onAssign(o, assignIds);
              setAssignOpen(false);
            }}
          >
            保存する
          </Button>
        </div>
      </Modal>

      {/* 中止 */}
      <Modal open={confirm === "cancel"} onClose={() => setConfirm(null)} title="予定を中止">
        <p className="mb-3 text-sm text-ink-soft">「{o.title}」を中止にします。担当者に通知されます。</p>
        <input
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="理由（任意）"
          className="mb-4 h-11 w-full rounded-xl border border-line-strong px-3 text-sm"
          maxLength={200}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
            戻る
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            onClick={async () => {
              await onStatus(o, "CANCELLED", cancelReason.trim() || undefined);
              setConfirm(null);
              setCancelReason("");
            }}
          >
            中止にする
          </Button>
        </div>
      </Modal>

      {/* 削除 */}
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => onDelete(o, deleteScope)}
        title="予定を削除"
        danger
        confirmLabel="削除する"
        description={
          <div className="space-y-2">
            <p>「{o.title}」を削除します。この操作は取り消せません。</p>
            {o.ruleKind && (
              <div className="space-y-1.5 rounded-xl border border-line p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={deleteScope === "ONE"} onChange={() => setDeleteScope("ONE")} /> この回だけ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={deleteScope === "FOLLOWING"} onChange={() => setDeleteScope("FOLLOWING")} /> 以降の未確定の回も削除し、契約を終了にする
                </label>
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
