"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save, AlertCircle, KeyRound, FileText, ChevronDown, Briefcase, Lock } from "lucide-react";
import { createProperty, updateProperty, type PropertyFormState } from "./actions";
import { PropertyPhotoField, type PropertyPhotoInit } from "./property-photo-field";
import { RuleEditor } from "@/features/jobs/rule-editor";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { SearchSelect } from "@/components/ui/search-select";
import { Card, SectionTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CATEGORY,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPE_OPTIONS,
  DEPARTMENT_LABEL,
  DEPARTMENT_OPTIONS,
  PROPERTY_STATUS_LABEL,
  PROPERTY_STATUS_OPTIONS,
  WORK_CATEGORY_OPTIONS,
  defaultContractTypeFor,
  isContractType,
  isCategory,
  isDepartment,
  isRuleKind,
  type CategoryKey,
  type ContractType,
  type Department,
} from "@/lib/constants";
import type { RuleParams } from "@/lib/recurrence";

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

/** 現場の作業内容（保存先は現場にぶら下がる Job） */
export type WorkFormValues = {
  department?: string | null;
  category?: string | null;
  contractType?: string | null;
  ruleKind?: string | null;
  ruleParams?: unknown;
  startMonth?: string | null; // YYYY-MM
  workStart?: string | null; // YYYY-MM-DD（工事）
  workEnd?: string | null;
  headcount?: number | null;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  vehicleId?: string | null;
  amount?: number | null;
  occurrenceCount?: number;
};

const DEFAULT_CATEGORY: Record<Department, CategoryKey> = { CLEANING: "REGULAR_CLEANING", CONSTRUCTION: "INTERIOR" };

export type CustomerChoice = { id: string; name: string; shortName: string | null; kana?: string | null };
export type VehicleChoice = { id: string; name: string; vehicleType: string | null; active: boolean };

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : (<><Save className="h-5 w-5" />{isEdit ? "変更を保存" : "現場を登録"}</>)}
    </button>
  );
}

/** 大きめのボタン型ラジオ（スマホで1タップで選べるように） */
function ChoiceButton({ name, value, checked, onChange, children, color, size = "md" }: { name: string; value: string; checked: boolean; onChange: () => void; children: React.ReactNode; color?: string; size?: "md" | "sm" }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition-colors",
        size === "md" ? "h-12 flex-1" : "h-10 px-3",
        checked ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </label>
  );
}

/** 折りたたみセクション（閉じていても中の入力は送信される） */
function Collapsible({ title, icon, defaultOpen, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="flex-1">{title}</span>
        <span className="text-xs font-medium text-ink-muted group-open:hidden">あとで入力してもOK</span>
        <ChevronDown className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-line p-4">{children}</div>
    </details>
  );
}

