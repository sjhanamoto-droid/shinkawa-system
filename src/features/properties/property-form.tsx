"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, KeyRound, FileText, Camera } from "lucide-react";
import { createProperty, updateProperty, type PropertyFormState } from "./actions";
import { PropertyPhotoField, type PropertyPhotoInit } from "./property-photo-field";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PropertyFormValues = {
  id?: string;
  customerId?: string | null;
  name?: string | null;
  kana?: string | null;
  address?: string | null;
  building?: string | null;
  unitCount?: number | null;
  keyboxStatus?: string | null;
  keyboxNumber?: string | null;
  keyboxPlace?: string | null;
  keyboxNoneReason?: string | null;
  accessNote?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  handoverNote?: string | null;
  status?: string | null;
};

export type CustomerChoice = { id: string; name: string; shortName: string | null; kana?: string | null };

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" />{isEdit ? "変更を保存" : "物件を登録"}</>)}
    </button>
  );
}

export function PropertyForm({
  property,
  customers,
  photos,
}: {
  property?: PropertyFormValues;
  customers: CustomerChoice[];
  photos?: { keybox: PropertyPhotoInit[]; drawing: PropertyPhotoInit[]; survey: PropertyPhotoInit[] };
}) {
  const isEdit = Boolean(property?.id);
  const [state, formAction] = useActionState<PropertyFormState, FormData>(isEdit ? updateProperty : createProperty, {});
  const [keybox, setKeybox] = useState<string>(property?.keyboxStatus ?? "");
  const [customerId, setCustomerId] = useState<string>(property?.customerId ?? "");

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={property?.id} />}

      <section className="space-y-3">
        <SectionTitle>基本情報</SectionTitle>
        <Card className="space-y-3 p-4">
          <Field label="顧客（元請・管理会社）" required htmlFor="customerId" hint="名前・ふりがなで検索">
            <SearchSelect
              id="customerId"
              name="customerId"
              required
              value={customerId}
              onChange={(v) => setCustomerId(v)}
              options={customers.map((c) => ({
                value: c.id,
                label: c.shortName ? `${c.shortName}（${c.name}）` : c.name,
                keywords: c.kana ?? null,
              }))}
              placeholder="顧客名を入力して検索"
              emptyLabel="選択を解除"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="物件名" required htmlFor="name">
              <Input id="name" name="name" defaultValue={property?.name ?? ""} placeholder="○○マンション" required />
            </Field>
            <Field label="ふりがな" htmlFor="kana" hint="検索用">
              <Input id="kana" name="kana" defaultValue={property?.kana ?? ""} />
            </Field>
          </div>
          <Field label="住所" htmlFor="address">
            <Input id="address" name="address" defaultValue={property?.address ?? ""} placeholder="埼玉県○○市○○1-2-3" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="建物名・部屋番号など" htmlFor="building">
              <Input id="building" name="building" defaultValue={property?.building ?? ""} placeholder="A棟 / 101〜115号室" />
            </Field>
            <Field label="部屋数・箇所数" htmlFor="unitCount" hint="定期の1回あたり">
              <Input id="unitCount" name="unitCount" type="number" inputMode="numeric" min={0} max={999} defaultValue={property?.unitCount ?? ""} placeholder="15" />
            </Field>
          </div>
          {isEdit && (
            <Field label="ステータス" htmlFor="status">
              <Select id="status" name="status" defaultValue={property?.status ?? "ACTIVE"}>
                <option value="ACTIVE">稼働中</option>
                <option value="INACTIVE">終了</option>
              </Select>
            </Field>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            キーBOX・入館
          </span>
        </SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="flex gap-2">
            {[
              { v: "HAS", label: "キーBOXあり" },
              { v: "NONE", label: "なし" },
              { v: "", label: "未確認" },
            ].map((o) => (
              <label key={o.v} className={cn("flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold", keybox === o.v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft")}>
                <input type="radio" name="keyboxStatus" value={o.v} checked={keybox === o.v} onChange={() => setKeybox(o.v)} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
          {keybox === "HAS" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="キーBOX番号" htmlFor="keyboxNumber">
                <Input id="keyboxNumber" name="keyboxNumber" inputMode="numeric" defaultValue={property?.keyboxNumber ?? ""} placeholder="1234" />
              </Field>
              <Field label="設置場所" htmlFor="keyboxPlace">
                <Input id="keyboxPlace" name="keyboxPlace" defaultValue={property?.keyboxPlace ?? ""} placeholder="1階メーターボックス内" />
              </Field>
            </div>
          )}
          {keybox === "NONE" && (
            <Field label="鍵の受け渡し方法" htmlFor="keyboxNoneReason" required>
              <Input id="keyboxNoneReason" name="keyboxNoneReason" defaultValue={property?.keyboxNoneReason ?? ""} placeholder="管理人室で受け取り／管理会社から当日受領" />
            </Field>
          )}
          <Field label="キーBOX写真" hint="設置場所が分かる写真">
            <PropertyPhotoField name="keyboxPhotos" kind="KEYBOX" initial={photos?.keybox ?? []} buttonLabel="写真を追加" />
          </Field>
          <Field label="入館方法・駐車・注意事項" htmlFor="accessNote">
            <Textarea id="accessNote" name="accessNote" defaultValue={property?.accessNote ?? ""} placeholder="例：裏口から入館。駐車は敷地内2台まで。管理人さんに一声。" className="min-h-[80px]" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="現場の連絡先（氏名）" htmlFor="contactName">
              <Input id="contactName" name="contactName" defaultValue={property?.contactName ?? ""} placeholder="管理人 ○○さん" />
            </Field>
            <Field label="現場の連絡先（電話）" htmlFor="contactPhone">
              <Input id="contactPhone" name="contactPhone" type="tel" defaultValue={property?.contactPhone ?? ""} />
            </Field>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            図面・資料（PDF）
          </span>
        </SectionTitle>
        <Card className="p-4">
          <p className="mb-2 text-xs text-ink-muted">材料屋のシステムで消えてしまう図面や、見積書PDFをここに保存しておけます。</p>
          <PropertyPhotoField name="drawingPhotos" kind="DRAWING" allowPdf initial={photos?.drawing ?? []} buttonLabel="PDF・画像を追加" />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Camera className="h-4 w-4" />
            現調写真
          </span>
        </SectionTitle>
        <Card className="p-4">
          <PropertyPhotoField name="surveyPhotos" kind="SURVEY" initial={photos?.survey ?? []} buttonLabel="写真を追加" />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle>引き継ぎ・備考</SectionTitle>
        <Card className="p-4">
          <Field label="常時の申し送り" htmlFor="handoverNote" hint="毎回の作業で気を付けること">
            <Textarea id="handoverNote" name="handoverNote" defaultValue={property?.handoverNote ?? ""} placeholder="例：ワックスはA棟のみ。植木の水やりを頼まれることがある。" className="min-h-[80px]" />
          </Field>
        </Card>
      </section>

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
