"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle } from "lucide-react";
import { createVehicle, updateVehicle, type VehicleFormState } from "./actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker } from "@/features/settings/color-picker";
import { DEPARTMENT_LABEL, DEPARTMENT_OPTIONS } from "@/lib/constants";

export type VehicleFormValues = {
  id?: string;
  name?: string | null;
  plateNumber?: string | null;
  vehicleType?: string | null;
  department?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  memo?: string | null;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" />{isEdit ? "変更を保存" : "登録する"}</>)}
    </button>
  );
}

export function VehicleForm({ vehicle }: { vehicle?: VehicleFormValues }) {
  const isEdit = Boolean(vehicle?.id);
  const [state, formAction] = useActionState<VehicleFormState, FormData>(isEdit ? updateVehicle : createVehicle, {});
  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={vehicle?.id} />}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="車両名（呼び名）" required htmlFor="name" hint="カレンダーに出る名前" className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={vehicle?.name ?? ""} required maxLength={50} placeholder="ハイエース1" />
          </Field>
          <Field label="車種" htmlFor="vehicleType">
            <Input id="vehicleType" name="vehicleType" defaultValue={vehicle?.vehicleType ?? ""} maxLength={50} placeholder="ハイエース／軽バン／2tトラック" />
          </Field>
          <Field label="ナンバー" htmlFor="plateNumber">
            <Input id="plateNumber" name="plateNumber" defaultValue={vehicle?.plateNumber ?? ""} maxLength={50} placeholder="春日部 400 あ 12-34" />
          </Field>
          <Field label="主な部門" htmlFor="department" hint="選ぶと、その部門の予定で先頭に出ます">
            <Select id="department" name="department" defaultValue={vehicle?.department ?? ""}>
              <option value="">指定なし（共用）</option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
          <Field label="表示順" htmlFor="sortOrder" hint="小さい順に並びます">
            <Input id="sortOrder" name="sortOrder" type="number" inputMode="numeric" min={0} max={9999} defaultValue={vehicle?.sortOrder ?? 0} />
          </Field>
          <Field label="色" className="sm:col-span-2" hint="カレンダーのチップに付く色">
            <ColorPicker name="color" defaultValue={vehicle?.color ?? undefined} />
          </Field>
          <Field label="メモ" htmlFor="memo" className="sm:col-span-2" hint="積載物・車検の時期・注意点など">
            <Textarea id="memo" name="memo" defaultValue={vehicle?.memo ?? ""} maxLength={2000} />
          </Field>
        </div>
      </Card>
      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}
      <SubmitButton isEdit={isEdit} />
    </form>
  );
}
