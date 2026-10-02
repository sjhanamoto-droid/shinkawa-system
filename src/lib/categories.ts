import { CATEGORY, CATEGORY_OPTIONS, isDepartment, type ContractType, type Department } from "./constants";

// 種別（カレンダーのタグ）。名称・略称・色・並び順は「種別マスタ」（Category テーブル）で変えられる。
// サーバーでは getCategories()（categories-server.ts）、画面では useCategories()（category-provider.tsx）で一覧を取り、
// ここの関数で引く。テーブルが空のとき・見つからないキーは、最初からある定義（constants の CATEGORY）にフォールバックする。

export type Cat = {
  key: string;
  label: string;
  short: string;
  color: string;
  department: Department | null; // null は両部門共通
  sortOrder: number;
  active: boolean;
  builtin: boolean;
};

export const DEFAULT_CATEGORIES: Cat[] = CATEGORY_OPTIONS.map((key, i) => ({
  key,
  ...CATEGORY[key],
  sortOrder: (i + 1) * 10,
  active: true,
  builtin: true,
}));

const FALLBACK_COLOR = "#64748b";

export function toCat(row: { key: string; label: string; short: string; color: string; department: string | null; sortOrder: number; active: boolean; builtin: boolean }): Cat {
  return { ...row, department: isDepartment(row.department) ? row.department : null };
}

export function catOf(list: Cat[], key: string | null | undefined): Cat | null {
  if (!key) return null;
  return list.find((c) => c.key === key) ?? DEFAULT_CATEGORIES.find((c) => c.key === key) ?? null;
}
export function catLabel(list: Cat[], key: string | null | undefined): string {
  return catOf(list, key)?.label ?? key ?? "—";
}
export function catShort(list: Cat[], key: string | null | undefined): string {
  return catOf(list, key)?.short ?? "—";
}
export function catColor(list: Cat[], key: string | null | undefined): string {
  return catOf(list, key)?.color ?? FALLBACK_COLOR;
}
export function catDepartment(list: Cat[], key: string | null | undefined): Department | null {
  return catOf(list, key)?.department ?? null;
}

/** 選択肢に出す種別（使う設定のものだけ。current は使わない設定でも残す＝編集中の予定の種別が消えないように） */
export function selectableCategories(list: Cat[], opts: { department?: Department | ""; current?: string | null; excludeOff?: boolean } = {}): Cat[] {
  return list.filter(
    (c) =>
      (c.active || c.key === opts.current) &&
      (!opts.excludeOff || c.key !== "OFF") &&
      (!opts.department || !c.department || c.department === opts.department),
  );
}

/** 種別を選んだときに自動で選ぶ頻度（定期清掃→定期、工事部門の種別→工事、それ以外→スポット） */
export function defaultContractTypeFor(list: Cat[], key: string): ContractType {
  if (key === "REGULAR_CLEANING") return "REGULAR";
  if (catDepartment(list, key) === "CONSTRUCTION") return "CONSTRUCTION";
  return "SPOT";
}

/** 部門を選んだときの最初の種別 */
export function defaultCategoryFor(list: Cat[], dept: Department): string {
  const preferred = dept === "CLEANING" ? "REGULAR_CLEANING" : "INTERIOR";
  const usable = selectableCategories(list, { department: dept, excludeOff: true });
  return usable.find((c) => c.key === preferred)?.key ?? usable.find((c) => c.department === dept)?.key ?? usable[0]?.key ?? preferred;
}
