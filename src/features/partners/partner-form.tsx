"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle } from "lucide-react";
import { createPartner, updatePartner, type PartnerFormState } from "./actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { PARTNER_KIND_LABEL, PARTNER_KIND_OPTIONS, DEPARTMENT_LABEL, DEPARTMENT_OPTIONS } from "@/lib/constants";

export type PartnerFormValues = {
  id?: string;
  name?: string | null;
  kana?: string | null;
  kind?: string | null;
  department?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
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

export function PartnerForm({ partner }: { partner?: PartnerFormValues }) {
  const isEdit = Boolean(partner?.id);
  const [state, formAction] = useActionState<PartnerFormState, FormData>(isEdit ? updatePartner : createPartner, {});
  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={partner?.id} />}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="会社名" required htmlFor="name" className="sm:col-span-2">
            <Input id="name" name="name" defaultValue={partner?.name ?? ""} required placeholder="クリーンサポート埼玉" />
          </Field>
          <Field label="ふりがな" htmlFor="kana">
            <Input id="kana" name="kana" defaultValue={partner?.kana ?? ""} />
          </Field>
          <Field label="区分" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={partner?.kind ?? "PARTNER"}>
              {PARTNER_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{PARTNER_KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="主な部門" htmlFor="department">
            <Select id="department" name="department" defaultValue={partner?.department ?? ""}>
              <option value="">指定なし（両方）</option>
              {DEPARTMENT_OPTIONS.map((d) => (
                <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
          <Field label="窓口担当者" htmlFor="contactName">
            <Input id="contactName" name="contactName" defaultValue={partner?.contactName ?? ""} />
          </Field>
          <Field label="電話番号" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={partner?.phone ?? ""} />
          </Field>
          <Field label="メール" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={partner?.email ?? ""} />
          </Field>
          <Field label="住所" htmlFor="address" className="sm:col-span-2">
            <Input id="address" name="address" defaultValue={partner?.address ?? ""} />
          </Field>
          <Field label="メモ" htmlFor="memo" className="sm:col-span-2" hint="得意な作業・単価の目安（金額は権限者のみ閲覧）など">
            <Textarea id="memo" name="memo" defaultValue={partner?.memo ?? ""} />
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
