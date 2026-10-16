"use client";

import { useEffect, useState, useTransition } from "react";
import {
  X, Building, MapPin, KeyRound, Clock, Users, Car, Repeat, Pencil, ArrowRightLeft, Trash2, History, Loader2, Inbox, DoorOpen, StickyNote, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge, OccurrenceStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { CHANGE_ACTION_LABEL, DEPARTMENT_LABEL, NON_WORK_CATEGORIES, OCCURRENCE_SOURCE_LABEL, isDepartment, type ChangeAction } from "@/lib/constants";
import { can, type Actor } from "@/lib/permissions";
import { cn, fmtYen, mapSearchUrl } from "@/lib/utils";
import { catColor } from "@/lib/categories";
import { useCategories } from "@/components/category-provider";
import { AssigneePicker, useWorkerUsage } from "./assignee-picker";
import { VehiclePicker } from "./vehicle-picker";
import { getChangeLog, getVehicleUsage } from "./actions";
import { OccurrenceReportPanel } from "@/features/reports/occurrence-report-panel";
import { isReportDue } from "@/lib/reports";
import { fmtKeyLong, fmtKeyShort } from "./filters";
import { occurrenceLabels, timeLabel } from "./labels";
import { SearchSelect } from "@/components/ui/search-select";
import type { ChangeLogView, OccurrenceView, PropertyOption, VehicleOption, VehicleUsage, WorkerOption } from "./types";

/** 現場が未設定の予定に、その場で現場を紐づける */
function PropertyLinker({
  o,
  properties,
  onLink,
  busy,
}: {
  o: OccurrenceView;
  properties: PropertyOption[];
  onLink: (o: OccurrenceView, propertyId: string, sameCustomer: boolean) => Promise<void>;
  busy: boolean;
}) {
  const candidates = o.customer ? properties.filter((p) => p.customerId === o.customer!.id) : properties;
  // 顧客の現場が1件だけなら最初から選んでおく
  const [propertyId, setPropertyId] = useState<string>(o.customer && candidates.length === 1 ? candidates[0].id : "");
  const [sameCustomer, setSameCustomer] = useState(false);
  const newHref = o.customer ? `/properties/new?customerId=${o.customer.id}` : "/properties/new";
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
        <Building className="h-4 w-4" />
        現場が未設定です
      </p>
      {candidates.length === 0 ? (
        <p className="text-xs text-ink-soft">{o.customer ? "この顧客の現場はまだ登録されていません。" : "現場を選べません。"}</p>
      ) : (
        <>
          <SearchSelect
            id={`link-property-${o.id}`}
            value={propertyId}
            onChange={setPropertyId}
            options={candidates.map((p) => ({ value: p.id, label: p.name, sub: p.address ?? null }))}
            placeholder={o.customer ? `${o.customer.name} の現場から選ぶ` : "現場名で検索"}
            emptyLabel="選択を解除"
          />
          {o.customer && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={sameCustomer} onChange={(e) => setSameCustomer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
              <span>同じ顧客・同じ種別で現場が未設定の、今日以降の予定にもまとめて設定する</span>
            </label>
          )}
          <Button type="button" size="sm" className="w-full" disabled={!propertyId || busy} onClick={() => onLink(o, propertyId, sameCustomer)}>
            この現場に設定する
          </Button>
        </>
      )}
      <Link href={newHref} target="_blank" className="inline-flex items-center gap-1 text-xs font-bold text-brand-600">
        現場を新しく登録する <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function fmtLogValue(field: string | null, v: string | null, people: Map<string, string>): string {
  if (v == null) return "—";
  if (field === "assignee") return people.get(v) ?? v;
  if (field === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtKeyShort(v);
  return v;
}

export function OccurrenceDrawer({
  occurrence: o,
  workers,
  vehicles,
  me,
  onClose,
  onEdit,
  onMove,
  onStatus,
  onAssign,
  onAssignVehicles,
  onDelete,
  properties,
  onLinkProperty,
  busy = false,
}: {
  occurrence: OccurrenceView | null;
  properties: PropertyOption[];
  onLinkProperty: (o: OccurrenceView, propertyId: string, sameCustomer: boolean) => Promise<void>;
  workers: WorkerOption[];
  vehicles: VehicleOption[];
  me: Actor;
  onClose: () => void;
  onEdit: (o: OccurrenceView) => void;
  onMove: (o: OccurrenceView) => void;
  onStatus: (o: OccurrenceView, status: string, reason?: string) => Promise<void>;
  onAssign: (o: OccurrenceView, ids: string[]) => Promise<void>;
  onAssignVehicles: (o: OccurrenceView, ids: string[]) => Promise<void>;
  onDelete: (o: OccurrenceView, scope: "ONE" | "FOLLOWING") => Promise<void>;
  busy?: boolean;
}) {
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [logs, setLogs] = useState<ChangeLogView[] | null>(null);
  const [loadingLogs, startLogs] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const workerUsage = useWorkerUsage(assignOpen ? (o?.date ?? null) : null, o?.id ?? null);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<VehicleUsage | null>(null);
  const [loadingUsage, startUsage] = useTransition();
  const [confirm, setConfirm] = useState<null | "delete">(null);
  const [deleteScope, setDeleteScope] = useState<"ONE" | "FOLLOWING">("ONE");

  const categories = useCategories();
  const open = !!o;
  useEffect(() => {
    if (!o) return;
    setTab("detail");
    setLogs(null);
    setAssignIds(o.assignees.map((a) => a.id));
    setVehicleIds(o.vehicles.map((v) => v.id));
    setUsage(null);
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 車両の変更モーダルを開いたら、同じ日の使用状況を取りに行く（日付が無い＝未割当なら不要）
  useEffect(() => {
    if (!vehicleOpen || !o) return;
    setVehicleIds(o.vehicles.map((v) => v.id));
    if (!o.date) {
      setUsage({});
      return;
    }
    const date = o.date;
    const id = o.id;
    startUsage(async () => {
      const r = await getVehicleUsage(date, id);
      setUsage(r.ok ? r.data.usage : {});
    });
  }, [vehicleOpen, o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const canReopen = can(me, "occurrence.status", { department: o.department, assigneeIds, nextStatus: "CONFIRMED" }) && (o.status === "DONE" || o.status === "CANCELLED");
  const t = timeLabel(o);
  const label = occurrenceLabels(o);
  const color = catColor(categories, o.category);
  // 日付が決まっていて、まだ終わっていない作業なのに車両が未選択 → 当日までに決める対象として目立たせる
  const vehicleMissing =
    o.vehicles.length === 0 && !!o.date && o.status !== "DONE" && o.status !== "CANCELLED" && !(NON_WORK_CATEGORIES as string[]).includes(o.category);

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-6">
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="予定の詳細"
          className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-float animate-slide-up md:max-h-[90dvh] md:max-w-xl md:rounded-3xl md:animate-scale-in"
        >
          {/* ヘッダ */}
          <div className="px-4 pt-3 md:px-6 md:pt-5">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong md:hidden" />
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <CategoryBadge category={o.category} />
                <OccurrenceStatusBadge status={o.status} />
                {isDepartment(o.department) && o.category !== "OFF" && <span className="text-xs font-semibold text-ink-muted">{DEPARTMENT_LABEL[o.department]}</span>}
              </div>
              <button type="button" onClick={onClose} aria-label="閉じる" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-sunken active:bg-surface-sunken">
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 className="break-words border-l-[3px] pl-2.5 text-xl font-bold leading-snug text-ink" style={{ borderColor: color }}>
              {label.primary}
              {label.extra && <span className="ml-1.5 text-base font-semibold text-ink-soft">{label.extra}</span>}
            </h2>
            {(label.site || label.siteMissing) && (
              <p className={cn("mt-1.5 flex items-start gap-1.5 text-[15px] font-semibold", label.site ? "text-ink-soft" : "text-ink-faint")}>
                <Building className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{label.site ?? "現場未設定"}</span>
              </p>
            )}
            {o.customerNameRaw && !o.customer && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">顧客「{o.customerNameRaw}」は台帳に見つかりませんでした。編集で顧客を選んでください。</p>
            )}
          </div>

          {/* タブ */}
          <div className="mt-3 flex border-b border-line px-4 md:px-6">
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
                className={cn("-mb-px min-h-[44px] border-b-2 px-3 text-[15px] font-bold", tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:px-6">
            {tab === "detail" ? (
              <div className="space-y-4">
                {/* 日時 */}
                <div className="rounded-xl bg-surface-subtle p-3">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
                    <Clock className="h-4 w-4 text-ink-muted" />
                    {o.date ? fmtKeyLong(o.date) : "日付未定"}
                    {o.endDate && o.endDate !== o.date && <span className="text-ink-soft">〜 {fmtKeyShort(o.endDate)}</span>}
                  </p>
                  <p className="mt-0.5 pl-6 text-[15px] text-ink-soft">
                    {t ?? "終日"}
                    {o.windowLabel && !o.date && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">{o.targetMonth.replace("-", "年")}月 {o.windowLabel}</span>}
                  </p>
                  {o.ruleKind && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 text-sm text-ink-muted">
                      <Repeat className="h-3.5 w-3.5" />
                      定期：{o.ruleSummary}
                      {o.property && (
                        <Link href={`/properties/${o.property.id}`} className="ml-1 inline-flex items-center gap-0.5 font-semibold text-brand-600">
                          現場 <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </p>
                  )}
                </div>

                {/* 現場 */}
                {!o.property && label.siteMissing && canEdit && <PropertyLinker key={o.id} o={o} properties={properties} onLink={onLinkProperty} busy={busy} />}
                {o.property && (
                  <div className="space-y-2 text-[15px]">
                    {o.property.address && (
                      <p className="flex items-start gap-2 text-ink-soft">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="flex-1">{o.property.address}</span>
                        <a href={mapSearchUrl(o.property.address)} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-bold text-brand-600">
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
                    <Link href={`/properties/${o.property.id}`} className="inline-flex min-h-[2.75rem] items-center gap-1 text-sm font-bold text-brand-600">
                      現場の詳細を見る <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {/* 数量など */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-ink-soft">
                  {o.unitCount != null && <span>{o.unitCount}件（部屋・箇所）</span>}
                  {o.headcount != null && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-ink-faint" />
                      {o.headcount}名
                    </span>
                  )}
                  {o.amount !== undefined && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">金額 {o.amount != null ? fmtYen(o.amount) : "未設定"}</span>
                  )}
                </div>

                {o.note && (
                  <p className="flex items-start gap-2 whitespace-pre-wrap rounded-xl bg-surface-subtle p-3 text-sm leading-relaxed text-ink-soft">
                    <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    <span>{o.note}</span>
                  </p>
                )}

                {/* 担当者 */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-base font-bold text-ink">担当者 {o.assignees.length > 0 && <span className="text-sm font-semibold tnum text-ink-muted">{o.assignees.length}名</span>}</p>
                    {canEdit && (
                      <button type="button" onClick={() => setAssignOpen(true)} className="-mr-2 min-h-[2.75rem] px-2 text-sm font-bold text-brand-600">
                        変更
                      </button>
                    )}
                  </div>
                  {o.assignees.length === 0 ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600">担当者が決まっていません</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {o.assignees.map((p) => (
                        <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-1 pl-1 pr-3 text-sm font-semibold text-ink">
                          <Avatar name={p.name} color={p.avatarColor} image={p.avatarUrl} size="sm" />
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 使用車両（休みなどの非作業種別では出さない） */}
                {!(NON_WORK_CATEGORIES as string[]).includes(o.category) && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-base font-bold text-ink">
                        <Car className="h-4 w-4 text-ink-muted" />
                        使用車両 {o.vehicles.length > 0 && <span className="text-sm font-semibold tnum text-ink-muted">{o.vehicles.length}台</span>}
                      </p>
                      {canEdit && (
                        <button type="button" onClick={() => setVehicleOpen(true)} className="-mr-2 min-h-[2.75rem] px-2 text-sm font-bold text-brand-600">
                          {o.vehicles.length === 0 ? "選ぶ" : "変更"}
                        </button>
                      )}
                    </div>
                    {o.vehicles.length === 0 ? (
                      <p className={cn("rounded-lg px-3 py-2.5 text-sm font-semibold", vehicleMissing ? "bg-amber-50 text-amber-700" : "bg-surface-subtle text-ink-muted")}>
                        {vehicleMissing ? "車両が決まっていません（当日までに選んでください）" : "車両は未選択"}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {o.vehicles.map((v) => (
                          <span key={v.id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-1.5 pl-2.5 pr-3 text-sm font-semibold text-ink">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: v.color }} />
                            {v.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 日報（日付があり、中止・休みでない予定） */}
                {isReportDue({ date: o.date, status: o.status, category: o.category }) && (
                  <OccurrenceReportPanel occurrenceId={o.id} me={me} refreshKey={`${o.version}-${o.assignees.map((a) => a.id).join(",")}`} />
                )}

                <p className="text-xs text-ink-faint">
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
                  <ol className="space-y-2.5">
                    {logs.map((l) => (
                      <li key={l.id} className="flex gap-2.5 border-b border-line pb-2.5 text-[15px] last:border-0">
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
                          {l.reason && <p className="text-sm text-ink-soft">理由：{l.reason}</p>}
                          <p className="text-xs text-ink-faint">
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
          <div className="border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
            <div className="flex flex-wrap gap-2">
              {canMove && (
                <Button type="button" variant="outline" onClick={() => onMove(o)} disabled={busy}>
                  <ArrowRightLeft className="h-4 w-4" /> 移動
                </Button>
              )}
              {canEdit && (
                <Button type="button" variant="outline" onClick={() => onEdit(o)} disabled={busy}>
                  <Pencil className="h-4 w-4" /> 編集
                </Button>
              )}
              {/* 完了のボタンは置かない：担当者の日報がそろうと自動で完了になる */}
              {canReopen && (
                <Button type="button" variant="outline" onClick={() => onStatus(o, o.date ? "CONFIRMED" : "UNASSIGNED")} disabled={busy}>
                  <Inbox className="h-4 w-4" /> 戻す
                </Button>
              )}
              {canDelete && (
                <Button type="button" variant="ghost" size="icon" aria-label="削除" className="ml-auto text-status-danger hover:bg-red-50" onClick={() => setConfirm("delete")} disabled={busy}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 担当者変更 */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="担当者を変更">
        <AssigneePicker workers={workers} value={assignIds} onChange={setAssignIds} department={o.department} usage={workerUsage.usage} loadingUsage={workerUsage.loading} />
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

      {/* 使用車両の変更 */}
      <Modal open={vehicleOpen} onClose={() => setVehicleOpen(false)} title="使用車両を選ぶ">
        {o.date && <p className="mb-3 text-sm text-ink-muted">{fmtKeyLong(o.date)} に使う車両を選びます。同じ日に他の予定でも使う車両には「同日」の印が付きます。</p>}
        <VehiclePicker vehicles={vehicles} value={vehicleIds} onChange={setVehicleIds} department={o.department} current={o.vehicles} usage={usage} loadingUsage={loadingUsage} />
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setVehicleOpen(false)}>
            キャンセル
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              await onAssignVehicles(o, vehicleIds);
              setVehicleOpen(false);
            }}
          >
            保存する
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
                  <input type="radio" checked={deleteScope === "FOLLOWING"} onChange={() => setDeleteScope("FOLLOWING")} /> 以降の未確定の回も削除し、定期を終了にする（現場も「終了」になります）
                </label>
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
