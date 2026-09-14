"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { updateAppSettings, type SettingsState } from "./actions";
import { Field, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

type Settings = {
  companyName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  invoiceNumber: string | null;
  defaultStartTime: string;
  defaultEndTime: string;
  generateDay: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" /> 設定を保存</>)}
    </button>
  );
}

export function AppSettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateAppSettings, {});
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-4">
        <p className="section-label">会社情報</p>
        <Field label="会社名" htmlFor="companyName">
          <Input id="companyName" name="companyName" defaultValue={settings.companyName ?? ""} placeholder="例：株式会社シンカワ" />
        </Field>
        <Field label="住所" htmlFor="companyAddress">
          <Input id="companyAddress" name="companyAddress" defaultValue={settings.companyAddress ?? ""} placeholder="例：埼玉県〇〇市…" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="電話番号" htmlFor="companyPhone">
            <Input id="companyPhone" name="companyPhone" defaultValue={settings.companyPhone ?? ""} placeholder="048-000-0000" />
          </Field>
          <Field label="インボイス登録番号" htmlFor="invoiceNumber">
            <Input id="invoiceNumber" name="invoiceNumber" defaultValue={settings.invoiceNumber ?? ""} placeholder="T0000000000000" />
          </Field>
        </div>
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <p className="section-label">予定の既定値</p>
        <p className="text-xs text-ink-muted">時刻を指定して予定を作るときの初期値です。</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="開始時刻の既定" htmlFor="defaultStartTime">
            <Input id="defaultStartTime" name="defaultStartTime" type="time" defaultValue={settings.defaultStartTime} />
          </Field>
          <Field label="終了時刻の既定" htmlFor="defaultEndTime">
            <Input id="defaultEndTime" name="defaultEndTime" type="time" defaultValue={settings.defaultEndTime} />
          </Field>
        </div>
      </div>

      <div className="space-y-4 border-t border-line pt-5">
        <p className="section-label">定期契約の自動生成</p>
        <p className="text-xs text-ink-muted">毎月この日に、翌月分の実施回を「未割当」として自動生成します（1〜28）。</p>
        <Field label="生成日" htmlFor="generateDay">
          <Input id="generateDay" name="generateDay" type="number" min={1} max={28} defaultValue={settings.generateDay} className="max-w-[8rem]" />
        </Field>
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />{state.error}
        </div>
      )}
      {state.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />設定を保存しました
        </div>
      )}
      <SubmitButton />
    </form>
  );
}
