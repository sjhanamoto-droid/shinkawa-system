"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Camera, Check, ChevronRight, Loader2, TrainFront, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";
import { PhotoUploader, type UploaderPhoto } from "@/components/photo-uploader";
import { saveReport, type ReportFormState } from "@/features/reports/actions";
import { prepareReceipt } from "@/features/reports/expense-editor";
import { readReceipt } from "@/features/reports/receipt-ocr";
import { fmtClock, fmtDayLabel, fmtDuration, fmtHm, fmtHoursShort, fmtYenShort, MAX_END_MIN, stepTime, toSavedTimes, TIME_STEP } from "@/lib/worker";
import { BackButton, FooterBar, FooterSpacer, PrimaryButton, TwoTapDelete } from "../ui/parts";
import { TollSheet } from "./toll-sheet";
import { ReceiptSheet } from "./receipt-sheet";
import {
  canLeaveReport,
  canLeaveTransport,
  newKey,
  receiptKindLabel,
  receiptTotal,
  receiptTotalsByKind,
  serializeWizardExpenses,
  tollRouteLabel,
  tollSubLabel,
  tollTotal,
  trainAmount,
  transportTotal,
  type ReceiptItem,
  type WizardValues,
} from "./model";

// スタッフ画面の日報（現場 → 時間 → 交通費 → 経費 → 報告 → 確認 → 送信）。
// 全ステップを1つのフォームに置き、見えているステップだけ表示する（写真の入力などの状態を保つため）。
// 端末に自動保存し、開き直したら復元を提案する（管理画面の日報と同じ考え方）。

export type WizardSite = {
  name: string;
  customerName: string | null;
  workLabel: string;
  startTime: string | null;
  endTime: string | null;
  address: string | null;
};

export type WizardProps = {
  reportId?: string;
  occurrenceId?: string;
  propertyId?: string;
  addAssignee?: boolean;
  userId: string;
  workerName: string;
  proxy: boolean;
  workDate: string;
  site: WizardSite;
  submitted: boolean;
  initial: WizardValues;
  initialPhotos: UploaderPhoto[];
  initialStep: number;
  /**
   * 1画面だけ直す（日別の詳細の「修正する」から）。その画面だけを出し、「確定」で保存して詳細に戻る。
   * 次へ・進み具合のマスは出さない
   */
  single?: boolean;
  blobEnabled: boolean;
  aiEnabled: boolean;
  storageKey: string;
  /** 1画面目の戻る・閉じた後の行き先 */
  exitHref: string;
};

const STEPS = ["現場", "時間", "交通費", "経費", "報告"] as const;
const HEADINGS = ["今日の現場は\n正しいですか？", "何時から何時まで\n働きましたか？", "交通費は\nありましたか？", "領収書は\nありますか？", "今日の作業を\nひとこと", "この内容で\n送りますか？"];
const TTL = 24 * 60 * 60 * 1000;
/** 1画面だけ直すときの見出し */
const SINGLE_HEADINGS = ["現場", "時間を\n修正する", "交通費を\n修正する", "経費を\n修正する", "作業内容を\n修正する", "確認"];

/** 端末に残す形（撮ったばかりで保存前の写真は容量が大きいので外す） */
function forLocal(v: WizardValues): WizardValues {
  return {
    ...v,
    receipts: v.receipts
      .filter((r) => r.status !== "reading")
      // 保存前の写真（dataUrl）は外す。外した行は確認が必要な行（黄色）にして、撮り直しに気づけるように
      .map((r) => (r.receipt && "dataUrl" in r.receipt ? { ...r, preview: null, receipt: null, status: "check" as const } : { ...r, preview: null })),
  };
}

/** 変更があったかを比べる形（画面だけの状態・撮ったばかりの写真の中身は外す） */
function compareKey(v: WizardValues): string {
  return JSON.stringify({
    ...v,
    tolls: v.tolls.map((t) => [t.from, t.to, t.car, t.round, t.amount, t.fareLabel]),
    receipts: v.receipts.map((r) => ({
      kind: r.kind,
      amount: r.amount,
      paidOn: r.paidOn,
      memo: r.memo,
      receipt: r.receipt ? ("id" in r.receipt ? r.receipt.id : "new") : null,
    })),
    detail: v.detail.trim(),
    handoverText: v.handover === "yes" ? v.handoverText.trim() : "",
  });
}