export function PropertyForm({
  property,
  work,
  workEditable = true,
  workSummary,
  customers,
  vehicles,
  showAmount,
  currentMonth,
  photos,
  copiedFrom,
}: {
  property?: PropertyFormValues;
  work?: WorkFormValues | null;
  /** 他部門の作業を持つ現場を手配担当が開いたときは false（作業内容は表示のみ） */
  workEditable?: boolean;
  workSummary?: string;
  customers: CustomerChoice[];
  vehicles: VehicleChoice[];
  showAmount: boolean;
  currentMonth: string;
  photos?: { keybox: PropertyPhotoInit[]; drawing: PropertyPhotoInit[]; survey: PropertyPhotoInit[] };
  copiedFrom?: string;
}) {
  const isEdit = Boolean(property?.id);
  const hasWork = Boolean(work?.department);
  const [state, formAction] = useActionState<PropertyFormState, FormData>(isEdit ? updateProperty : createProperty, {});
  const [keybox, setKeybox] = useState<string>(property?.keyboxStatus ?? "");
  const [customerId, setCustomerId] = useState<string>(property?.customerId ?? "");
  const [status, setStatus] = useState<string>(property?.status ?? "ACTIVE");

  const initialDept: Department | "" = isDepartment(work?.department) ? work.department : "";
  const initialCategory: CategoryKey | "" = isCategory(work?.category) ? work.category : initialDept ? DEFAULT_CATEGORY[initialDept] : "";
  const [department, setDepartment] = useState<Department | "">(initialDept);
  const [category, setCategory] = useState<CategoryKey | "">(initialCategory);
  const [contractType, setContractType] = useState<ContractType | "">(
    isContractType(work?.contractType) ? work.contractType : initialCategory ? defaultContractTypeFor(initialCategory) : "",
  );
  const [addToCalendar, setAddToCalendar] = useState<boolean>(!isEdit);

  const categoryOptions = WORK_CATEGORY_OPTIONS.filter((k) => !CATEGORY[k].department || CATEGORY[k].department === department);
  const occurrenceCount = work?.occurrenceCount ?? 0;

  function onDepartment(d: Department) {
    setDepartment(d);
    // 部門に合わない種別は選び直し。未選択なら部門の代表的な種別を入れておく
    const next = category && (!CATEGORY[category].department || CATEGORY[category].department === d) ? category : DEFAULT_CATEGORY[d];
    setCategory(next);
    setContractType(defaultContractTypeFor(next));
  }
  function onCategory(k: CategoryKey) {
    setCategory(k);
    setContractType(defaultContractTypeFor(k));
  }

  const calendarLabel =
    contractType === "REGULAR"
      ? isEdit ? "保存と同時に、開始月から2か月分の予定を作る" : "登録と同時に、開始月から2か月分の予定を作る"
      : "カレンダーに予定を1件入れる（日付が未定なら「未割当」に入ります）";

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={property?.id} />}
      {copiedFrom && (
        <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
          「{copiedFrom}」の住所・キーBOX・入館メモなどをコピーしています。作業内容を選んで登録してください。
        </p>
      )}

      {/* ① 基本情報 */}
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
            <Field label="現場名" required htmlFor="name">
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
            <Field label="部屋数・箇所数" htmlFor="unitCount" hint="1回あたり">
              <Input id="unitCount" name="unitCount" type="number" inputMode="numeric" min={0} max={999} defaultValue={property?.unitCount ?? ""} placeholder="15" />
            </Field>
          </div>
        </Card>
      </section>

      {/* ② 作業内容 */}
      <section className="space-y-3">
        <SectionTitle>
          <span className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" />
            作業内容
          </span>
        </SectionTitle>
        {!workEditable ? (
          <Card className="p-4">
            <p className="text-sm font-bold text-ink">{workSummary ?? "—"}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <Lock className="h-3.5 w-3.5" />
              担当部門の手配担当・事務だけが作業内容を変更できます
            </p>
          </Card>
        ) : (
          <Card className="space-y-4 p-4">
            <Field label="部門" required={!isEdit || hasWork} hint={isEdit && !hasWork ? "未設定のままでも保存できます" : undefined}>
              <div className="flex gap-2">
                {DEPARTMENT_OPTIONS.map((d) => (
                  <ChoiceButton key={d} name="workDepartment" value={d} checked={department === d} onChange={() => onDepartment(d)}>
                    {DEPARTMENT_LABEL[d]}
                  </ChoiceButton>
                ))}
              </div>
            </Field>

            {department && (
              <>
                <Field label="種別" required>
                  <div className="flex flex-wrap gap-1.5">
                    {categoryOptions.map((k) => (
                      <ChoiceButton key={k} name="category" value={k} checked={category === k} onChange={() => onCategory(k)} color={CATEGORY[k].color} size="sm">
                        {CATEGORY[k].label}
                      </ChoiceButton>
                    ))}
                  </div>
                </Field>

                <Field label="頻度" required hint="種別に合わせて自動で選ばれます（変更もできます）">
                  <div className="flex gap-2">
                    {CONTRACT_TYPE_OPTIONS.map((c) => (
                      <ChoiceButton key={c} name="contractType" value={c} checked={contractType === c} onChange={() => setContractType(c)}>
                        {CONTRACT_TYPE_LABEL[c]}
                      </ChoiceButton>
                    ))}
                  </div>
                </Field>

                {contractType === "REGULAR" && (
                  <div className="space-y-3 rounded-xl border border-line p-3">
                    <RuleEditor
                      initialKind={isRuleKind(work?.ruleKind) ? work.ruleKind : null}
                      initialParams={(work?.ruleParams as RuleParams) ?? null}
                      currentMonth={currentMonth}
                    />
                    <Field label="開始月" htmlFor="startMonth" hint="この月から予定を作ります">
                      <Input id="startMonth" name="startMonth" type="month" defaultValue={work?.startMonth ?? currentMonth} className="max-w-[12rem]" />
                    </Field>
                  </div>
                )}

                {contractType === "CONSTRUCTION" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="工事の開始日" htmlFor="workStart" hint="未定なら空欄">
                      <Input id="workStart" name="workStart" type="date" defaultValue={work?.workStart ?? ""} />
                    </Field>
                    <Field label="工事の終了日" htmlFor="workEnd" hint="1日で終わるなら空欄">
                      <Input id="workEnd" name="workEnd" type="date" defaultValue={work?.workEnd ?? ""} />
                    </Field>
                  </div>
                )}

                {contractType && (
                  <div className="space-y-3 rounded-xl bg-surface-subtle p-3">
                    <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-ink">
                      <input type="checkbox" name="addToCalendar" value="1" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                      <span>{calendarLabel}</span>
                    </label>
                    {contractType === "SPOT" && addToCalendar && (
                      <Field label="実施日" htmlFor="spotDate" hint="未定なら空欄">
                        <Input id="spotDate" name="spotDate" type="date" className="max-w-[12rem]" />
                      </Field>
                    )}
                    {isEdit && addToCalendar && contractType !== "REGULAR" && occurrenceCount > 0 && (
                      <p className="text-xs text-amber-700">この現場の予定は既に {occurrenceCount} 件あります。チェックしたまま保存すると、もう1件追加されます。</p>
                    )}
                    {isEdit && !addToCalendar && <p className="text-xs text-ink-muted">予定の日付や担当の変更はカレンダーから行えます。</p>}
                  </div>
                )}
              </>
            )}
          </Card>
        )}
      </section>

      {/* ③ 1回あたりの標準 */}
      {workEditable && department && (
        <section className="space-y-3">
          <SectionTitle>1回あたりの標準</SectionTitle>
          <Card className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="人数" htmlFor="headcount">
                <Input id="headcount" name="headcount" type="number" inputMode="numeric" min={0} max={99} defaultValue={work?.headcount ?? ""} placeholder="2" />
              </Field>
              <Field label="開始時刻" htmlFor="defaultStartTime">
                <Input id="defaultStartTime" name="defaultStartTime" type="time" defaultValue={work?.defaultStartTime ?? ""} />
              </Field>
              <Field label="終了時刻" htmlFor="defaultEndTime">
                <Input id="defaultEndTime" name="defaultEndTime" type="time" defaultValue={work?.defaultEndTime ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="車両" htmlFor="vehicleId" hint="作る予定に付きます。当日の変更はカレンダーで">
                <Select id="vehicleId" name="vehicleId" defaultValue={work?.vehicleId ?? ""}>
                  <option value="">指定なし（当日に選ぶ）</option>
                  {vehicles
                    .filter((v) => v.active || v.id === work?.vehicleId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.vehicleType ? `（${v.vehicleType}）` : ""}
                        {!v.active ? " ※無効" : ""}
                      </option>
                    ))}
                </Select>
              </Field>
              {showAmount && (
                <Field label="金額（税抜・円）" htmlFor="amount" hint="1回あたり。最高管理者・事務経理のみ表示">
                  <Input id="amount" name="amount" type="number" inputMode="numeric" min={0} defaultValue={work?.amount ?? ""} placeholder="25000" />
                </Field>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* ステータス */}
      {isEdit && !workEditable && <input type="hidden" name="status" value={status} />}
      {isEdit && workEditable && (
        <section className="space-y-3">
          <SectionTitle>ステータス</SectionTitle>
          <Card className="space-y-2 p-4">
            <div className="flex gap-2">
              {PROPERTY_STATUS_OPTIONS.map((s) => (
                <ChoiceButton key={s} name="status" value={s} checked={status === s} onChange={() => setStatus(s)}>
                  {PROPERTY_STATUS_LABEL[s]}
                </ChoiceButton>
              ))}
            </div>
            <p className="text-xs text-ink-muted">「休止」「終了」にすると定期の予定は自動で作られなくなります（作成済みの予定は残ります）。「終了」はカレンダーの現場候補からも外れます。</p>
          </Card>
        </section>
      )}

      {/* ④ あとからでよい情報（折りたたみ） */}
      <Collapsible title="キーBOX・入館・連絡先" icon={<KeyRound className="h-4 w-4" />} defaultOpen={isEdit}>
        <div className="flex gap-2">
          {[
            { v: "HAS", label: "キーBOXあり" },
            { v: "NONE", label: "なし" },
            { v: "", label: "未確認" },
          ].map((o) => (
            <ChoiceButton key={o.v} name="keyboxStatus" value={o.v} checked={keybox === o.v} onChange={() => setKeybox(o.v)}>
              {o.label}
            </ChoiceButton>
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
      </Collapsible>

      <Collapsible title="図面・現調写真・業務連絡" icon={<FileText className="h-4 w-4" />} defaultOpen={isEdit}>
        <Field label="図面・資料（PDF）" hint="材料屋のシステムで消えてしまう図面や、見積書PDFをここに保存しておけます">
          <PropertyPhotoField name="drawingPhotos" kind="DRAWING" allowPdf initial={photos?.drawing ?? []} buttonLabel="PDF・画像を追加" />
        </Field>
        <Field label="現調写真">
          <PropertyPhotoField name="surveyPhotos" kind="SURVEY" initial={photos?.survey ?? []} buttonLabel="写真を追加" />
        </Field>
        <Field label="業務連絡" htmlFor="handoverNote" hint="毎回の作業で気を付けること">
          <Textarea id="handoverNote" name="handoverNote" defaultValue={property?.handoverNote ?? ""} placeholder="例：ワックスはA棟のみ。植木の水やりを頼まれることがある。" className="min-h-[80px]" />
        </Field>
      </Collapsible>

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
