"use client";

import { useMemo, useState } from "react";
import { Repeat } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/form";
import { RULE_KIND_LABEL, RULE_KIND_OPTIONS, WEEKDAY_LABEL, type RuleKind } from "@/lib/constants";
import { slotsForMonth, describeRule, validateRule, addMonths, type RuleParams } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

// 周期ルールの編集。hidden input に ruleKind / ruleParams(JSON) を出力し、今後3か月のプレビューを表示する。
export function RuleEditor({
  initialKind,
  initialParams,
  currentMonth,
}: {
  initialKind: RuleKind | null;
  initialParams: RuleParams | null;
  currentMonth: string; // "YYYY-MM"
}) {
  const [kind, setKind] = useState<RuleKind>(initialKind ?? "MONTHLY");
  const [params, setParams] = useState<RuleParams>(initialParams ?? {});

  const set = (patch: Partial<RuleParams>) => setParams((p) => ({ ...p, ...patch }));
  const num = (v: string): number | null => (v === "" ? null : Number(v));

  const error = validateRule(kind, params);
  const preview = useMemo(() => {
    if (error) return [];
    return [0, 1, 2].map((i) => {
      const ym = addMonths(currentMonth, i);
      return { ym, slots: slotsForMonth(kind, params, ym) };
    });
  }, [kind, params, currentMonth, error]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="ruleKind" value={kind} />
      <input type="hidden" name="ruleParams" value={JSON.stringify(params)} />

      <Field label="周期" htmlFor="rule-kind" required>
        <Select id="rule-kind" value={kind} onChange={(e) => { setKind(e.target.value as RuleKind); setParams({}); }}>
          {RULE_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>{RULE_KIND_LABEL[k]}</option>
          ))}
        </Select>
      </Field>

      {(kind === "MONTHLY" || kind === "EVERY_N_MONTHS" || kind === "SEASONAL") && (
        <Field label="実施日" htmlFor="rule-day" hint="空欄＝日付未定（未割当レーンに出す）">
          <Input id="rule-day" type="number" min={1} max={31} value={params.dayOfMonth ?? ""} onChange={(e) => set({ dayOfMonth: num(e.target.value) })} placeholder="例：15" className="max-w-[10rem]" />
        </Field>
      )}
      {kind === "TWICE_MONTHLY" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="前半の実施日" htmlFor="rule-first" hint="1〜15。空欄＝未定">
            <Input id="rule-first" type="number" min={1} max={15} value={params.firstDay ?? ""} onChange={(e) => set({ firstDay: num(e.target.value) })} />
          </Field>
          <Field label="後半の実施日" htmlFor="rule-second" hint="16〜末。空欄＝未定">
            <Input id="rule-second" type="number" min={16} max={31} value={params.secondDay ?? ""} onChange={(e) => set({ secondDay: num(e.target.value) })} />
          </Field>
        </div>
      )}
      {(kind === "WEEKLY" || kind === "NTH_WEEKDAY") && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="曜日" htmlFor="rule-weekday" required>
            <Select id="rule-weekday" value={params.weekday ?? ""} onChange={(e) => set({ weekday: num(e.target.value) })}>
              <option value="">選択</option>
              {WEEKDAY_LABEL.map((w, i) => (
                <option key={w} value={i}>{w}曜日</option>
              ))}
            </Select>
          </Field>
          {kind === "NTH_WEEKDAY" && (
            <Field label="第n" htmlFor="rule-nth" required>
              <Select id="rule-nth" value={params.nth ?? ""} onChange={(e) => set({ nth: num(e.target.value) })}>
                <option value="">選択</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>第{n}</option>
                ))}
                <option value={-1}>最終</option>
              </Select>
            </Field>
          )}
        </div>
      )}
      {kind === "EVERY_N_MONTHS" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="間隔（か月）" htmlFor="rule-interval" required>
            <Input id="rule-interval" type="number" min={2} max={12} value={params.interval ?? ""} onChange={(e) => set({ interval: num(e.target.value) })} placeholder="例：3" />
          </Field>
          <Field label="起点月" htmlFor="rule-anchor" required>
            <Input id="rule-anchor" type="month" value={params.anchorMonth ?? ""} onChange={(e) => set({ anchorMonth: e.target.value || null })} />
          </Field>
        </div>
      )}
      {kind === "SEASONAL" && (
        <Field label="実施月" required>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const on = (params.months ?? []).includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => set({ months: on ? (params.months ?? []).filter((x) => x !== m) : [...(params.months ?? []), m] })}
                  className={cn("h-9 w-12 rounded-lg border text-sm font-bold", on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft")}
                >
                  {m}月
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {error ? (
        <p className="text-xs font-semibold text-status-danger">{error}</p>
      ) : (
        <div className="rounded-xl bg-surface-subtle p-3 text-xs">
          <p className="mb-1.5 flex items-center gap-1.5 font-bold text-ink">
            <Repeat className="h-3.5 w-3.5 text-ink-muted" />
            {describeRule(kind, params)}
          </p>
          <div className="grid gap-1 sm:grid-cols-3">
            {preview.map((p) => (
              <div key={p.ym} className="rounded-lg bg-surface p-2">
                <p className="font-bold text-ink-soft">{p.ym.replace("-", "年")}月</p>
                {p.slots.length === 0 ? (
                  <p className="text-ink-faint">実施なし</p>
                ) : (
                  p.slots.map((s) => (
                    <p key={s.index} className="text-ink-soft">
                      {s.date ? s.date.slice(5).replace("-", "/") : `日付未定（${s.label ?? "月内"}）`}
                    </p>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
