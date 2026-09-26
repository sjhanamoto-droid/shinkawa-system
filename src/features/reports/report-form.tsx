"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, CalendarDays, Car, Send, Save, Sparkles, UserCheck, X } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { CategoryBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import { cn } from "@/lib/utils";
import { fmtKeyLong, fmtKeyShort } from "@/features/schedule/filters";
import { fmtWorkHours, REPORT_TIME_STEP, workMinutes } from "@/lib/reports";
import { saveReport, type ReportFormState } from "./actions";
import { ExpenseEditor, serializeExpenses, type ExpenseRow } from "./expense-editor";
import { AiSortPanel } from "./ai-sort-panel";
import { useToast } from "@/components/ui/toast";

type Choice = "" | "yes" | "no";

export type ReportFormValues = {
  workDate: string;
  startTime: string;
  endTime: string;
  detail: string;
  expenses: ExpenseRow[];
  handoverChoice: Choice;
  handover: string;
};

export type ReportFormProps = {
  reportId?: string;
  submitted: boolean; // 提出済みの日報を編集中
  occurrence: {
    id: string;
    title: string;
    category: string;
    propertyName: string | null;
    address: string | null;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    vehicles: { id: string; name: string; color: string }[];
  };
  worker: { id: string; name: string };
  proxy: boolean; // 自分以外の分（代理入力）
  workDays: string[]; // 選べる作業日（新規のみ。1つなら固定）
  initial: ReportFormValues;
  initialPhotos: UploaderPhoto[];
  blobEnabled: boolean;
  /** 領収書の自動読み取り（Claude API のキーがあるとき） */
  /** Claude API が使える（領収書の読み取り・AIでまとめる） */
  aiEnabled: boolean;
};

// ── 端末への自動保存（写真は保存しない）。24時間で破棄 ──
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 5 * 60 * 1000;

function readLocal<T>(key: string): { savedAt: number; values: T } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { savedAt: number; values: T };
    if (!v || typeof v.savedAt !== "number" || Date.now() - v.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

/** 端末に保存する形。領収書の画像データは容量が大きいので外す（保存済みの写真＝id は残す） */
function forLocal(v: ReportFormValues): ReportFormValues {
  return {
    ...v,
    expenses: v.expenses.map((e) => {
      const keep = !e.receipt || "id" in e.receipt;
      // 外した写真から読み取った値は、復元時に「読み取り」扱いにしない
      return { ...e, receipt: keep ? e.receipt : null, ocr: keep && e.ocr, status: undefined, message: undefined };
    }),
  };
}

function SubmitButtons({ submitted, uploading }: { submitted: boolean; uploading: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || uploading;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {!submitted && (
        <button type="submit" name="intent" value="draft" formNoValidate disabled={disabled} className={buttonClass({ variant: "outline", size: "lg", className: "sm:flex-1" })}>
          <Save className="h-5 w-5" />
          下書き保存
        </button>
      )}
      <button type="submit" name="intent" value="submit" disabled={disabled} className={buttonClass({ size: "lg", className: "sm:flex-[2]" })}>
        <Send className="h-5 w-5" />
        {uploading ? "写真・動画をアップロード中..." : pending ? "送信中..." : submitted ? "保存して提出" : "提出する"}
      </button>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 / REPORT_TIME_STEP }, (_, i) => String(i * REPORT_TIME_STEP).padStart(2, "0"));

/** 時・分（10分刻み）を選ぶ。値は 'HH:mm' で hidden input に入る */
function TimeSelect({ id, name, value, onChange }: { id: string; name: string; value: string; onChange: (t: string) => void }) {
  const [h, m] = (/^\d{2}:\d{2}$/.test(value) ? value : "09:00").split(":");
  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      <Select id={`${id}-h`} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)} className="h-11 pl-3 pr-8" wrapperClassName="flex-1" aria-label="時">
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {Number(x)}
          </option>
        ))}
      </Select>
      <span className="font-bold text-ink-soft">:</span>
      <Select id={`${id}-m`} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)} className="h-11 pl-3 pr-8" wrapperClassName="flex-1" aria-label="分">
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ChoiceToggle({ name, value, onChange, labels = ["あり", "なし"] }: { name: string; value: Choice; onChange: (v: Choice) => void; labels?: [string, string] }) {
  return (
    <div className="flex gap-2" role="radiogroup">
      {(["yes", "no"] as const).map((v, i) => (
        <label
          key={v}
          className={cn(
            "flex h-11 min-w-[5.5rem] flex-1 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold transition-colors sm:flex-none",
            value === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line-strong bg-surface text-ink-soft",
          )}
        >
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
          {labels[i]}
        </label>
      ))}
    </div>
  );
}

