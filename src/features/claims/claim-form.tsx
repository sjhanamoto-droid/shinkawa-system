"use client";

import { useActionState, useCallback, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Save, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import type { Role } from "@/lib/constants";
import { AudiencePicker } from "@/features/announcements/audience-picker";
import { saveClaim, type ClaimFormState } from "./actions";

export type ClaimFormValues = {
  id?: string;
  title: string;
  propertyId: string;
  occurredOn: string;
  content: string;
  cause: string;
  prevention: string;
};

function SubmitButton({ isEdit, count, selected, busy }: { isEdit: boolean; count: number; selected: boolean; busy: boolean }) {
  const { pending } = useFormStatus();
  if (isEdit) {
    return (
      <button type="submit" disabled={pending || busy} className={buttonClass({ size: "lg", className: "w-full" })}>
        <Save className="h-5 w-5" />
        {pending ? "保存中..." : busy ? "写真を保存しています..." : "変更を保存"}
      </button>
    );
  }
  return (
    <button type="submit" disabled={pending || busy || count === 0} className={buttonClass({ size: "lg", className: "w-full" })}>
      <Send className="h-5 w-5" />
      {pending
        ? "共有しています..."
        : busy
          ? "写真を保存しています..."
          : count > 0
            ? `登録して${count}名に共有する`
            : selected
              ? "ログインできる人がいないため共有できません"
              : "共有する相手を選んでください"}
    </button>
  );
}

export function ClaimForm({
  initial,
  initialPhotos = [],
  properties,
  roleCounts,
  blobEnabled,
}: {
  initial: ClaimFormValues;
  initialPhotos?: UploaderPhoto[];
  properties: SearchOption[];
  /** 新規のときだけ（宛先の人数） */
  roleCounts?: Record<Role, number>;
  blobEnabled: boolean;
}) {
  const isEdit = Boolean(initial.id);
  const [state, formAction] = useActionState<ClaimFormState, FormData>(saveClaim, {});
  const [propertyId, setPropertyId] = useState(initial.propertyId);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(true);
  const onAudience = useCallback((c: number, sel: boolean) => {
    setCount(c);
    setSelected(sel);
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={initial.id} />}
      <Card className="space-y-4 p-4">
        <Field label="件名" required htmlFor="cl-title">
          <Input id="cl-title" name="title" defaultValue={initial.title} required maxLength={80} placeholder="例）共用部の清掃漏れ（エントランスのガラス）" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="現場" htmlFor="cl-property" hint="分からなければ空欄でも登録できます">
            <SearchSelect
              id="cl-property"
              name="propertyId"
              value={propertyId}
              onChange={(v) => setPropertyId(v)}
              options={properties}
              placeholder="現場名・顧客名で検索"
              emptyLabel="現場を選ぶ"
            />
          </Field>
          <Field label="発生日" htmlFor="cl-date">
            <Input id="cl-date" name="occurredOn" type="date" defaultValue={initial.occurredOn} />
          </Field>
        </div>
        <Field label="クレームの内容" required htmlFor="cl-content" hint="どこで・何が・誰から、を具体的に">
          <Textarea id="cl-content" name="content" defaultValue={initial.content} required maxLength={4000} className="min-h-[120px]" />
        </Field>
        <Field label="原因" htmlFor="cl-cause">
          <Textarea id="cl-cause" name="cause" defaultValue={initial.cause} maxLength={4000} className="min-h-[88px]" />
        </Field>
        <Field label="対応・再発防止策" htmlFor="cl-prevention" hint="その場の対応と、これから全員で気をつけること">
          <Textarea id="cl-prevention" name="prevention" defaultValue={initial.prevention} maxLength={4000} className="min-h-[120px]" />
        </Field>
        <Field label="写真" hint="現場の状況・指摘された箇所など">
          <PhotoUploader name="photos" defaultKind="WORK" initial={initialPhotos} blobEnabled={blobEnabled} onBusyChange={setBusy} />
        </Field>
      </Card>

      {!isEdit && roleCounts && (
        <Card className="space-y-2 p-4">
          <Field label="共有する相手" required hint="選んだ人は、次にアプリを開いたとき「確認しました」を押すまで他の画面に進めません">
            <AudiencePicker roleCounts={roleCounts} onChange={onAudience} />
          </Field>
        </Card>
      )}

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <SubmitButton isEdit={isEdit} count={count} selected={selected} busy={busy} />
    </form>
  );
}