export function ReportWizard(props: WizardProps) {
  const { site, workDate, blobEnabled, aiEnabled, storageKey } = props;
  const router = useRouter();
  const [state, formAction] = useActionState<ReportFormState, FormData>(saveReport, {});
  const [step, setStep] = useState(props.initialStep);
  const [v, setV] = useState<WizardValues>(props.initial);
  const [restore, setRestore] = useState<WizardValues | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [tollOpen, setTollOpen] = useState(false);
  const [receiptEdit, setReceiptEdit] = useState<{ item: ReceiptItem | null } | null>(null);
  const [noneHint, setNoneHint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // 1画面だけ直すとき：最初の値と比べて、どこか変わったら「確定」を押せるようにする
  const initialKey = useMemo(() => compareKey(props.initial), [props.initial]);
  const [photosChanged, setPhotosChanged] = useState(false);
  useEffect(() => {
    if (!props.single) return;
    // 写真は写真の部品の中で持っているので、送る値（hidden）を見比べる
    const input = () => formRef.current?.querySelector<HTMLInputElement>('input[name="photos"]');
    const first = input()?.value ?? "";
    const t = setInterval(() => setPhotosChanged((input()?.value ?? "") !== first), 400);
    return () => clearInterval(t);
  }, [props.single]);
  const dirty = useRef(false);
  const set = <K extends keyof WizardValues>(k: K, val: WizardValues[K]) => {
    dirty.current = true;
    setV((p) => ({ ...p, [k]: val }));
  };
  const patchReceipt = (key: string, p: Partial<ReceiptItem>) => setV((prev) => ({ ...prev, receipts: prev.receipts.map((r) => (r.key === key ? { ...r, ...p } : r)) }));

  // ── 端末への自動保存 ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { savedAt: number; values: WizardValues };
      if (!saved?.savedAt || Date.now() - saved.savedAt > TTL) {
        localStorage.removeItem(storageKey);
        return;
      }
      if (JSON.stringify(saved.values) !== JSON.stringify(forLocal(props.initial))) setRestore(saved.values);
    } catch {
      /* 端末に保存できない環境では何もしない */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      if (!dirty.current) return; // 送信した後は書き戻さない
      try {
        localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), values: forLocal(v) }));
      } catch {
        /* noop */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [v, storageKey]);

  // 送信がエラーで戻ってきたら、該当するステップへ
  useEffect(() => {
    const fe = state.fieldErrors;
    if (!fe && !state.error) return;
    if (props.single) {
      // 1画面だけ直しているときは画面を移らない（エラーは下に出す）
      try {
        localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), values: forLocal(v) }));
      } catch {
        /* noop */
      }
      return;
    }
    // 送れなかったときは端末の下書きを戻す（送信時に消しているため）
    dirty.current = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), values: forLocal(v) }));
    } catch {
      /* noop */
    }
    if (fe?.startTime || fe?.endTime || fe?.workDate) setStep(1);
    else if (fe?.expenses) setStep(3);
    else if (fe?.detail || fe?.handover || fe?.photos) setStep(4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const minutes = v.endMin - v.startMin;
  const reading = v.receipts.some((r) => r.status === "reading");
  const expensesJson = useMemo(() => serializeWizardExpenses(v), [v]);
  const times = toSavedTimes(v.startMin, v.endMin);
  const dayTotal = transportTotal(v) + receiptTotal(v);

  // ── 進み具合の5マス（押せない） ──
  const cellValue = (i: number): string => {
    if (i === 0) return step > 0 ? "✓" : "";
    if (i === 1) return step > 1 ? fmtHoursShort(minutes) : "";
    if (i === 2) return v.transport === "none" ? "なし" : transportTotal(v) > 0 ? fmtYenShort(transportTotal(v)) : "";
    if (i === 3) return receiptTotal(v) > 0 ? fmtYenShort(receiptTotal(v)) : step > 3 ? "なし" : "";
    return v.detail.trim() ? "✓" : "";
  };

  // ── 領収書を撮る：撮るとすぐ一覧に入り、裏で保存と読み取り（待たずに次を撮れる） ──
  async function onCapture(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (fileRef.current) fileRef.current.value = "";
    for (const file of list) {
      const key = newKey("r");
      const preview = URL.createObjectURL(file);
      dirty.current = true;
      setV((p) => ({ ...p, receipts: [...p.receipts, { key, kind: "PARKING", amount: null, paidOn: workDate, memo: "", receipt: null, preview, status: "reading", ocr: false }] }));
      void (async () => {
        try {
          const { receipt, dataUrl } = await prepareReceipt(file, blobEnabled);
          patchReceipt(key, { receipt, preview: receipt && "thumbUrl" in receipt ? receipt.thumbUrl : preview });
          if (!aiEnabled) {
            patchReceipt(key, { status: "check" });
            return;
          }
          const r = await readReceipt(dataUrl);
          if (r.ok) {
            const amount = r.reading.amount && r.reading.amount > 0 ? r.reading.amount : null;
            patchReceipt(key, {
              kind: r.reading.category,
              amount,
              paidOn: r.reading.date ?? workDate,
              memo: r.reading.vendor ?? "",
              ocr: true,
              status: amount ? "ok" : "check",
            });
          } else {
            patchReceipt(key, { status: "check" });
          }
        } catch {
          // 写真を保存できなかったときは行ごと残さない（金額だけの手入力に切り替えてもらう）
          setV((p) => ({ ...p, receipts: p.receipts.filter((x) => x.key !== key) }));
          alertOnce("写真を保存できませんでした。電波の良い場所で撮り直すか、手入力で追加してください");
        }
      })();
    }
  }

  const canNext = step === 2 ? canLeaveTransport(v) : step === 4 ? canLeaveReport(v) : true;
  const nextLabel = step === 0 ? "はい、合っています" : "次へ";
  const done = state.existingReportId;

  return (
    <form
      ref={formRef}
      action={formAction}
      onKeyDown={(e) => {
        // 入力欄で Enter（スマホの「検索」「改行」）を押しても送信しない
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      onSubmit={(e) => {
        // 送れるのは確認の画面から、写真の保存・読み取りが終わってから
        if ((step !== 5 && !props.single) || reading || photoBusy) {
          e.preventDefault();
          return;
        }
        dirty.current = false;
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* noop */
        }
      }}
      className="flex min-h-dvh flex-col bg-[var(--w-primary)]"
    >
      {/* 保存する値（saveReport と同じ項目） */}
      {props.reportId ? (
        <input type="hidden" name="reportId" value={props.reportId} />
      ) : (
        <>
          {props.occurrenceId ? <input type="hidden" name="occurrenceId" value={props.occurrenceId} /> : <input type="hidden" name="propertyId" value={props.propertyId ?? ""} />}
          {props.addAssignee && <input type="hidden" name="addAssignee" value="1" />}
          <input type="hidden" name="userId" value={props.userId} />
          <input type="hidden" name="workDate" value={workDate} />
        </>
      )}
      {/* 1画面だけ直すとき：下書きは下書きのまま、提出済みは提出済みのまま保存し、日別の詳細に戻る */}
      <input type="hidden" name="intent" value={props.single && !props.submitted ? "draft" : "submit"} />
      <input type="hidden" name="next" value={props.single && props.reportId ? `/w/reports/${props.reportId}` : "/w/report/done"} />
      <input type="hidden" name="startTime" value={times.startTime} />
      <input type="hidden" name="endTime" value={times.endTime} />
      <input type="hidden" name="detail" value={v.detail} />
      <input type="hidden" name="expenses" value={expensesJson} />
      <input type="hidden" name="handoverChoice" value={v.handover} />
      <input type="hidden" name="handover" value={v.handover === "yes" ? v.handoverText : ""} />

      {/* ヘッダー：日付・進み具合 */}
      <header className="px-4 text-white w-safe-top">
        <p className="text-[14px] leading-[22px] text-[var(--w-primary-soft)]">
          {fmtDayLabel(workDate)}の日報{props.proxy ? `（${props.workerName}さんの代理入力）` : ""}
        </p>
        {!props.single && (
        <ol className="mt-2 grid grid-cols-5 gap-1" aria-label="進み具合">
          {STEPS.map((label, i) => {
            const current = step === i;
            const passed = step > i;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className={cn("flex h-[60px] flex-col items-center rounded-lg px-0.5 py-1.5", current ? "border-2 border-white" : "", passed || (step === 5 && i < 5) ? "bg-white/30" : "bg-white/[.14]")}
              >
                <span className="text-[13px] font-semibold leading-[18px]">{label}</span>
                <span className="max-w-full truncate text-[12px] leading-[18px]">{cellValue(i)}</span>
              </li>
            );
          })}
        </ol>
        )}
        <h1 className="whitespace-pre-line px-1 py-6 text-[32px] font-medium leading-[44px]">{props.single ? SINGLE_HEADINGS[step] : HEADINGS[step]}</h1>
      </header>

      <div className="flex-1 rounded-t-[20px] bg-white px-5 pt-5">
        {restore && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[15px] text-amber-900">
            <p>前回の入力が端末に残っています。復元しますか？</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="h-11 flex-1 rounded-lg bg-amber-600 font-semibold text-white" onClick={() => { setV(restore); dirty.current = true; setRestore(null); }}>
                復元する
              </button>
              <button type="button" className="h-11 flex-1 rounded-lg border border-amber-300" onClick={() => { try { localStorage.removeItem(storageKey); } catch { /* noop */ } setRestore(null); }}>
                破棄する
              </button>
            </div>
          </div>
        )}

        {/* 0 現場 */}
        <section hidden={step !== 0}>
          <div className="rounded-[18px] border border-[var(--w-border)] p-5">
            <div className="flex items-end justify-between gap-3">
              <p className="text-[34px] leading-[44px] text-[var(--w-primary)]">
                {site.startTime ? fmtHm(site.startTime) : "時間未定"}
                {site.endTime && <span className="text-[17px]">〜{fmtHm(site.endTime)}</span>}
              </p>
              {site.customerName && <p className="mb-1 min-w-0 truncate text-[15px] text-[var(--w-text-muted)]">{site.customerName}</p>}
            </div>
            <p className="mt-3 break-words text-[28px] leading-[38px]">{site.name}</p>
            <p className="text-[17px] text-[var(--w-text-sub)]">{site.workLabel}</p>
            {site.address && <p className="mt-2 text-[15px] text-[var(--w-text-muted)]">{site.address}</p>}
          </div>
          {props.submitted && <p className="mt-4 rounded-xl bg-[var(--w-primary-soft)] px-4 py-3 text-[15px] text-[var(--w-primary-dark)]">提出済みの日報を直しています。最後に「この内容で送る」で保存されます。</p>}
        </section>

        {/* 1 時間 */}
        <section hidden={step !== 1} className="space-y-4">
          <TimeBox label="始めた時間" value={v.startMin} onChange={(m) => set("startMin", Math.min(m, v.endMin - TIME_STEP))} lo={0} hi={1440 - TIME_STEP} />
          <TimeBox
            label="終わった時間"
            value={v.endMin}
            onChange={(m) => set("endMin", Math.min(Math.max(m, v.startMin + TIME_STEP), Math.min(MAX_END_MIN, v.startMin + 1440 - TIME_STEP)))}
            lo={v.startMin + TIME_STEP}
            hi={Math.min(MAX_END_MIN, v.startMin + 1440 - TIME_STEP)}
            allowNextDay
          />
          {(state.fieldErrors?.startTime || state.fieldErrors?.endTime) && (
            <p className="text-[15px] text-[var(--w-danger)]">{state.fieldErrors.startTime ?? state.fieldErrors.endTime}</p>
          )}
          <p className="text-center text-[22px] font-semibold text-[var(--w-primary)]">合計 {fmtDuration(minutes)}</p>
          <p className="text-center text-[15px] text-[var(--w-text-muted)]">＋−は{TIME_STEP}分ずつ。時間を押すと入力できます</p>
        </section>

        {/* 2 交通費 */}
        <section hidden={step !== 2} className="space-y-3">
          {v.tolls.map((t) => (
            <div key={t.key} className="rounded-[14px] border-2 border-[var(--w-primary)] bg-[var(--w-primary-soft)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[18px] font-semibold">{tollRouteLabel(t)}</p>
                  <p className="text-[15px] text-[var(--w-text-sub)]">{tollSubLabel(t)}</p>
                </div>
                <p className="text-[24px] font-semibold">{fmtYenShort(t.amount)}</p>
              </div>
              <div className="mt-1 text-right">
                <TwoTapDelete onDelete={() => set("tolls", v.tolls.filter((x) => x.key !== t.key))} className="h-10 text-[16px] font-semibold" />
              </div>
            </div>
          ))}
          <OptionButton
            icon={<RoadIcon />}
            label={v.tolls.length ? "もう1区間 追加" : "高速を使った"}
            active={v.tolls.length > 0}
            onClick={() => {
              setNoneHint(false);
              setTollOpen(true);
            }}
          />
          <OptionButton
            icon={<TrainFront className="h-7 w-7" />}
            label="電車・バスを使った"
            active={v.train.on}
            onClick={() => {
              setNoneHint(false);
              set("train", { ...v.train, on: !v.train.on });
              if (!v.train.on) set("transport", "used");
            }}
          />
          {v.train.on && (
            <label className="block rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-3">
              <span className="text-[15px] font-semibold">電車・バス代（円）</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={v.train.amount}
                onChange={(e) => set("train", { on: true, amount: e.target.value })}
                placeholder="往復の合計"
                className="mt-2 h-14 w-full rounded-xl border border-[#94a3b8] bg-white px-4 text-[22px] outline-none"
              />
            </label>
          )}
          <OptionButton
            icon={<Ban className="h-7 w-7" />}
            label="交通費はなし"
            active={v.transport === "none" && transportTotal(v) === 0}
            onClick={() => {
              if (v.tolls.length > 0 || v.train.on) {
                setNoneHint(true);
                return;
              }
              set("transport", "none");
            }}
          />
          {noneHint && (
            <p className="rounded-xl bg-[var(--w-check-bg)] px-4 py-3 text-[15px] text-[var(--w-warning-text)]">
              入力した交通費があります。なしにする場合は、先に各行を削除してください。
            </p>
          )}
        </section>

        {/* 3 経費（領収書） */}
        <section hidden={step !== 3} className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onCapture(e.target.files)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-[76px] w-full items-center justify-center gap-3 rounded-[18px] bg-[var(--w-primary)] text-[21px] font-semibold text-white active:bg-[var(--w-primary-dark)]"
          >
            <Camera className="h-8 w-8" />
            {v.receipts.length ? "もう1枚撮る" : "領収書を撮る"}
          </button>
          <button type="button" onClick={() => setReceiptEdit({ item: null })} className="h-14 w-full rounded-xl border border-[#94a3b8] text-[17px] font-semibold">
            手入力で追加
          </button>
          {state.fieldErrors?.expenses && <p className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">{state.fieldErrors.expenses}</p>}
          {v.receipts.map((r) => (
            <ReceiptRow key={r.key} r={r} onEdit={() => r.status !== "reading" && setReceiptEdit({ item: r })} />
          ))}
          {v.receipts.length > 0 ? (
            <div className="flex items-baseline justify-between px-1 pt-1">
              <span className="text-[18px] font-semibold">合計 {v.receipts.length}枚</span>
              <span className="text-[20px] text-[var(--w-primary)]">{fmtYenShort(receiptTotal(v))}</span>
            </div>
          ) : (
            <p className="pt-2 text-center text-[15px] text-[var(--w-text-muted)]">駐車場・ガソリン・資材などの領収書を撮ってください。無ければそのまま「次へ」</p>
          )}
        </section>

        {/* 4 報告 */}
        <section hidden={step !== 4} className="space-y-4">
          <label className="block">
            <span className="text-[16px] font-semibold">作業内容</span>
            <textarea
              value={v.detail}
              onChange={(e) => set("detail", e.target.value)}
              maxLength={4000}
              placeholder="例）予定どおり完了しました"
              className="mt-2 min-h-[120px] w-full rounded-xl border border-[#94a3b8] px-4 py-3 text-[18px] leading-7 outline-none"
            />
            {state.fieldErrors?.detail && <span className="text-[14px] text-[var(--w-danger)]">{state.fieldErrors.detail}</span>}
          </label>
          {!v.detail.includes("予定どおり完了しました") && (
            <button
              type="button"
              onClick={() => set("detail", v.detail.trim() ? `${v.detail.trimEnd()}\n予定どおり完了しました` : "予定どおり完了しました")}
              className="h-12 rounded-full border border-[#a7f3d0] bg-[var(--w-primary-soft)] px-5 text-[16px] text-[var(--w-primary-dark)]"
            >
              予定どおり完了しました
            </button>
          )}
          <div>
            <p className="text-[16px] font-semibold">次の人への引き継ぎ</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(["no", "yes"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("handover", c)}
                  aria-pressed={v.handover === c}
                  className={cn("h-14 rounded-xl border-2 text-[18px] font-semibold", v.handover === c ? "border-[var(--w-primary)] text-[var(--w-primary)]" : "border-[var(--w-border)]")}
                >
                  {c === "no" ? "なし" : "あり"}
                </button>
              ))}
            </div>
            {v.handover === "yes" && (
              <textarea
                value={v.handoverText}
                onChange={(e) => set("handoverText", e.target.value)}
                maxLength={1000}
                placeholder="例）3階の電球が切れています"
                className="mt-3 min-h-[96px] w-full rounded-xl border border-[var(--w-check-border)] bg-[var(--w-check-bg)] px-4 py-3 text-[17px] outline-none"
              />
            )}
            {state.fieldErrors?.handover && <span className="text-[14px] text-[var(--w-danger)]">{state.fieldErrors.handover}</span>}
          </div>
          <details className="rounded-xl border border-dashed border-[#94a3b8] bg-[var(--w-soft-bg)] px-4 py-3" open={props.initialPhotos.length > 0}>
            <summary className="cursor-pointer text-center text-[16px] text-[var(--w-text-sub)]">現場の写真を追加（任意）</summary>
            {state.fieldErrors?.photos && <p className="mt-2 text-[14px] text-[var(--w-danger)]">{state.fieldErrors.photos}</p>}
            <div className="mt-3">
              <PhotoUploader name="photos" defaultKind="WORK" initial={props.initialPhotos} blobEnabled={blobEnabled} onBusyChange={setPhotoBusy} />
            </div>
          </details>
        </section>

        {/* 5 確認 */}
        <section hidden={step !== 5}>
          <ConfirmRow label="現場" value={site.name} onClick={() => setStep(0)} />
          <ConfirmRow label="時間" value={`${fmtClock(v.startMin)}〜${fmtClock(v.endMin)}`} onClick={() => setStep(1)} />
          {tollTotal(v) > 0 && <ConfirmRow label="高速代" value={fmtYenShort(tollTotal(v))} onClick={() => setStep(2)} />}
          {trainAmount(v) > 0 && <ConfirmRow label="電車・バス代" value={fmtYenShort(trainAmount(v))} onClick={() => setStep(2)} />}
          {transportTotal(v) === 0 && <ConfirmRow label="交通費" value="なし" onClick={() => setStep(2)} />}
          {(() => {
            const k = receiptTotalsByKind(v);
            return (
              <>
                {k.parking > 0 && <ConfirmRow label="駐車場" value={fmtYenShort(k.parking)} onClick={() => setStep(3)} />}
                {k.fuel > 0 && <ConfirmRow label="ガソリン" value={fmtYenShort(k.fuel)} onClick={() => setStep(3)} />}
                {k.others > 0 && <ConfirmRow label="資材・その他" value={fmtYenShort(k.others)} onClick={() => setStep(3)} />}
                {v.receipts.length === 0 && <ConfirmRow label="経費" value="なし" onClick={() => setStep(3)} />}
              </>
            );
          })()}
          {v.receipts.some((r) => r.status === "check") && (
            <p className="my-2 flex items-center gap-2 rounded-xl bg-[var(--w-check-bg)] px-4 py-3 text-[15px] text-[var(--w-warning-text)]">
              <TriangleAlert className="h-5 w-5 shrink-0" />
              金額が入っていない領収書があります。経費に戻って金額を入れると送れます
            </p>
          )}
          <ConfirmRow label="作業内容" value={v.detail.trim() ? "入力済み" : "未入力"} warn={!v.detail.trim()} onClick={() => setStep(4)} />
          <ConfirmRow label="引き継ぎ" value={v.handover === "yes" ? "あり" : v.handover === "no" ? "なし" : "未選択"} warn={!v.handover} onClick={() => setStep(4)} />
          <div className="flex items-center justify-between py-5">
            <span className="text-[18px] font-semibold">今日の立替 合計</span>
            <span className="text-[44px] leading-none text-[var(--w-primary)]">{fmtYenShort(dayTotal)}</span>
          </div>
          {state.error && (
            <div className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">
              <p>{state.error}</p>
              {done && (
                <Link href={`/w/report?reportId=${done}`} className="mt-2 inline-flex h-11 items-center rounded-lg bg-red-600 px-4 font-semibold text-white">
                  その日報を開く
                </Link>
              )}
            </div>
          )}
          {state.fieldErrors && !state.error && <p className="mb-3 text-[15px] text-red-700">入力内容を確認してください</p>}
        </section>
        {props.single && (state.error || state.fieldErrors) && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">
            {state.error ?? Object.values(state.fieldErrors ?? {})[0] ?? "入力内容を確認してください"}
          </div>
        )}
        <FooterSpacer />
      </div>

      <FooterBar>
        <BackButton onClick={() => (step === 0 || props.single ? router.push(props.exitHref) : setStep(step - 1))}>戻る</BackButton>
        {props.single ? (
          <SendButton
            busy={reading || photoBusy}
            ready={(photosChanged || compareKey(v) !== initialKey) && canNext && v.receipts.every((r) => r.status === "reading" || r.amount)}
            label="確定"
          />
        ) : step < 5 ? (
          <PrimaryButton disabled={!canNext} onClick={() => setStep(step + 1)}>
            {nextLabel}
          </PrimaryButton>
        ) : (
          <SendButton busy={reading || photoBusy} ready={canLeaveTransport(v) && canLeaveReport(v) && !!v.detail.trim() && v.receipts.every((r) => r.amount)} />
        )}
      </FooterBar>

      <TollSheet
        open={tollOpen}
        onClose={() => setTollOpen(false)}
        onConfirm={(t) => {
          dirty.current = true;
          setV((p) => ({ ...p, tolls: [...p.tolls, t], transport: "used" }));
          setTollOpen(false);
        }}
      />
      <ReceiptSheet
        open={!!receiptEdit}
        item={receiptEdit?.item ?? null}
        defaultDate={workDate}
        onClose={() => setReceiptEdit(null)}
        onSave={(p) => {
          dirty.current = true;
          const status = p.amount ? "ok" : "check";
          if (receiptEdit?.item) {
            const key = receiptEdit.item.key;
            // 金額を手で直したら「読み取り」の印は外す
            setV((prev) => ({ ...prev, receipts: prev.receipts.map((r) => (r.key === key ? { ...r, ...p, status, ocr: r.ocr && r.amount === p.amount } : r)) }));
          } else {
            setV((prev) => ({ ...prev, receipts: [...prev.receipts, { key: newKey("m"), ...p, receipt: null, preview: null, status, ocr: false }] }));
          }
          setReceiptEdit(null);
        }}
        onDelete={() => {
          const key = receiptEdit?.item?.key;
          if (key) set("receipts", v.receipts.filter((r) => r.key !== key));
          setReceiptEdit(null);
        }}
      />
    </form>
  );
}

