"use client";

import { useActionState, useCallback, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { Role } from "@/lib/constants";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_OPTIONS,
  type AnnouncementCategory,
} from "@/lib/announcements";
import { sendAnnouncement, type AnnouncementFormState } from "./actions";
import { AudiencePicker, chipClass } from "./audience-picker";

function SubmitButton({ count, selected }: { count: number; selected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || count === 0} className={buttonClass({ size: "lg", className: "w-full" })}>
      <Send className="h-5 w-5" />
      {pending ? "送信中..." : count > 0 ? `${count}名に送る` : selected ? "ログインできる人がいないため送れません" : "送る相手を選んでください"}
    </button>
  );
}

/** roleCounts: 役割ごとの送れる人数（ログインできる在籍者。自分は除く） */
export function AnnouncementForm({ roleCounts }: { roleCounts: Record<Role, number> }) {
  const [state, formAction] = useActionState<AnnouncementFormState, FormData>(sendAnnouncement, {});
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(true);
  const onAudience = useCallback((c: number, sel: boolean) => {
    setCount(c);
    setSelected(sel);
  }, []);
  const [category, setCategory] = useState<AnnouncementCategory>("GENERAL");
  const [body, setBody] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <Card className="space-y-4 p-4">
        <Field label="送る相手" required hint="選んだ役割の、ログインできる社員・アルバイト全員に通知が届きます（協力会社・下請には届きません）">
          <AudiencePicker roleCounts={roleCounts} onChange={onAudience} />
        </Field>

        <Field label="種類" required>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={chipClass(category === c)}
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
            placeholder={category === "EVENT" ? "例）10/15（水）安全大会のお知らせ" : "例）年末年始の営業について"}
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
      <SubmitButton count={count} selected={selected} />
      <p className="text-center text-xs text-ink-muted">送ると、相手のアプリの通知（スマホの通知を許可している人はスマホにも）に届きます。</p>
    </form>
  );
}
