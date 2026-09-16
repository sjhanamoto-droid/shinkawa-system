"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, Save, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import {
  CATEGORY,
  CATEGORY_OPTIONS,
  DEPARTMENT_LABEL,
  DEPARTMENT_OPTIONS,
  type CategoryKey,
  type Department,
} from "@/lib/constants";
import { AssigneePicker } from "./assignee-picker";
import { VehiclePicker } from "./vehicle-picker";
import { createOccurrence, updateOccurrence, getVehicleUsage } from "./actions";
import type { ActionResult, CustomerOption, OccurrenceInput, OccurrenceView, PropertyOption, VehicleOption, VehicleUsage, WorkerOption } from "./types";

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
  onSaved: (o: OccurrenceView) => void;
}) {
  const isEdit = !!occurrence;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [department, setDepartment] = useState<Department>(defaultDepartment);
  const [category, setCategory] = useState<CategoryKey>("REGULAR_CLEANING");
  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [undated, setUndated] = useState(false);
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

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (occurrence) {
      setDepartment((occurrence.department as Department) ?? defaultDepartment);
      setCategory((occurrence.category as CategoryKey) ?? "REGULAR_CLEANING");
      setCustomerId(occurrence.customer?.id ?? "");
      setPropertyId(occurrence.property?.id ?? "");
      setTitle(occurrence.customer || occurrence.property ? "" : occurrence.title);
      setUndated(!occurrence.date);
      setDate(occurrence.date ?? initialDate ?? "");
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
      setUndated(!initialDate);
      setDate(initialDate ?? "");
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
  }, [open, occurrence, initialDate, defaultDepartment, defaultTimes]);

  // 日付が決まっていれば、同じ日の車両の使用状況を取りに行く（重複の注意表示用）
  const usageDate = open && !undated && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
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
    const d = CATEGORY[category]?.department;
    if (d) setDepartment(d);
  }, [category]);

  const propertyOptions = useMemo(
    () => properties.filter((p) => !customerId || p.customerId === customerId),
    [properties, customerId],
  );
  const categoryOptions = CATEGORY_OPTIONS.filter((k) => !CATEGORY[k].department || CATEGORY[k].department === department);
  const isPersonal = category === "OFF";

  function submit() {
    setError(null);
    if (!undated && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
      date: undated ? null : date,
      endDate: !undated && multiDay && endDate ? endDate : null,
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
      const r: ActionResult<{ occurrence: OccurrenceView }> = occurrence
        ? await updateOccurrence(occurrence.id, input, occurrence.version)
        : await createOccurrence(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onSaved(r.data.occurrence);
      onClose();
    });
  }

  return (
    <Modal open={open} onClose={pending ? () => {} : onClose} title={isEdit ? "予定を編集" : "予定を追加"} className="sm:max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="部門" htmlFor="of-dept">
            <Select id="of-dept" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="種別" htmlFor="of-cat">
            <Select id="of-cat" value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)}>
              {categoryOptions.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY[k].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {!isPersonal && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="顧客" htmlFor="of-customer" hint="名前で検索">
              <SearchSelect
                id="of-customer"
                value={customerId}
                onChange={(v) => {
                  setCustomerId(v);
                  setPropertyId("");
                }}
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.shortName ? `${c.shortName}（${c.name}）` : c.name,
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

        <div className="rounded-xl border border-line bg-surface-subtle p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <input type="checkbox" checked={undated} onChange={(e) => setUndated(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
              日付未定（未割当レーンに置く）
            </label>
            {!undated && (
              <>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
                  複数日
                </label>
                <label className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="h-4 w-4 rounded border-line-strong text-brand-600" />
                  時刻を指定
                </label>
              </>
            )}
          </div>
          {!undated && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={multiDay ? "開始日" : "日付"} htmlFor="of-date" required>
                <Input id="of-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              {multiDay && (
                <Field label="終了日" htmlFor="of-end">
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
          )}
        </div>

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

        <Field label="担当者" hint={`${workerIds.length}名`}>
          <AssigneePicker workers={workers} value={workerIds} onChange={setWorkerIds} department={department} compact />
        </Field>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
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
