"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { deleteCatalogLink, saveCatalogLink, type CatalogFormState } from "./actions";

export type CatalogFormValues = { id?: string; title: string; url: string; groupName: string; note: string; sortOrder: number };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      <Save className="h-5 w-5" />
      {pending ? "保存中..." : "保存"}
    </button>
  );
}

export function CatalogForm({ initial, groups }: { initial: CatalogFormValues; groups: string[] }) {
  const [state, formAction] = useActionState<CatalogFormState, FormData>(saveCatalogLink, {});
  const [confirm, setConfirm] = useState(false);
  const [deleting, startDelete] = useTransition();
  const toast = useToast();
  return (
    <form action={formAction} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Card className="space-y-4 p-4">
        <Field label="名前" required htmlFor="cat-title">
          <Input id="cat-title" name="title" defaultValue={initial.title} required maxLength={80} placeholder="例）サンゲツ SP" />
        </Field>
        <Field label="リンク先のURL" required htmlFor="cat-url">
          <Input id="cat-url" name="url" type="url" inputMode="url" defaultValue={initial.url} required placeholder="https://" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="見出し" htmlFor="cat-group" hint="同じ見出しのリンクがまとまって並びます（例：自社・サンゲツ・3M）">
            <Input id="cat-group" name="groupName" defaultValue={initial.groupName} maxLength={40} list="cat-groups" />
            <datalist id="cat-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="並び順" htmlFor="cat-order" hint="小さい順">
            <Input id="cat-order" name="sortOrder" type="number" inputMode="numeric" min={0} max={9999} defaultValue={initial.sortOrder} />
          </Field>
        </div>
        <Field label="メモ" htmlFor="cat-note" hint="何のカタログか、使いどころなど（任意）">
          <Input id="cat-note" name="note" defaultValue={initial.note} maxLength={200} />
        </Field>
      </Card>
      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <SubmitButton />
      {initial.id && (
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              setTimeout(() => setConfirm(false), 3000);
              return;
            }
            startDelete(async () => {
              const r = await deleteCatalogLink(initial.id!);
              if (r?.error) toast(r.error, { type: "error" });
            });
          }}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-semibold",
            confirm ? "bg-red-600 text-white" : "text-ink-muted hover:bg-red-50 hover:text-status-danger",
          )}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {confirm ? "もう一度押すと削除します" : "このリンクを削除"}
        </button>
      )}
    </form>
  );
}
