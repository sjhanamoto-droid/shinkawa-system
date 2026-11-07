// スタッフ画面の日報ウィザードのデータ（純関数。テストしやすいよう画面から切り離す）。
// 保存は既存の saveReport に、管理画面の日報と同じ形（expenses の JSON など）で送る。

import type { ReceiptRef } from "@/features/reports/expense-editor";
import { EXPENSE_CATEGORY_LABEL, isExpenseCategory, type ExpenseCategory } from "@/lib/reports";

export type TollCar = "KEI" | "NORMAL" | "MEDIUM" | "LARGE";
export const TOLL_CAR_LABEL: Record<TollCar, string> = { KEI: "軽自動車", NORMAL: "普通車", MEDIUM: "中型車", LARGE: "大型車" };
export const TOLL_CAR_NOTE: Partial<Record<TollCar, string>> = { MEDIUM: "2t・3tトラックなど", LARGE: "大型トラックなど" };
export const TOLL_CARS: TollCar[] = ["KEI", "NORMAL", "MEDIUM", "LARGE"];
export function isTollCar(v: unknown): v is TollCar {
  return typeof v === "string" && (TOLL_CARS as string[]).includes(v);
}

export type TollEntry = {
  key: string;
  from: string;
  to: string;
  fromIcId: string | null;
  toIcId: string | null;
  car: TollCar | null;
  round: boolean;
  amount: number;
  /** 選んだ料金の種類（ETC料金・現金・深夜割引など。手入力なら null） */
  fareLabel: string | null;
};

/** 領収書（経費）の項目。デザインの4つ（駐車場・ガソリン・資材・その他）＋読み取りで入る科目 */
export type ReceiptKind = ExpenseCategory;
export const RECEIPT_CHIPS: { value: ReceiptKind; label: string }[] = [
  { value: "PARKING", label: "駐車場" },
  { value: "FUEL", label: "ガソリン" },
  { value: "SUPPLIES", label: "資材" },
  { value: "OTHER", label: "その他" },
];
export function receiptKindLabel(k: ReceiptKind): string {
  return RECEIPT_CHIPS.find((c) => c.value === k)?.label ?? EXPENSE_CATEGORY_LABEL[k];
}

export type ReceiptItem = {
  key: string;
  kind: ReceiptKind;
  /** 円（未入力は null） */
  amount: number | null;
  /** 利用日 YYYY-MM-DD（空は未入力） */
  paidOn: string;
  /** その他の内容・店名など */
  memo: string;
  receipt: ReceiptRef | null;
  /** 撮影直後の表示用（まだ保存していない写真のサムネイル） */
  preview: string | null;
  /** reading＝読み取り中、ok、check＝金額の確認が必要（黄色） */
  status: "reading" | "ok" | "check";
  ocr: boolean;
};

export type Transport = "" | "used" | "none";
export type Handover = "" | "yes" | "no";

export type WizardValues = {
  startMin: number;
  endMin: number;
  transport: Transport;
  tolls: TollEntry[];
  train: { on: boolean; amount: string };
  receipts: ReceiptItem[];
  detail: string;
  handover: Handover;
  handoverText: string;
};

