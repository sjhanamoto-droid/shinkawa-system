"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  AUDIENCE_ROLE_OPTIONS,
  CLAIM_TEMPLATE,
  type AnnouncementCategory,
} from "@/lib/announcements";
import { sendAnnouncement, type AnnouncementFormState } from "./actions";

function SubmitButton({ count, selected }: { count: number; selected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || count === 0} className={buttonClass({ size: "lg", className: "w-full" })}>
      <Send className="h-5 w-5" />
      {pending ? "送信中..." : count > 0 ? `${count}名に送る` : selected ? "ログインできる人がいないため送れません" : "送る相手を選んでください"}
    </button>
  );
}

const chip = (on: boolean) =>
  cn(
    "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors",
    on ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink-soft hover:bg-surface-subtle",
  );

/** roleCounts: 役割ごとの送れる人数（ログインできる在籍者。自分は除く） */
export function AnnouncementForm({ roleCounts }: { roleCounts: Record<Role, number> }) {
  const [state, formAction] = useActionState<AnnouncementFormState, FormData>(sendAnnouncement, {});
  const [all, setAll] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [category, setCategory] = useState<AnnouncementCategory>("GENERAL");
  const [body, setBody] = useState("");

  const total = AUDIENCE_ROLE_OPTIONS.reduce((s, r) => s + roleCounts[r], 0);
  const count = all ? total : roles.reduce((s, r) => s + roleCounts[r], 0);

  function toggleRole(r: Role) {
    setAll(false);
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-4 p-4">
        <Field label="送る相手" required hint="選んだ役割の、ログインできる社員・アルバイト全員に通知が届きます（協力会社・下請には届きません）">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setAll(true); setRoles([]); }} className={chip(all)} aria-pressed={all}>
              全員<span className="text-xs font-semibold opacity-80">{total}名</span>
            </button>
            {AUDIENCE_ROLE_OPTIONS.map((r) => {
              const on = !all && roles.includes(r);
              return (
                <button key={r} type="button" onClick={() => toggleRole(r)} className={chip(on)} aria-pressed={on}>
                  {ROLE_LABEL[r]}<span className="text-xs font-semibold opacity-80">{roleCounts[r]}名</span>
                </button>
              );
            })}
          </div>
          {all ? <input type="hidden" name="audience" value="ALL" /> : roles.map((r) => <input key={r} type="hidden" name="audience" value={r} />)}
        </Field>

        <Field label="種類" required>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  // クレームのときは、本文が空ならひな形を入れる
                  if (c === "CLAIM" && !body.trim()) setBody(CLAIM_TEMPLATE);
                  if (c !== "CLAIM" && body === CLAIM_TEMPLATE) setBody("");
                }}
                className={chip(category === c)}
                aria-pressed={category === c}
              >
                {ANNOUNCEMENT_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input type="hidden" name="category" value={category} />
        </Field>

        <Field label="件名" required htmlFor="an-title">
          <Input
            id="an-title"
            name="title"
            required
            maxLength={80}
            placeholder={category === "EVENT" ? "例）10/15（水）安全大会のお知らせ" : category === "CLAIM" ? "例）○○マンション 共用部清掃のクレームについて" : "例）年末年始の営業について"}
          />
        </Field>

        <Field label="本文" required htmlFor="an-body">
          <Textarea id="an-body" name="body" required value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[200px]" maxLength={4000} />
        </Field>
      </Card>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}
      <SubmitButton count={count} selected={all || roles.length > 0} />
      <p className="text-center text-xs text-ink-muted">送ると、相手のアプリの通知（スマホの通知を許可している人はスマホにも）に届きます。</p>
    </form>
  );
}
