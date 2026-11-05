/**
 * 現場ごとの経費集計（純粋関数）。DB からの取得は features/expenses/queries.ts。
 * 経費は日報（作業日・作業者・現場）に紐づくので、月は「日報の作業日」で振り分ける。
 */
import { EXPENSE_CATEGORY_LABEL, EXPENSE_CATEGORY_OPTIONS, isExpenseCategory } from "@/lib/reports";

/** 集計の元になる日報1件分（提出済みのみ渡す） */
export type ExpenseSourceReport = {
  id: string;
  workDateKey: string; // 'YYYY-MM-DD'
  userName: string;
  parkingFee: number | null; // 旧形式
  trainFare: number | null; // 旧形式
  expenses: { id: string; category: string; label: string; amount: number; paidOn: string | null; receiptPhotoId: string | null }[];
};

export type ExpenseItem = {
  key: string;
  reportId: string;
  workDateKey: string;
  ym: string; // 'YYYY-MM'
  userName: string;
  category: string; // ExpenseCategory or "" (科目未選択)
  categoryLabel: string;
  label: string;
  amount: number;
  paidOn: string | null; // 'YYYY-MM-DD'
  receiptPhotoId: string | null;
};

export type MonthTotal = { ym: string; total: number; count: number };
export type CategoryTotal = { category: string; label: string; total: number; count: number };

export type ExpenseSummary = {
  items: ExpenseItem[];
  total: number;
  byMonth: MonthTotal[]; // 新しい月が先
  byCategory: CategoryTotal[]; // 科目の定義順、0円の科目は除く
};

const UNSET_LABEL = "科目未選択";

function categoryLabelOf(category: string): string {
  return isExpenseCategory(category) ? EXPENSE_CATEGORY_LABEL[category] : UNSET_LABEL;
}

/** 日報 → 経費行（旧形式の駐車場代・電車賃も1行にする） */
export function toExpenseItems(reports: ExpenseSourceReport[]): ExpenseItem[] {
  const items: ExpenseItem[] = [];
  for (const r of reports) {
    const base = { reportId: r.id, workDateKey: r.workDateKey, ym: r.workDateKey.slice(0, 7), userName: r.userName, label: "", paidOn: null, receiptPhotoId: null };
    if (r.parkingFee && r.parkingFee > 0) items.push({ ...base, key: `${r.id}:parking`, category: "PARKING", categoryLabel: EXPENSE_CATEGORY_LABEL.PARKING, amount: r.parkingFee });
    if (r.trainFare && r.trainFare > 0) items.push({ ...base, key: `${r.id}:train`, category: "TRAVEL", categoryLabel: EXPENSE_CATEGORY_LABEL.TRAVEL, amount: r.trainFare });
    for (const e of r.expenses) {
      const category = isExpenseCategory(e.category) ? e.category : "";
      items.push({ ...base, key: e.id, category, categoryLabel: categoryLabelOf(e.category), label: e.label, amount: e.amount, paidOn: e.paidOn, receiptPhotoId: e.receiptPhotoId });
    }
  }
  return items.sort((a, b) => (a.workDateKey === b.workDateKey ? 0 : a.workDateKey < b.workDateKey ? -1 : 1));
}

/** 経費行を集計する。ym を渡すとその月だけに絞る */
export function summarizeExpenses(all: ExpenseItem[], ym?: string | null): ExpenseSummary {
  const items = ym ? all.filter((i) => i.ym === ym) : all;
  const months = new Map<string, MonthTotal>();
  const cats = new Map<string, CategoryTotal>();
  let total = 0;
  for (const i of items) {
    total += i.amount;
    const m = months.get(i.ym) ?? { ym: i.ym, total: 0, count: 0 };
    m.total += i.amount;
    m.count += 1;
    months.set(i.ym, m);
    const c = cats.get(i.category) ?? { category: i.category, label: i.categoryLabel, total: 0, count: 0 };
    c.total += i.amount;
    c.count += 1;
    cats.set(i.category, c);
  }
  const order = [...EXPENSE_CATEGORY_OPTIONS, ""] as string[];
  return {
    items,
    total,
    byMonth: [...months.values()].sort((a, b) => (a.ym < b.ym ? 1 : -1)),
    byCategory: [...cats.values()].filter((c) => c.total !== 0).sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)),
  };
}

/** 'YYYY-MM' → '2026年10月' */
export function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

export function isMonthKey(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}
