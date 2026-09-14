"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Save, UserPlus } from "lucide-react";
import { createUser, updateUser, type UserFormState } from "./actions";
import { Field, Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker } from "@/features/settings/color-picker";
import { AvatarImageField } from "./avatar-image-field";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  ROLE_DESCRIPTION,
  WORKER_KIND_OPTIONS,
  WORKER_KIND_LABEL,
  DEPARTMENT_OPTIONS,
  DEPARTMENT_LABEL,
  WORKER_TAG_SUGGESTIONS,
} from "@/lib/constants";

export type UserData = {
  id: string;
  name: string;
  kana: string | null;
  email: string | null;
  role: string;
  kind: string;
  department: string | null;
  partnerId: string | null;
  phone: string | null;
  canLogin: boolean;
  tags: string[];
  avatarColor: string;
  avatarImage?: string | null;
};

export type PartnerOption = { id: string; name: string };

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ size: "lg", className: "w-full" })}>
      {pending ? "保存中..." : isEdit ? (<><Save className="h-5 w-5" /> 保存する</>) : (<><UserPlus className="h-5 w-5" /> 作業者を追加</>)}
    </button>
  );
}

export function UserForm({
  user,
  partners,
  canAssignOwner = false,
}: {
  user?: UserData;
  partners: PartnerOption[];
  /** 最高管理者の付与可否（最高管理者のみ true） */
  canAssignOwner?: boolean;
}) {
  const isEdit = !!user;
  const [state, formAction] = useActionState<UserFormState, FormData>(isEdit ? updateUser : createUser, {});
  const [canLogin, setCanLogin] = useState(user?.canLogin ?? true);
  const [kind, setKind] = useState(user?.kind ?? "EMPLOYEE");
  const [tags, setTags] = useState(user?.tags.join(", ") ?? "");

  const roleOptions = ROLE_OPTIONS.filter((r) => r !== "OWNER" || canAssignOwner || user?.role === "OWNER");
  const showPartner = kind === "PARTNER_STAFF" || kind === "SUBCONTRACTOR";

  function addTag(t: string) {
    const list = tags.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    if (!list.includes(t)) setTags([...list, t].join(", "));
  }

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={user.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="氏名" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={user?.name} placeholder="例：山田 太郎" required />
        </Field>
        <Field label="ふりがな" htmlFor="kana" hint="任意">
          <Input id="kana" name="kana" defaultValue={user?.kana ?? ""} placeholder="やまだ たろう" />
        </Field>
        <Field label="区分" htmlFor="kind" required>
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {WORKER_KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>{WORKER_KIND_LABEL[k]}</option>
            ))}
          </Select>
        </Field>
        <Field label="部門" htmlFor="department" hint="空欄は両方">
          <Select id="department" name="department" defaultValue={user?.department ?? ""}>
            <option value="">指定なし（両方）</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
            ))}
          </Select>
        </Field>
        {showPartner && (
          <Field label="所属会社" htmlFor="partnerId" className="sm:col-span-2">
            <Select id="partnerId" name="partnerId" defaultValue={user?.partnerId ?? ""}>
              <option value="">未選択</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="電話番号" htmlFor="phone" hint="任意">
          <Input id="phone" name="phone" type="tel" defaultValue={user?.phone ?? ""} placeholder="090-0000-0000" />
        </Field>
        <Field label="タグ" htmlFor="tags" hint="カンマ区切り。一括連絡や絞り込みに使う">
          <Input id="tags" name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="例：アルバイト, 土日可" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {WORKER_TAG_SUGGESTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft hover:bg-surface-subtle"
              >
                ＋{t}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface-subtle p-4">
        <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="canLogin"
            checked={canLogin}
            onChange={(e) => setCanLogin(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
          />
          このシステムにログインできる
        </label>
        <p className="text-xs text-ink-muted">
          ログインしない作業者（協力会社のスタッフ・下請など）は、配員先としてだけ使えます。
        </p>
        {canLogin && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="メールアドレス" htmlFor="email" required>
              <Input id="email" name="email" type="email" inputMode="email" autoComplete="off" defaultValue={user?.email ?? ""} placeholder="user@example.com" required />
            </Field>
            <Field label="権限" htmlFor="role" required>
              <Select id="role" name="role" defaultValue={user?.role ?? "STAFF"}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_DESCRIPTION[r]}</option>
                ))}
              </Select>
            </Field>
            <Field
              label={isEdit ? "パスワード" : "初期パスワード"}
              htmlFor="password"
              required={!isEdit}
              hint={isEdit ? "変更する場合のみ入力（空欄なら変更しません）" : "6文字以上。本人が後から変更できます"}
              className="sm:col-span-2"
            >
              <Input id="password" name="password" type="password" autoComplete="new-password" placeholder={isEdit ? "••••••••" : "6文字以上で設定"} required={!isEdit} />
            </Field>
          </div>
        )}
        {!canLogin && <input type="hidden" name="role" value="STAFF" />}
      </div>

      <Field label="プロフィール画像" hint="任意">
        <AvatarImageField personName={user?.name ?? "作業者"} color={user?.avatarColor} defaultImage={user?.avatarImage ?? null} />
      </Field>

      <Field label="アバター色" hint="画像未設定のときの色">
        <ColorPicker name="avatarColor" defaultValue={user?.avatarColor} />
      </Field>

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
