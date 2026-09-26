"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, Save, Send, Sparkles, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AssigneePicker } from "@/features/schedule/assignee-picker";
import type { WorkerOption } from "@/features/schedule/types";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import type { Role } from "@/lib/constants";
import { AudiencePicker } from "@/features/announcements/audience-picker";
import { saveClaim, type ClaimFormState } from "./actions";
import { suggestPrevention } from "./ai-prevention";

export type ClaimFormValues = {
  id?: string;
  title: string;
  propertyId: string;
  occurredOn: string;
  content: string;
  cause: string;
  prevention: string;
  siteContact: string;
  involvedUserIds: string[];
  involvedOthers: string;
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
  workers,
  roleCounts,
  blobEnabled,
  aiEnabled = false,
}: {
  initial: ClaimFormValues;
  initialPhotos?: UploaderPhoto[];
  properties: SearchOption[];
  /** 「関わった人」の選択肢 */
  workers: WorkerOption[];
  /** 新規のときだけ（宛先の人数） */
  roleCounts?: Record<Role, number>;
  blobEnabled: boolean;
  /** Claude API が使える（対応・再発防止策の案をAIで作る） */
  aiEnabled?: boolean;
}) {
  const isEdit = Boolean(initial.id);
  const [state, formAction] = useActionState<ClaimFormState, FormData>(saveClaim, {});
  const [propertyId, setPropertyId] = useState(initial.propertyId);
  const [involved, setInvolved] = useState<string[]>(initial.involvedUserIds);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(true);
  const onAudience = useCallback((c: number, sel: boolean) => {
    setCount(c);
    setSelected(sel);
  }, []);

  // 対応・再発防止策：AIの案を入れたあとも手で直せる
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const causeRef = useRef<HTMLTextAreaElement>(null);
  const [prevention, setPrevention] = useState(initial.prevention);
  const [aiMessage, setAiMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [aiPending, startAi] = useTransition();

  function runAi() {
    const content = contentRef.current?.value.trim() ?? "";
    if (!content) {
      setAiMessage({ ok: false, text: "先に「クレームの内容」を入力してください" });
      contentRef.current?.focus();
      return;
    }
    // すでに書いてあるときは、置き換える前にもう一度押してもらう
    if (prevention.trim() && !confirmReplace) {
      setConfirmReplace(true);
      setTimeout(() => setConfirmReplace(false), 4000);
      return;
    }
    setConfirmReplace(false);
    setAiMessage(null);
    startAi(async () => {
      const r = await suggestPrevention({
        title: titleRef.current?.value ?? "",
        content,
        cause: causeRef.current?.value ?? "",
        propertyName: properties.find((p) => p.value === propertyId)?.label,
      });
      if (r.ok) {
        setPrevention(r.text);
        setAiMessage({ ok: true, text: "AIの案を入れました。現場に合うように直してから登録してください" });
      } else {
        setAiMessage({ ok: false, text: r.message });
      }
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={initial.id} />}
      <Card className="space-y-4 p-4">
        <Field label="件名" required htmlFor="cl-title">
          <Input ref={titleRef} id="cl-title" name="title" defaultValue={initial.title} required maxLength={80} placeholder="例）共用部の清掃漏れ（エントランスのガラス）" />
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
        <Field label="現場の担当者" htmlFor="cl-site-contact" hint="お客様・管理会社側の担当者名など（自由記入）">
          <Input id="cl-site-contact" name="siteContact" defaultValue={initial.siteContact} maxLength={100} placeholder="例）○○管理 山田様" />
        </Field>
        <Field label="このクレームに関わった人" hint="一覧から選べます。一覧にいない人は下の欄に書いてください">
          <div className="space-y-2">
            {involved.map((id) => (
              <input key={id} type="hidden" name="involvedUserIds" value={id} />
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              {involved.map((id) => {
                const w = workers.find((x) => x.id === id);
                return (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-1 pr-2 text-sm font-semibold text-brand-700">
                    <Avatar name={w?.name ?? "?"} color={w?.avatarColor ?? "#94a3b8"} image={w?.avatarUrl ?? null} size="sm" className="!h-6 !w-6 text-[10px]" />
                    {w?.name ?? "（不明）"}
                    <button type="button" onClick={() => setInvolved((prev) => prev.filter((x) => x !== id))} aria-label={`${w?.name ?? ""}を外す`} className="-mr-1 rounded-full p-0.5 hover:bg-brand-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
              <button type="button" onClick={() => setShowPicker((v) => !v)} className={buttonClass({ variant: "outline", size: "sm" })}>
                <UserPlus className="h-4 w-4" />
                {showPicker ? "選び終わる" : involved.length ? "人を追加・変更" : "一覧から選ぶ"}
              </button>
            </div>
            {showPicker && (
              <div className="rounded-xl border border-line p-2">
                <AssigneePicker workers={workers} value={involved} onChange={setInvolved} compact />
              </div>
            )}
            <Input name="involvedOthers" defaultValue={initial.involvedOthers} maxLength={200} placeholder="一覧にいない人（例）応援の田中さん）" />
          </div>
        </Field>
        <Field label="クレームの内容" required htmlFor="cl-content" hint="どこで・何が・誰から、を具体的に">
          <Textarea ref={contentRef} id="cl-content" name="content" defaultValue={initial.content} required maxLength={4000} className="min-h-[120px]" />
        </Field>
        <Field label="原因" htmlFor="cl-cause">
          <Textarea ref={causeRef} id="cl-cause" name="cause" defaultValue={initial.cause} maxLength={4000} className="min-h-[88px]" />
        </Field>
        <Field label="対応・再発防止策" htmlFor="cl-prevention" hint="その場の対応と、これから全員で気をつけること">
          <div className="space-y-2">
            {aiEnabled && (
              <button
                type="button"
                onClick={runAi}
                disabled={aiPending}
                className={buttonClass({ variant: confirmReplace ? "primary" : "outline", size: "sm", className: "w-full sm:w-auto" })}
              >
                {aiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {aiPending ? "AIが考えています..." : confirmReplace ? "今の内容を置き換えます。もう一度押してください" : "内容と原因からAIで考える"}
              </button>
            )}
            <Textarea
              id="cl-prevention"
              name="prevention"
              value={prevention}
              onChange={(e) => setPrevention(e.target.value)}
              maxLength={4000}
              className="min-h-[160px]"
              disabled={aiPending}
            />
            {aiMessage && (
              <p className={aiMessage.ok ? "flex items-center gap-1.5 text-xs font-semibold text-emerald-700" : "flex items-center gap-1.5 text-xs font-semibold text-amber-700"}>
                {aiMessage.ok ? <Sparkles className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                {aiMessage.text}
              </p>
            )}
          </div>
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
