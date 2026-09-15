"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, ChevronDown } from "lucide-react";
import { createCustomer, updateCustomer, type CustomerFormState } from "./actions";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import {
  REGISTRATION_TYPE_LABEL,
  REGISTRATION_TYPE_OPTIONS,
  TRADE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  type TradeStatus,
  type PaymentMethod,
} from "@/lib/constants";

export type CustomerFormValues = {
  id?: string;
  name?: string | null;
  shortName?: string | null;
  kana?: string | null;
  registrationType?: string | null;
  tradeStatus?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  headOfficeAddress?: string | null;
  billingAddress?: string | null;
  closingDay?: string | null;
  paymentDueTerm?: string | null;
  paymentMethod?: string | null;
  memo?: string | null;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" />{isEdit ? "変更を保存" : "顧客を登録"}</>)}
    </button>
  );
}

/**
 * 顧客フォーム。表に出すのは「顧客名」「短縮名」「メモ」。他は「詳細情報（任意）」に畳む。
 */
export function CustomerForm({ customer }: { customer?: CustomerFormValues }) {
  const isEdit = Boolean(customer?.id);
  const action = isEdit ? updateCustomer : createCustomer;
  const [state, formAction] = useActionState<CustomerFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={customer?.id} />}

      <section className="space-y-3">
        <SectionTitle>基本情報</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="顧客名" required htmlFor="name">
            <Input id="name" name="name" defaultValue={customer?.name ?? ""} placeholder="株式会社○○不動産" required />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="短縮名" htmlFor="shortName" hint="カレンダーのチップに表示（例：グリーンランド）">
              <Input id="shortName" name="shortName" defaultValue={customer?.shortName ?? ""} placeholder="グリーンランド" maxLength={20} />
            </Field>
            <Field label="ふりがな" htmlFor="kana" hint="検索用">
              <Input id="kana" name="kana" defaultValue={customer?.kana ?? ""} placeholder="ぐりーんらんど" />
            </Field>
          </div>
          <Field label="メモ" htmlFor="memo">
            <Textarea id="memo" name="memo" defaultValue={customer?.memo ?? ""} placeholder="担当者の連絡先・特記事項など" />
          </Field>
        </Card>
      </section>

      <details className="group rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-ink-soft [&::-webkit-details-marker]:hidden">
          詳細情報（任意）
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-line p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="区分" htmlFor="registrationType">
              <Select id="registrationType" name="registrationType" defaultValue={customer?.registrationType ?? "PRIME"}>
                {REGISTRATION_TYPE_OPTIONS.map((k) => (
                  <option key={k} value={k}>{REGISTRATION_TYPE_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="取引ステータス" htmlFor="tradeStatus">
              <Select id="tradeStatus" name="tradeStatus" defaultValue={customer?.tradeStatus ?? "CONTINUING"}>
                {(Object.keys(TRADE_STATUS_LABEL) as TradeStatus[]).map((k) => (
                  <option key={k} value={k}>{TRADE_STATUS_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="電話番号" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ""} placeholder="048-000-0000" />
            </Field>
            <Field label="FAX" htmlFor="fax">
              <Input id="fax" name="fax" type="tel" defaultValue={customer?.fax ?? ""} />
            </Field>
            <Field label="メールアドレス" htmlFor="email" className="sm:col-span-2">
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="info@example.com" />
            </Field>
          </div>

          <Field label="本社住所" htmlFor="headOfficeAddress">
            <Textarea id="headOfficeAddress" name="headOfficeAddress" defaultValue={customer?.headOfficeAddress ?? ""} placeholder="埼玉県○○市..." className="min-h-[64px]" />
          </Field>
          <Field label="請求書送付先住所" hint="本社と異なる場合" htmlFor="billingAddress">
            <Textarea id="billingAddress" name="billingAddress" defaultValue={customer?.billingAddress ?? ""} placeholder="本社と同じ場合は空欄" className="min-h-[64px]" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="締め日" htmlFor="closingDay">
              <Input id="closingDay" name="closingDay" defaultValue={customer?.closingDay ?? ""} placeholder="末締め" />
            </Field>
            <Field label="支払期日" htmlFor="paymentDueTerm">
              <Input id="paymentDueTerm" name="paymentDueTerm" defaultValue={customer?.paymentDueTerm ?? ""} placeholder="翌月末払い" />
            </Field>
            <Field label="支払方法" htmlFor="paymentMethod">
              <Select id="paymentMethod" name="paymentMethod" defaultValue={customer?.paymentMethod ?? ""}>
                <option value="">未設定</option>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => (
                  <option key={k} value={k}>{PAYMENT_METHOD_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </details>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <SubmitButton isEdit={isEdit} />
    </form>
  );
}
