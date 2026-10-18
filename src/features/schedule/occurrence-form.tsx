"use client";

import { useCategories } from "@/components/category-provider";
import { catDepartment, defaultCategoryFor, selectableCategories } from "@/lib/categories";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, Save, Plus, Building, Check, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SectionTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import {
  DEPARTMENT_LABEL,
  DEPARTMENT_OPTIONS,
  type Department,
} from "@/lib/constants";
import { AssigneePicker, useWorkerUsage } from "./assignee-picker";
import { VehiclePicker } from "./vehicle-picker";
import { createOccurrence, updateOccurrence, getVehicleUsage, getUnassigned } from "./actions";
import { jstDateKey } from "@/lib/date";
import { ymOf } from "./filters";
import type { ActionResult, CustomerOption, OccurrenceInput, OccurrenceView, PropertyOption, VehicleOption, VehicleUsage, WorkerOption } from "./types";

// 日時の切り替え（押しやすい高さ 44px のチップ）
function toggleClass(on: boolean): string {
  return cn(
    "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors",
    on ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" : "border-line-strong bg-surface text-ink",
  );
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function OccurrenceForm({
  open,
  onClose,
  occurrence,
  initialDate,
  customers,
  properties,
  workers,
  vehicles,
  showAmount,
  defaultDepartment,
  defaultTimes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  occurrence: OccurrenceView | null; // null = 新規
  initialDate: string | null;
  customers: CustomerOption[];
  properties: PropertyOption[];
  workers: WorkerOption[];
  vehicles: VehicleOption[];
  showAmount: boolean;
  defaultDepartment: Department;
  defaultTimes: { start: string; end: string };
  /** all＝連続工事を1日ずつに分けて作ったときの全日（1日だけなら [o]） */
  onSaved: (o: OccurrenceView, all: OccurrenceView[]) => void;
}) {
  const categories = useCategories();
  const isEdit = !!occurrence;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [department, setDepartment] = useState<Department>(defaultDepartment);
  const [category, setCategory] = useState<string>("REGULAR_CLEANING");
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [timed, setTimed] = useState(false);
  const [startTime, setStartTime] = useState(defaultTimes.start);
  const [endTime, setEndTime] = useState(defaultTimes.end);
  const [headcount, setHeadcount] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<VehicleUsage | null>(null);
  const [loadingUsage, startUsage] = useTransition();
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const workerUsage = useWorkerUsage(open ? date : null, occurrence?.id ?? null);
  // 未割当（日付が決まっていない定期の回など）から選んだ回。保存するとその回に日付を入れる
  const [slotId, setSlotId] = useState("");
  const [slots, setSlots] = useState<OccurrenceView[] | null>(null);
  const [loadingSlots, startSlots] = useTransition();

  // 入力欄の初期化は「開いたとき」だけ。カレンダーは定期的・タブ復帰時に再取得していて、そのたびに
  // defaultTimes などの props が作り直されるため、props を依存にすると入力中の内容が消えてしまう。
  const openKey = open ? `${occurrence?.id ?? "new"}:${initialDate ?? ""}` : null;
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSlotId("");
    if (occurrence) {
      setDepartment((occurrence.department as Department) ?? defaultDepartment);
      setCategory(occurrence.category ?? "REGULAR_CLEANING");
      setCustomerId(occurrence.customer?.id ?? "");
      setPropertyId(occurrence.property?.id ?? "");
      setTitle(occurrence.customer || occurrence.property ? "" : occurrence.title);
      setDate(occurrence.date ?? initialDate ?? jstDateKey());
      setMultiDay(!!occurrence.endDate);
      setEndDate(occurrence.endDate ?? "");
      setTimed(!!occurrence.startTime);
      setStartTime(occurrence.startTime ?? defaultTimes.start);
      setEndTime(occurrence.endTime ?? defaultTimes.end);
      setHeadcount(occurrence.headcount?.toString() ?? "");
      setUnitCount(occurrence.unitCount?.toString() ?? "");
      setVehicleIds(occurrence.vehicles.map((v) => v.id));
      setNote(occurrence.note ?? "");
      setAmount(occurrence.amount != null ? String(occurrence.amount) : "");
      setWorkerIds(occurrence.assignees.map((a) => a.id));
    } else {
      setDepartment(defaultDepartment);
      setCategory(defaultDepartment === "CONSTRUCTION" ? "INTERIOR" : "REGULAR_CLEANING");
      setCustomerId("");
      setPropertyId("");
      setTitle("");
      setDate(initialDate ?? jstDateKey());
      setMultiDay(false);
      setEndDate("");
      setTimed(false);
      setStartTime(defaultTimes.start);
      setEndTime(defaultTimes.end);
      setHeadcount("");
      setUnitCount("");
      setVehicleIds([]);
      setNote("");
      setAmount("");
      setWorkerIds([]);
    }
  }, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 日付が決まっていれば、同じ日の車両の使用状況を取りに行く（重複の注意表示用）
  const usageDate = open && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  useEffect(() => {
    if (!usageDate) {
      setUsage(null);
      return;
    }
    const excludeId = occurrence?.id ?? null;
    startUsage(async () => {
      const r = await getVehicleUsage(usageDate, excludeId);
      setUsage(r.ok ? r.data.usage : {});
    });
  }, [usageDate, occurrence?.id]);

  // 種別に部門が決まっていれば追従
  useEffect(() => {
    const d = catDepartment(categories, category);
    if (d) setDepartment(d);
  }, [category, categories]);

  const propertyOptions = useMemo(
    () => properties.filter((p) => !customerId || p.customerId === customerId),
    [properties, customerId],
  );
  // 休みは部門の選択肢（クリーニング／工事／休み）で選ぶので、種別の選択肢からは外す
  const categoryOptions = selectableCategories(categories, { department, current: occurrence?.category, excludeOff: true });
  const isPersonal = category === "OFF";

  // 新規のときは、日付の月の未割当を取りに行き、選んでいる種別のものを候補に出す
  const month = /^\d{4}-\d{2}-\d{2}$/.test(date) ? ymOf(date) : null;
  useEffect(() => {
    if (!open || isEdit || !month) {
      setSlots(null);
      return;
    }
    startSlots(async () => {
      const r = await getUnassigned(month);
      setSlots(r.ok ? r.data.items : []);
    });
  }, [open, isEdit, month]);
  const slotOptions = (slots ?? []).filter((o) => o.category === category && (slotId || !customerId || o.customer?.id === customerId));
  const slot = slotOptions.find((o) => o.id === slotId) ?? null;
  // 複数日（1日ずつに分けて作る）は新規のときだけ。未割当の回を選んだときは1日。旧データの複数日の予定の編集は従来どおり
  const canMultiDay = occurrence ? !!occurrence.endDate : !slot;

  function pickSlot(o: OccurrenceView) {
    if (o.id === slotId) {
      setSlotId("");
      return;
    }
    setSlotId(o.id);
    setCustomerId(o.customer?.id ?? "");
    setPropertyId(o.property?.id ?? "");
    setTitle("");
    setHeadcount(o.headcount?.toString() ?? "");
    setUnitCount(o.unitCount?.toString() ?? "");
    setNote(o.note ?? "");
    setVehicleIds(o.vehicles.map((v) => v.id));
    if (o.assignees.length) setWorkerIds(o.assignees.map((a) => a.id));
    if (o.startTime) {
      setTimed(true);
      setStartTime(o.startTime);
      setEndTime(o.endTime ?? defaultTimes.end);
    }
    if (showAmount && o.amount != null) setAmount(String(o.amount));
  }

  // 部門で「休み」を選んだら種別を休みに。部門の値は前のまま（休みにも部門の値が要るため）
  function changeDepartment(v: string) {
    if (v === "OFF") {
      setCategory("OFF");
      return;
    }
    setDepartment(v as Department);
    // 休みから戻したとき、または今の種別がほかの部門の種別のときは、その部門の最初の種別にする
    // （そのままだと画面は別の種別を出しているのに、保存で「◯◯部門の種別です」のエラーになる）
    const catDept = catDepartment(categories, category);
    if (isPersonal || (catDept && catDept !== v)) setCategory(defaultCategoryFor(categories, v as Department));
  }

  function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("日付を入力してください");
      return;
    }
    if (!isPersonal && !customerId && !propertyId && !title.trim()) {
      setError("顧客・物件、または件名を入力してください");
      return;
    }
    const input: OccurrenceInput = {
      department,
      category,
      customerId: customerId || null,
      propertyId: propertyId || null,
      title: title.trim() || null,
      date,
      endDate: canMultiDay && multiDay && endDate ? endDate : null,
      startTime: timed ? startTime : null,
      endTime: timed ? endTime : null,
      headcount: numOrNull(headcount),
      unitCount: numOrNull(unitCount),
      vehicleIds: isPersonal ? [] : vehicleIds,
      note: note.trim() || null,
      workerIds,
    };
    if (showAmount) input.amount = numOrNull(amount);
    start(async () => {
      const target = occurrence ?? slot;
      const r: ActionResult<{ occurrence: OccurrenceView; occurrences?: OccurrenceView[] }> = target
        ? await updateOccurrence(target.id, input, target.version)
        : await createOccurrence(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSaved(r.data.occurrence, r.data.occurrences ?? [r.data.occurrence]);
      onClose();
    });
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title={isEdit ? "予定を編集" : "予定を追加"} className="bg-surface-subtle sm:max-w-2xl">
      <div className="space-y-4">
        {/* ── 種別 ── */}
        <section className="card space-y-4 p-4">
          <SectionTitle size="sm" className="px-0">種別</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="部門" htmlFor="of-dept">
              <Select id="of-dept" value={isPersonal ? "OFF" : department} onChange={(e) => changeDepartment(e.target.value)}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABEL[d]}
                  </option>
                ))}
                <option value="OFF">休み</option>
              </Select>
            </Field>
            {!isPersonal && (
              <Field label="種別" htmlFor="of-cat">
                <Select id="of-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categoryOptions.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </section>

        {/* ── 顧客・物件 ── */}
        <section className="card space-y-4 p-4">
          <SectionTitle size="sm" className="px-0">{isPersonal ? "予定" : "顧客・物件"}</SectionTitle>
          {!isEdit && !isPersonal && month && (loadingSlots || slotOptions.length > 0) && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                未割当の現場から選ぶ
                <span className="font-normal text-ink-muted">（{Number(month.slice(5))}月・{slotOptions.length}件）</span>
                {loadingSlots && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" aria-hidden />}
              </p>
              <div className="max-h-60 space-y-1.5 overflow-y-auto">
                {slotOptions.map((o) => {
                  const on = o.id === slotId;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => pickSlot(o)}
                      aria-pressed={on}
                      className={cn(
                        "flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        on ? "border-brand-400 bg-brand-50 dark:bg-brand-950/40" : "border-line-strong bg-surface hover:bg-surface-subtle",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-semibold text-ink">{o.customer?.name ?? o.title}</span>
                        {o.property && (
                          <span className="flex items-center gap-1 text-xs text-ink-soft">
                            <Building className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="break-words">{o.property.name}</span>
                          </span>
                        )}
                      </span>
                      {o.windowLabel && <span className="shrink-0 text-xs text-ink-muted">{o.windowLabel}</span>}
                      {on && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-ink-muted">選ぶと、その回に下の日付を入れます。新しく予定を作るときは選ばずに入力してください。</p>
            </div>
          )}
          {!isPersonal && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="顧客" htmlFor="of-customer" hint="名前で検索">
                <SearchSelect
                  id="of-customer"
                  value={customerId}
                  onChange={(v) => {
                    setCustomerId(v);
                    setPropertyId("");
                    setSlotId("");
                  }}
                  options={customers.map((c) => ({
                    value: c.id,
                    label: c.name,
                    keywords: c.kana ?? null,
                  }))}
                  placeholder="顧客名で検索"
                  emptyLabel="未選択"
                />
              </Field>
              <Field label="物件" htmlFor="of-property" hint={customerId ? "名前で検索" : "顧客を選ぶと絞り込まれます"}>
                <SearchSelect
                  id="of-property"
                  value={propertyId}
                  onChange={(pid) => {
                    setPropertyId(pid);
                    setSlotId("");
                    const p = properties.find((x) => x.id === pid);
                    if (p) setCustomerId(p.customerId);
                  }}
                  options={propertyOptions.map((p) => ({ value: p.id, label: p.name, sub: p.address ?? null }))}
                  placeholder="物件名で検索"
                  emptyLabel="未選択"
                />
              </Field>
            </div>
          )}
          <Field label={isPersonal ? "件名" : "件名（顧客・物件が無いときの表示名）"} htmlFor="of-title" hint="任意">
            <Input id="of-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isPersonal ? "例：休み" : "例：直井さん 1人"} maxLength={100} />
          </Field>
        </section>

        {/* ── 日時 ── */}
        <section className="card space-y-4 p-4">
          <SectionTitle size="sm" className="px-0">日時</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {/* 複数日は新しく入れるときだけ（保存すると1日ずつの予定に分かれる）。旧データの複数日の予定を直すときは出す */}
            {canMultiDay && (
              <label className={toggleClass(multiDay)}>
                <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
                複数日
              </label>
            )}
            <label className={toggleClass(timed)}>
              <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
              時刻を指定
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={canMultiDay && multiDay ? "開始日" : "日付"} htmlFor="of-date" required>
              <Input id="of-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {canMultiDay && multiDay && (
              <Field label="終了日" htmlFor="of-end" hint="保存すると1日ずつの予定に分かれます">
                <Input id="of-end" type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            )}
            {timed && (
              <>
                <Field label="開始" htmlFor="of-start">
                  <Input id="of-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </Field>
                <Field label="終了" htmlFor="of-endtime">
                  <Input id="of-endtime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </>
            )}
          </div>
        </section>

        {/* ── 作業の内容 ── */}
        <section className="card space-y-4 p-4">
          <SectionTitle size="sm" className="px-0">内容</SectionTitle>
          {!isPersonal && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="人数" htmlFor="of-head">
                  <Input id="of-head" type="number" inputMode="numeric" min={0} max={99} value={headcount} onChange={(e) => setHeadcount(e.target.value)} placeholder="例：2" />
                </Field>
                <Field label="部屋数・箇所" htmlFor="of-unit">
                  <Input id="of-unit" type="number" inputMode="numeric" min={0} max={999} value={unitCount} onChange={(e) => setUnitCount(e.target.value)} placeholder="例：15" />
                </Field>
              </div>
              <Field label="使用車両" hint={vehicleIds.length ? `${vehicleIds.length}台` : "当日までに選べばOK"}>
                <VehiclePicker vehicles={vehicles} value={vehicleIds} onChange={setVehicleIds} department={department} current={occurrence?.vehicles ?? []} usage={usage} loadingUsage={loadingUsage} />
              </Field>
            </>
          )}

          {showAmount && !isPersonal && (
            <Field label="金額（税抜・円）" htmlFor="of-amount" hint="最高管理者・事務経理のみ表示">
              <Input id="of-amount" type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例：25000" />
            </Field>
          )}

          <Field label="メモ" htmlFor="of-note">
            <Textarea id="of-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="連絡事項・注意点など" maxLength={2000} className="min-h-[72px]" />
          </Field>
        </section>

        {/* ── 担当者 ── */}
        <section className="card space-y-3 p-4">
          <SectionTitle
            size="sm"
            className="px-0"
            action={
              workerIds.length > 0 ? (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">{workerIds.length}名</span>
              ) : undefined
            }
          >
            {isPersonal ? "休む人" : "担当者"}
          </SectionTitle>
          <AssigneePicker workers={workers} value={workerIds} onChange={setWorkerIds} department={department} compact usage={workerUsage.usage} loadingUsage={workerUsage.loading} />
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button type="button" className="flex-1" onClick={submit} disabled={pending}>
            {pending ? "保存中..." : isEdit ? (
              <>
                <Save className="h-4 w-4" /> 保存する
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> 追加する
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