let alerted = false;
function alertOnce(msg: string) {
  if (alerted) return;
  alerted = true;
  setTimeout(() => (alerted = false), 3000);
  // 画面を止めないように、通知は控えめに（ブラウザの alert は使わない）
  console.warn(msg);
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = "fixed inset-x-4 top-4 z-[60] mx-auto max-w-[440px] rounded-xl bg-red-600 px-4 py-3 text-[15px] text-white shadow-lg";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function SendButton({ busy, ready, label = "この内容で送る" }: { busy: boolean; ready: boolean; label?: string }) {
  const { pending } = useFormStatus();
  return (
    <PrimaryButton type="submit" disabled={busy || pending || !ready}>
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          保存しています...
        </span>
      ) : busy ? (
        "写真を保存しています..."
      ) : (
        label
      )}
    </PrimaryButton>
  );
}

function TimeBox({ label, value, onChange, lo, hi, allowNextDay = false }: { label: string; value: number; onChange: (m: number) => void; lo: number; hi: number; allowNextDay?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState(value >= 1440);
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const open = () => {
    const base = value >= 1440 ? value - 1440 : value;
    setNext(value >= 1440);
    setH(String(Math.floor(base / 60)));
    setM(String(base % 60).padStart(2, "0"));
    setEditing(true);
  };
  const commit = () => {
    const hh = Math.min(23, Math.max(0, Number(h) || 0));
    const mm = Math.min(59, Math.max(0, Number(m) || 0));
    const snapped = Math.round((hh * 60 + mm) / TIME_STEP) * TIME_STEP + (next && allowNextDay ? 1440 : 0);
    onChange(Math.min(hi, Math.max(lo, snapped)));
    setEditing(false);
  };
  const btn = "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--w-border)] bg-white text-[32px] active:bg-[var(--w-soft-bg)] disabled:opacity-40";
  return (
    <div className="rounded-[14px] bg-[var(--w-soft-bg)] px-4 pb-4 pt-3">
      <p className="text-[16px] font-semibold text-[var(--w-text-sub)]">{label}</p>
      {editing ? (
        <div className="mt-2 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2">
          {allowNextDay ? (
            <button type="button" onClick={() => setNext(!next)} aria-pressed={next} className={cn("h-14 rounded-xl border px-2 text-[15px]", next ? "border-[var(--w-primary)] bg-[var(--w-primary-soft)] text-[var(--w-primary)]" : "border-[var(--w-border)] bg-white")}>
              翌日
            </button>
          ) : (
            <span />
          )}
          <input value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" aria-label="時" className="h-14 w-full rounded-xl border border-[#94a3b8] bg-white text-center text-[26px] outline-none" />
          <span className="text-[26px]">:</span>
          <input value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" aria-label="分" className="h-14 w-full rounded-xl border border-[#94a3b8] bg-white text-center text-[26px] outline-none" />
          <button type="button" onClick={commit} className="h-14 rounded-xl bg-[var(--w-primary)] px-3 text-[16px] font-semibold text-white">
            確定
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <button type="button" aria-label={`${label}を${TIME_STEP}分早く`} onClick={() => onChange(stepTime(value, -1, lo, hi))} disabled={value <= lo} className={btn}>
            −
          </button>
          <button type="button" onClick={open} className="min-w-0 flex-1 border-b-2 border-dashed border-[#94a3b8] pb-1 text-center text-[40px] leading-[52px]" aria-label={`${label} ${fmtClock(value)}（押すと入力できます）`}>
            {fmtClock(value)}
          </button>
          <button type="button" aria-label={`${label}を${TIME_STEP}分遅く`} onClick={() => onChange(stepTime(value, 1, lo, hi))} disabled={value >= hi} className={btn}>
            ＋
          </button>
        </div>
      )}
    </div>
  );
}

function OptionButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex h-16 w-full items-center gap-4 rounded-[14px] border-2 px-5 text-left text-[18px]", active ? "border-[var(--w-primary)]" : "border-[var(--w-border)]")}
    >
      <span className="text-[var(--w-primary)]">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <Check className="h-6 w-6 text-[var(--w-primary)]" />}
    </button>
  );
}

function RoadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M8 3 4 21M16 3l4 18M12 4v3M12 11v3M12 18v2" />
    </svg>
  );
}

function ReceiptRow({ r, onEdit }: { r: ReceiptItem; onEdit: () => void }) {
  const thumb = r.preview ?? (r.receipt && "id" in r.receipt ? photoSrc(r.receipt.id, true) : r.receipt && "thumbUrl" in r.receipt ? r.receipt.thumbUrl : null);
  const reading = r.status === "reading";
  const check = r.status === "check";
  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={reading}
      className={cn(
        "flex min-h-[88px] w-full items-center gap-3 rounded-[14px] border-2 px-3 py-2 text-left",
        check ? "border-[var(--w-check-border)] bg-[var(--w-check-bg)]" : reading ? "border-[var(--w-divider)] bg-[var(--w-soft-bg)]" : "border-[var(--w-divider)] bg-white",
      )}
    >
      <span className="flex h-[64px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--w-disabled-bg)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-center text-[11px] leading-tight text-[var(--w-text-muted)]">
            写真なし
            <br />
            手入力
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {reading ? (
          <>
            <span className="block text-[18px] font-semibold">読み取り中</span>
            <span className="block text-[15px] text-[var(--w-text-muted)]">少しお待ちください</span>
          </>
        ) : (
          <>
            <span className="block truncate text-[18px] font-semibold">{r.kind === "OTHER" && r.memo ? r.memo : receiptKindLabel(r.kind)}</span>
            <span className={cn("block truncate text-[15px]", check ? "text-[var(--w-warning-text)]" : "text-[var(--w-text-muted)]")}>
              {check ? "金額を確認してください" : r.paidOn ? fmtPaidOn(r.paidOn) : ""}
            </span>
          </>
        )}
      </span>
      <span className="shrink-0 text-right">
        {reading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--w-text-muted)]" />
        ) : (
          <>
            <span className={cn("block text-[22px]", check && !r.amount ? "text-[var(--w-warning-text)]" : "")}>{r.amount ? fmtYenShort(r.amount) : "未入力"}</span>
            <span className="block text-[15px] font-semibold text-[var(--w-primary)]">修正する</span>
          </>
        )}
      </span>
    </button>
  );
}

function fmtPaidOn(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return m && day ? `${m}月${day}日` : d;
}

function ConfirmRow({ label, value, onClick, warn = false }: { label: string; value: string; onClick: () => void; warn?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[64px] w-full items-center justify-between gap-3 border-b border-[var(--w-divider)] text-left">
      <span className="text-[17px] text-[var(--w-text-sub)]">{label}</span>
      <span className={cn("flex min-w-0 items-center gap-1 text-[19px] font-semibold", warn && "text-[var(--w-warning-text)]")}>
        <span className="truncate">{value}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
      </span>
    </button>
  );
}