export function ReportForm(props: ReportFormProps) {
  const { reportId, submitted, occurrence: o, worker, proxy, workDays, initialPhotos, blobEnabled, aiEnabled } = props;
  const [aiOpen, setAiOpen] = useState(false);
  const toast = useToast();
  const [state, formAction] = useActionState<ReportFormState, FormData>(saveReport, {});
  const [v, setV] = useState<ReportFormValues>(props.initial);
  const set = <K extends keyof ReportFormValues>(k: K, val: ReportFormValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const storageKey = reportId ? `shinkawa:report:v2:edit:${reportId}` : `shinkawa:report:v2:new:${o.id}:${worker.id}:${v.workDate}`;
  const pendingKey = `${storageKey}:pending`;
  const [restore, setRestore] = useState<ReportFormValues | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const uploading = photoBusy || expenseBusy;
  const dirty = useRef(false);

  // 開いたとき：直前に送信した直後なら端末の下書きを捨てる。そうでなければ復元を提案
  useEffect(() => {
    try {
      const pending = Number(localStorage.getItem(pendingKey) ?? "0");
      if (pending && Date.now() - pending < PENDING_TTL_MS) {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(pendingKey);
        return;
      }
      localStorage.removeItem(pendingKey);
    } catch {
      /* 端末に保存できない環境では何もしない */
    }
    const saved = readLocal<ReportFormValues>(storageKey);
    if (saved && JSON.stringify(saved.values) !== JSON.stringify(forLocal(props.initial))) setRestore(saved.values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 入力のたびに端末へ保存（0.8秒待ってから）
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), values: forLocal(v) }));
      } catch {
        /* 容量不足などは無視 */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [v, storageKey]);

  // 未保存のまま離れようとしたら確認
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // エラーが返ったら：端末の下書きを残す（送信済みの印を消し、離脱時の確認も戻す）→ 最初のエラーまでスクロール
  useEffect(() => {
    if (!state.error && !state.fieldErrors) return;
    dirty.current = true;
    try {
      localStorage.removeItem(pendingKey);
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), values: forLocal(v) }));
    } catch {
      /* noop */
    }
    requestAnimationFrame(() => {
      const el = document.querySelector(".field-error, [data-form-error]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fe = state.fieldErrors ?? {};
  const minutes = workMinutes(v.startTime, v.endTime);
  const expensesJson = useMemo(() => serializeExpenses(v.expenses), [v.expenses]);

  return (
    <form
      action={formAction}
      onChange={() => {
        dirty.current = true;
      }}
      onSubmit={() => {
        dirty.current = false;
        try {
          localStorage.setItem(pendingKey, String(Date.now()));
        } catch {
          /* noop */
        }
      }}
      className="space-y-5"
    >
      {reportId ? <input type="hidden" name="reportId" value={reportId} /> : (
        <>
          <input type="hidden" name="occurrenceId" value={o.id} />
          <input type="hidden" name="userId" value={worker.id} />
        </>
      )}
      <input type="hidden" name="expenses" value={expensesJson} />

      {restore && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="flex-1">前回の入力を復元しますか？（端末に自動保存された内容があります）</span>
          <button
            type="button"
            className="h-9 rounded-lg bg-amber-600 px-3 text-xs font-bold text-white"
            onClick={() => {
              setV(restore);
              dirty.current = true;
              setRestore(null);
            }}
          >
            復元
          </button>
          <button
            type="button"
            className="h-9 rounded-lg px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
            onClick={() => {
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* noop */
              }
              setRestore(null);
            }}
          >
            破棄
          </button>
        </div>
      )}

      {/* 予定（自動入力） */}
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={o.category} />
          {proxy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700">
              <UserCheck className="h-3.5 w-3.5" />
              代理入力
            </span>
          )}
        </div>
        <p className="text-lg font-bold leading-snug text-ink">
          {o.title}
          {o.propertyName && o.propertyName !== o.title && <span className="ml-1.5 text-sm font-semibold text-ink-soft">{o.propertyName}</span>}
        </p>
        {o.address && <p className="text-sm text-ink-soft">{o.address}</p>}
        <p className="text-sm text-ink-soft">
          作業者：<span className="font-bold text-ink">{worker.name}</span>
          {proxy && <span className="ml-1 text-xs text-ink-muted">（あなたが代わりに入力します）</span>}
        </p>
        {(o.startTime || o.vehicles.length > 0) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {o.startTime && <span>予定の時刻 {o.startTime}{o.endTime ? `〜${o.endTime}` : ""}</span>}
            {o.vehicles.length > 0 && (
              <span className="flex items-center gap-1">
                <Car className="h-3.5 w-3.5" />
                {o.vehicles.map((x) => x.name).join("・")}
              </span>
            )}
          </p>
        )}
        {o.note && <p className="whitespace-pre-wrap rounded-lg bg-surface-subtle p-2 text-xs text-ink-soft">{o.note}</p>}
      </Card>

      {/* 作業日と時間 */}
      <section className="space-y-3">
        <SectionTitle>作業日と時間</SectionTitle>
        <Card className="space-y-3 p-4">
          {reportId || workDays.length <= 1 ? (
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <CalendarDays className="h-4 w-4 text-ink-muted" />
              {fmtKeyLong(v.workDate)}
              {!reportId && <input type="hidden" name="workDate" value={v.workDate} />}
            </p>
          ) : (
            <Field label="作業日" htmlFor="rf-date" required error={fe.workDate} description="複数日の工事は、日ごとに日報を書きます">
              <Select id="rf-date" name="workDate" value={v.workDate} onChange={(e) => set("workDate", e.target.value)} className="h-11">
                {workDays.map((d) => (
                  <option key={d} value={d}>
                    {fmtKeyShort(d)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始時刻" htmlFor="rf-start-h" required error={fe.startTime}>
              <TimeSelect id="rf-start" name="startTime" value={v.startTime} onChange={(t) => set("startTime", t)} />
            </Field>
            <Field label="終了時刻" htmlFor="rf-end-h" required error={fe.endTime}>
              <TimeSelect id="rf-end" name="endTime" value={v.endTime} onChange={(t) => set("endTime", t)} />
            </Field>
          </div>
          <p className="text-xs text-ink-muted">
            作業時間 <span className="font-bold text-ink">{fmtWorkHours(minutes)}</span>。この時間がそのまま勤怠（タイムカード）になります。
          </p>
        </Card>
      </section>

      {/* 作業内容 */}
      <section className="space-y-3">
        <SectionTitle
          action={
            aiEnabled &&
            !aiOpen && (
              <button type="button" onClick={() => setAiOpen(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-brand-600 hover:bg-brand-50">
                <Sparkles className="h-3.5 w-3.5" />
                AIでまとめる
              </button>
            )
          }
        >
          作業内容
        </SectionTitle>
        {aiOpen && (
          <AiSortPanel
            onClose={() => setAiOpen(false)}
            onApply={(r) => {
              dirty.current = true;
              const join = (a: string, b: string) => (a.trim() ? `${a.trimEnd()}\n${b}` : b);
              setV((prev) => ({
                ...prev,
                detail: r.detail ? join(prev.detail, r.detail) : prev.detail,
                ...(r.handover ? { handoverChoice: "yes" as const, handover: join(prev.handover, r.handover) } : {}),
              }));
              setAiOpen(false);
              toast(r.handover ? "作業内容と引き継ぎ事項に入れました。内容を確認してください" : "作業内容に入れました。引き継ぎ事項は見つかりませんでした");
            }}
          />
        )}
        <Card className="p-4">
          <Field htmlFor="rf-detail" error={fe.detail} description="提出するときは必須です。下書きは空のままでも保存できます。">
            <Textarea
              id="rf-detail"
              name="detail"
              value={v.detail}
              onChange={(e) => set("detail", e.target.value)}
              placeholder="例）共用部 1〜3階の床清掃・ワックス。エントランスのガラス拭き。3階の電球切れを確認。"
              className="min-h-[120px]"
              maxLength={4000}
            />
          </Field>
        </Card>
      </section>

      {/* 経費 */}
      <section className="space-y-3">
        <SectionTitle>経費</SectionTitle>
        <Card className="space-y-4 p-4">
          <p className="text-xs text-ink-muted">経費は本人と最高管理者・事務だけが見られます。</p>
          <ExpenseEditor
            rows={v.expenses}
            onChange={(update) => {
              dirty.current = true;
              setV((prev) => ({ ...prev, expenses: update(prev.expenses) }));
            }}
            blobEnabled={blobEnabled}
            ocrEnabled={aiEnabled}
            onBusyChange={setExpenseBusy}
            error={fe.expenses}
          />
        </Card>
      </section>

      {/* 引き継ぎ */}
      <section className="space-y-3">
        <SectionTitle>引き継ぎ事項</SectionTitle>
        <Card className="p-4">
          <Field required error={fe.handover} description="提出すると現場の「引き継ぎ事項」として登録され、次の人が「確認して停止」するまで表示されます。">
            <div className="space-y-2">
              <ChoiceToggle name="handoverChoice" value={v.handoverChoice} onChange={(c) => set("handoverChoice", c)} />
              {v.handoverChoice === "yes" && (
                <Textarea
                  name="handover"
                  value={v.handover}
                  onChange={(e) => set("handover", e.target.value)}
                  placeholder="例）3階廊下の電球が切れています。管理会社へ連絡済み。"
                  className="min-h-[88px]"
                  maxLength={1000}
                />
              )}
            </div>
          </Field>
        </Card>
      </section>

      {/* 写真 */}
      <section className="space-y-3">
        <SectionTitle>写真{blobEnabled ? "・動画" : ""}</SectionTitle>
        <Card className="p-4">
          <Field error={fe.photos} description="任意。タイル左上の種別をタップすると「作業／作業前／作業後／その他」を切り替えられます。">
            <PhotoUploader name="photos" defaultKind="WORK" initial={initialPhotos} blobEnabled={blobEnabled} onBusyChange={setPhotoBusy} />
          </Field>
        </Card>
      </section>

      {state.error && (
        <div data-form-error className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{state.error}</span>
          {state.existingReportId && (
            <Link href={`/reports/${state.existingReportId}/edit`} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
              その日報を開く
            </Link>
          )}
        </div>
      )}
      {state.fieldErrors && !state.error && (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-status-danger">
          <X className="h-4 w-4" />
          入力内容を確認してください
        </p>
      )}

      <SubmitButtons submitted={submitted} uploading={uploading} />
      <p className="text-center text-xs text-ink-muted">
        {submitted ? "提出済みの日報を修正して、もう一度提出します。" : "提出すると管理者が内容を確認できるようになります。担当者全員の日報がそろうと、予定は自動で「完了」になります。"}
      </p>
    </form>
  );
}