let seq = 0;
export function newKey(prefix = "k"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

export function trainAmount(v: Pick<WizardValues, "train">): number {
  if (!v.train.on) return 0;
  const n = Number(v.train.amount);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function tollTotal(v: Pick<WizardValues, "tolls">): number {
  return v.tolls.reduce((s, t) => s + t.amount, 0);
}

export function transportTotal(v: Pick<WizardValues, "tolls" | "train">): number {
  return tollTotal(v) + trainAmount(v);
}

export function receiptTotal(v: Pick<WizardValues, "receipts">): number {
  return v.receipts.reduce((s, r) => s + (r.amount ?? 0), 0);
}

/** 確認画面の行（科目ごとの合計） */
export function receiptTotalsByKind(v: Pick<WizardValues, "receipts">): { parking: number; fuel: number; others: number } {
  let parking = 0;
  let fuel = 0;
  let others = 0;
  for (const r of v.receipts) {
    const a = r.amount ?? 0;
    if (r.kind === "PARKING") parking += a;
    else if (r.kind === "FUEL") fuel += a;
    else others += a;
  }
  return { parking, fuel, others };
}

export function tollRouteLabel(t: Pick<TollEntry, "from" | "to" | "car" | "round">): string {
  return `${t.from} → ${t.to}`;
}
export function tollSubLabel(t: Pick<TollEntry, "car" | "round"> & { fareLabel?: string | null }): string {
  return [t.car ? TOLL_CAR_LABEL[t.car] : null, t.round ? "往復" : "片道", t.fareLabel || null].filter(Boolean).join("・");
}

/** 交通費は「選ばないと次へ進めない」 */
export function canLeaveTransport(v: Pick<WizardValues, "transport" | "tolls" | "train">): boolean {
  if (v.transport === "none") return true;
  return v.tolls.length > 0 || trainAmount(v) > 0;
}

/** 引き継ぎは「選ばないと次へ進めない」。ありなら内容も要る */
export function canLeaveReport(v: Pick<WizardValues, "handover" | "handoverText">): boolean {
  if (v.handover === "no") return true;
  return v.handover === "yes" && v.handoverText.trim().length > 0;
}

/** saveReport に送る expenses の JSON（管理画面の日報と同じ形） */
export function serializeWizardExpenses(v: WizardValues): string {
  const rows: unknown[] = [];
  for (const t of v.tolls) {
    rows.push({
      category: "HIGHWAY",
      label: `${tollRouteLabel(t)}（${tollSubLabel(t)}）`.slice(0, 50),
      amount: String(t.amount),
      paidOn: "",
      ocr: false,
      receipt: null,
      toll: { from: t.from, to: t.to, fromIcId: t.fromIcId, toIcId: t.toIcId, car: t.car, round: t.round, fareLabel: t.fareLabel },
    });
  }
  const train = trainAmount(v);
  if (train > 0) rows.push({ category: "TRAVEL", label: "電車・バス", amount: String(train), paidOn: "", ocr: false, receipt: null });
  for (const r of v.receipts) {
    if (r.status === "reading") continue;
    rows.push({ category: r.kind, label: r.memo.trim().slice(0, 50), amount: r.amount ? String(r.amount) : "", paidOn: r.paidOn, ocr: r.ocr, receipt: r.receipt });
  }
  return JSON.stringify(rows);
}

/** 保存済みの経費（loadReport の expenses ＋以前の形式）→ ウィザードの値 */
export function fromSavedExpenses(
  expenses: {
    id: string;
    category: string;
    label: string;
    amount: number;
    paidOn: string | null;
    ocr: boolean;
    receiptPhotoId: string | null;
    tollFrom?: string | null;
    tollTo?: string | null;
    tollFromIcId?: string | null;
    tollToIcId?: string | null;
    tollCar?: string | null;
    tollRound?: boolean | null;
    tollFareLabel?: string | null;
  }[],
  legacy: { parkingFee: number | null; trainFare: number | null },
): Pick<WizardValues, "tolls" | "train" | "receipts"> {
  const tolls: TollEntry[] = [];
  const receipts: ReceiptItem[] = [];
  let trainSum = 0;
  for (const e of expenses) {
    if (e.category === "HIGHWAY" && e.tollFrom && e.tollTo && !e.receiptPhotoId) {
      tolls.push({
        key: e.id,
        from: e.tollFrom,
        to: e.tollTo,
        fromIcId: e.tollFromIcId ?? null,
        toIcId: e.tollToIcId ?? null,
        car: isTollCar(e.tollCar) ? e.tollCar : null,
        round: !!e.tollRound,
        amount: e.amount,
        fareLabel: e.tollFareLabel ?? null,
      });
      continue;
    }
    // スタッフ画面で入れた「電車・バス」の行だけを電車・バス代に戻す（管理画面で入れたタクシー代などは経費の行のまま）
    if (e.category === "TRAVEL" && !e.receiptPhotoId && e.label === "電車・バス" && !e.paidOn && trainSum === 0) {
      trainSum += e.amount;
      continue;
    }
    receipts.push({
      key: e.id,
      kind: isExpenseCategory(e.category) ? e.category : "OTHER",
      amount: e.amount > 0 ? e.amount : null,
      paidOn: e.paidOn ?? "",
      memo: e.label,
      receipt: e.receiptPhotoId ? { id: e.receiptPhotoId } : null,
      preview: null,
      status: e.amount > 0 ? "ok" : "check",
      ocr: e.ocr,
    });
  }
  if (legacy.trainFare && legacy.trainFare > 0) trainSum += legacy.trainFare;
  if (legacy.parkingFee && legacy.parkingFee > 0) {
    receipts.unshift({ key: "legacy-parking", kind: "PARKING", amount: legacy.parkingFee, paidOn: "", memo: "", receipt: null, preview: null, status: "ok", ocr: false });
  }
  return { tolls, train: { on: trainSum > 0, amount: trainSum > 0 ? String(trainSum) : "" }, receipts };
}
