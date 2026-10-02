"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DEPARTMENT_LABEL } from "@/lib/constants";
import type { Cat } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { createCategory, moveCategory, setCategoryActive, updateCategory } from "./category-actions";

// 白い文字が読める濃さの色（カレンダーのタグの文字は白）
const PALETTE = [
  "#14b8a6", "#10b981", "#22c55e", "#65a30d", "#0ea5e9", "#3b82f6", "#2563eb", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#ef4444", "#f97316", "#f59e0b", "#ca8a04",
  "#78716c", "#64748b", "#94a3b8", "#0f766e", "#1e3a8a", "#7c2d12",
];

function ColorChoices({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value.toLowerCase() === c}
          className={cn("flex h-7 w-7 items-center justify-center rounded-md ring-2 ring-offset-1 transition-transform active:scale-90", value.toLowerCase() === c ? "ring-ink/50" : "ring-transparent")}
          style={{ backgroundColor: c }}
        >
          {value.toLowerCase() === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
      <label className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line-strong px-2 text-xs font-semibold text-ink-soft" title="自由に選ぶ">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0" />
        ほかの色
      </label>
    </div>
  );
}

function Preview({ label, short, color }: { label: string; short: string; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold leading-none text-white" style={{ backgroundColor: color }}>{short || "略"}</span>
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold leading-none text-white" style={{ backgroundColor: color }}>{label || "名称"}</span>
    </span>
  );
}

function CategoryRow({ c, first, last }: { c: Cat; first: boolean; last: boolean }) {
  const [label, setLabel] = useState(c.label);
  const [short, setShort] = useState(c.short);
  const [color, setColor] = useState(c.color);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = label !== c.label || short !== c.short || color.toLowerCase() !== c.color.toLowerCase();
  const locked = c.key === "OFF" || c.key === "REGULAR_CLEANING";

  const run = (fn: () => Promise<{ error?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast(r.error, { type: "error" });
      else {
        if (ok) toast(ok);
        router.refresh();
      }
    });

  return (
    <div className={cn("space-y-3 p-3.5", !c.active && "bg-surface-subtle")}>
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button type="button" disabled={first || pending} onClick={() => run(() => moveCategory(c.key, "up"))} aria-label="上へ" className="rounded p-0.5 text-ink-faint hover:text-ink disabled:opacity-30">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={last || pending} onClick={() => run(() => moveCategory(c.key, "down"))} aria-label="下へ" className="rounded p-0.5 text-ink-faint hover:text-ink disabled:opacity-30">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", !c.active && "opacity-50")}>
          <Preview label={c.label} short={c.short} color={c.color} />
          <span className="truncate text-xs text-ink-muted">{c.department ? DEPARTMENT_LABEL[c.department] : "両部門"}{c.builtin ? "" : "・追加"}</span>
        </button>
        {!c.active && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">使わない</span>}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "閉じる" : "変更"}
        </Button>
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Field label="名称" htmlFor={`cat-label-${c.key}`}>
              <Input id={`cat-label-${c.key}`} value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="略称" htmlFor={`cat-short-${c.key}`} hint="4字まで">
              <Input id={`cat-short-${c.key}`} value={short} maxLength={4} onChange={(e) => setShort(e.target.value)} />
            </Field>
          </div>
          <Field label="色">
            <ColorChoices value={color} onChange={setColor} />
          </Field>
          <div className="flex items-center justify-between gap-2">
            <Preview label={label} short={short} color={color} />
            <Button type="button" size="sm" disabled={!dirty || pending} onClick={() => run(() => updateCategory(c.key, { label, short, color }), "保存しました")}>
              保存
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            {locked ? (
              <p className="flex items-center gap-1 text-xs text-ink-muted">
                <Lock className="h-3.5 w-3.5" />
                この種別は使わない設定にできません
              </p>
            ) : (
              <p className="text-xs text-ink-muted">{c.active ? "使わない設定にすると、新しい予定の選択肢から外れます（過去の予定はそのまま表示）。" : "今は使わない設定です。"}</p>
            )}
            {!locked && (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => setCategoryActive(c.key, !c.active), c.active ? "使わない設定にしました" : "使う設定に戻しました")}>
                {c.active ? "使わない" : "使う"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddCategory() {
  const [label, setLabel] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [department, setDepartment] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <Plus className="h-4 w-4" />
        種別を追加
      </p>
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <Field label="名称" htmlFor="new-cat-label" required>
          <Input id="new-cat-label" value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} placeholder="例：ガラス清掃" />
        </Field>
        <Field label="略称" htmlFor="new-cat-short" required hint="4字まで">
          <Input id="new-cat-short" value={short} maxLength={4} onChange={(e) => setShort(e.target.value)} placeholder="ガラス" />
        </Field>
      </div>
      <Field label="部門" htmlFor="new-cat-dept" hint="あとから変えられません">
        <Select id="new-cat-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">両部門で使う</option>
          <option value="CLEANING">{DEPARTMENT_LABEL.CLEANING}</option>
          <option value="CONSTRUCTION">{DEPARTMENT_LABEL.CONSTRUCTION}</option>
        </Select>
      </Field>
      <Field label="色">
        <ColorChoices value={color} onChange={setColor} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <Preview label={label} short={short} color={color} />
        <Button
          type="button"
          size="sm"
          disabled={!label.trim() || !short.trim() || pending}
          onClick={() =>
            start(async () => {
              const r = await createCategory({ label, short, color, department });
              if (r.error) {
                toast(r.error, { type: "error" });
                return;
              }
              toast(`「${label}」を追加しました`);
              setLabel("");
              setShort("");
              router.refresh();
            })
          }
        >
          追加する
        </Button>
      </div>
    </Card>
  );
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line">
        {categories.map((c, i) => (
          <CategoryRow key={`${c.key}-${c.label}-${c.short}-${c.color}-${c.active}`} c={c} first={i === 0} last={i === categories.length - 1} />
        ))}
      </Card>
      <AddCategory />
    </div>
  );
}
