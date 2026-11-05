import { describe, expect, it } from "vitest";
import { fmtMonthLabel, isMonthKey, summarizeExpenses, toExpenseItems, type ExpenseSourceReport } from "./expenses";
import { can } from "./permissions";

const reports: ExpenseSourceReport[] = [
  {
    id: "r2", workDateKey: "2026-11-02", userName: "豊川", parkingFee: null, trainFare: null,
    expenses: [{ id: "e3", category: "FUEL", label: "ENEOS", amount: 3000, paidOn: "2026-11-02", receiptPhotoId: "p1" }],
  },
  {
    id: "r1", workDateKey: "2026-10-31", userName: "山口", parkingFee: 500, trainFare: 320,
    expenses: [
      { id: "e1", category: "SUPPLIES", label: "ホームセンター", amount: 1200, paidOn: null, receiptPhotoId: null },
      { id: "e2", category: "", label: "", amount: 100, paidOn: null, receiptPhotoId: null },
    ],
  },
];

describe("toExpenseItems", () => {
  it("旧形式の駐車場代・電車賃も行にして、作業日順に並べる", () => {
    const items = toExpenseItems(reports);
    expect(items.map((i) => i.key)).toEqual(["r1:parking", "r1:train", "e1", "e2", "e3"]);
    expect(items[0]).toMatchObject({ category: "PARKING", amount: 500, ym: "2026-10", userName: "山口" });
    expect(items[1]).toMatchObject({ category: "TRAVEL", amount: 320 });
    expect(items[3]).toMatchObject({ category: "", categoryLabel: "科目未選択" });
  });
});

describe("summarizeExpenses", () => {
  const items = toExpenseItems(reports);

  it("全期間の合計・月別（新しい月が先）・科目別（定義順）", () => {
    const s = summarizeExpenses(items);
    expect(s.total).toBe(500 + 320 + 1200 + 100 + 3000);
    expect(s.byMonth).toEqual([
      { ym: "2026-11", total: 3000, count: 1 },
      { ym: "2026-10", total: 2120, count: 4 },
    ]);
    expect(s.byCategory.map((c) => c.category)).toEqual(["TRAVEL", "PARKING", "FUEL", "SUPPLIES", ""]);
  });

  it("月を指定するとその月だけを集計する（月またぎ）", () => {
    const s = summarizeExpenses(items, "2026-10");
    expect(s.total).toBe(2120);
    expect(s.items).toHaveLength(4);
    expect(s.byMonth).toEqual([{ ym: "2026-10", total: 2120, count: 4 }]);
  });

  it("経費なしは0円", () => {
    expect(summarizeExpenses([])).toEqual({ items: [], total: 0, byMonth: [], byCategory: [] });
  });
});

describe("expense.view（現場の経費集計を見られる人）", () => {
  it("最高管理者・事務だけ", () => {
    const actor = (role: string) => ({ id: "u", role, department: null });
    expect(can(actor("OWNER"), "expense.view")).toBe(true);
    expect(can(actor("OFFICE"), "expense.view")).toBe(true);
    expect(can(actor("SCHEDULER"), "expense.view")).toBe(false);
    expect(can(actor("STAFF"), "expense.view")).toBe(false);
    expect(can(null, "expense.view")).toBe(false);
  });
});

describe("月キー", () => {
  it("表示と判定", () => {
    expect(fmtMonthLabel("2026-03")).toBe("2026年3月");
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});
