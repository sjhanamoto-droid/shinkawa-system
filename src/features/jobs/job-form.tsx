"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle } from "lucide-react";
import { createJob, updateJob, type JobFormState } from "./actions";
import { RuleEditor } from "./rule-editor";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import {
  CATEGORY,
  CATEGORY_OPTIONS,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_OPTIONS,
  DEPARTMENT_LABEL,
  DEPARTMENT_OPTIONS,
  JOB_STATUS_LABEL,
  JOB_STATUS_OPTIONS,
  type CategoryKey,
  type ContractType,
  type Department,
  type RuleKind,
} from "@/lib/constants";
import type { RuleParams } from "@/lib/recurrence";

export type JobFormValues = {
  id?: string;
  propertyId?: string | null;
  customerId?: string | null;
  name?: string | null;
  department?: string | null;
  category?: string | null;
  contractType?: string | null;
  ruleKind?: string | null;
  ruleParams?: unknown;
  unitCount?: number | null;
  headcount?: number | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  vehicle?: string | null;
  amount?: number | null;
  note?: string | null;
  status?: string | null;
  startsOn?: string | null; // YYYY-MM-DD
  endsOn?: string | null;
};

export type PropertyChoice = { id: string; name: string; customerId: string; customerName: string };

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" />{isEdit ? "変更を保存" : "案件を登録"}</>)}
    </button>
  );
}

export function JobForm({
  job,
  properties,
  showAmount,
  currentMonth,
}: {
  job?: JobFormValues;
  properties: PropertyChoice[];
  showAmount: boolean;
  currentMonth: string;
}) {
  const isEdit = Boolean(job?.id);
  const [state, formAction] = useActionState<JobFormState, FormData>(isEdit ? updateJob : createJob, {});
  const [customerId, setCustomerId] = useState<string>(job?.customerId ?? properties.find((p) => p.id === job?.propertyId)?.customerId ?? "");
  const [propertyId, setPropertyId] = useState<string>(job?.propertyId ?? "");
  const [department, setDepartment] = useState<Department>((job?.department as Department) ?? "CLEANING");
  const [category, setCategory] = useState<CategoryKey>((job?.category as CategoryKey) ?? "REGULAR_CLEANING");
  const [contractType, setContractType] = useState<ContractType>((job?.contractType as ContractType) ?? "REGULAR");

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of properties) m.set(p.customerId, p.customerName);
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [properties]);
  const propertyOptions = properties.filter((p) => !customerId || p.customerId === customerId);
  const categoryOptions = CATEGORY_OPTIONS.filter((k) => !CATEGORY[k].department || CATEGORY[k].department === department);

  function onCategory(k: CategoryKey) {
    setCategory(k);
    const d = CATEGORY[k].department;
    if (d) setDepartment(d);
  }

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={job?.id} />}
      <section className="space-y-3">
        <SectionTitle>基本情報</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="顧客" htmlFor="job-customer" hint="物件の絞り込み用（名前で検索）">
              <SearchSelect
                id="job-customer"
                value={customerId}
                onChange={(v) => { setCustomerId(v); setPropertyId(""); }}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="顧客名で検索"
                emptyLabel="すべて"
              />
            </Field>
            <Field label="物件（現場）" htmlFor="propertyId" required hint="名前で検索">
              <SearchSelect
                id="propertyId"
                name="propertyId"
                required
                value={propertyId}
                onChange={(v) => { setPropertyId(v); const p = properties.find((x) => x.id === v); if (p) setCustomerId(p.customerId); }}
                options={propertyOptions.map((p) => ({ value: p.id, label: p.name, sub: p.customerName, keywords: p.customerName }))}
                placeholder="物件名で検索"
                emptyLabel="選択を解除"
              />
            </Field>
          </div>
          <Field label="案件名" htmlFor="name" required hint="例：共用部定期清掃 / 引渡し清掃 101号">
            <Input id="name" name="name" defaultValue={job?.name ?? ""} required maxLength={100} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="契約種別" htmlFor="contractType" required>
              <Select id="contractType" name="contractType" value={contractType} onChange={(e) => setContractType(e.target.value as ContractType)}>
                {CONTRACT_TYPE_OPTIONS.map((k) => (
                  <option key={k} value={k}>{CONTRACT_TYPE_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="部門" htmlFor="department" required>
              <Select id="department" name="department" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
                ))}
              </Select>
            </Field>
            <Field label="種別" htmlFor="category" required>
              <Select id="category" name="category" value={category} onChange={(e) => onCategory(e.target.value as CategoryKey)}>
                {categoryOptions.map((k) => (
                  <option key={k} value={k}>{CATEGORY[k].label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      </section>

      {contractType === "REGULAR" && (
        <section className="space-y-3">
          <SectionTitle>周期（定期契約）</SectionTitle>
          <Card className="p-4">
            <RuleEditor initialKind={(job?.ruleKind as RuleKind) ?? null} initialParams={(job?.ruleParams as RuleParams) ?? null} currentMonth={currentMonth} />
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>1回あたりの標準</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="人数" htmlFor="headcount">
              <Input id="headcount" name="headcount" type="number" min={0} max={99} defaultValue={job?.headcount ?? ""} placeholder="2" />
            </Field>
            <Field label="部屋数・箇所" htmlFor="unitCount">
              <Input id="unitCount" name="unitCount" type="number" min={0} max={999} defaultValue={job?.unitCount ?? ""} placeholder="15" />
            </Field>
            <Field label="開始時刻" htmlFor="defaultStartTime">
              <Input id="defaultStartTime" name="defaultStartTime" type="time" defaultValue={job?.defaultStartTime ?? ""} />
            </Field>
            <Field label="終了時刻" htmlFor="defaultEndTime">
              <Input id="defaultEndTime" name="defaultEndTime" type="time" defaultValue={job?.defaultEndTime ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="車両" htmlFor="vehicle">
              <Input id="vehicle" name="vehicle" defaultValue={job?.vehicle ?? ""} placeholder="ハイエース1" maxLength={50} />
            </Field>
            {showAmount && (
              <Field label="金額（税抜・円）" htmlFor="amount" hint="1回あたり。最高管理者・事務経理のみ表示">
                <Input id="amount" name="amount" type="number" min={0} defaultValue={job?.amount ?? ""} placeholder="25000" />
              </Field>
            )}
          </div>
          <Field label="メモ" htmlFor="note" hint="作業内容・注意点など">
            <Textarea id="note" name="note" defaultValue={job?.note ?? ""} className="min-h-[72px]" maxLength={2000} />
          </Field>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>契約期間・状態</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="契約開始" htmlFor="startsOn" hint="任意">
              <Input id="startsOn" name="startsOn" type="date" defaultValue={job?.startsOn ?? ""} />
            </Field>
            <Field label="契約終了" htmlFor="endsOn" hint="任意">
              <Input id="endsOn" name="endsOn" type="date" defaultValue={job?.endsOn ?? ""} />
            </Field>
            <Field label="状態" htmlFor="status">
              <Select id="status" name="status" defaultValue={job?.status ?? "ACTIVE"}>
                {JOB_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      </section>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}
      <SubmitButton isEdit={isEdit} />
    </form>
  );
}
