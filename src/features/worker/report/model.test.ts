import { describe, expect, it } from "vitest";
import { canLeaveReport, canLeaveTransport, fromSavedExpenses, serializeWizardExpenses, transportTotal, receiptTotalsByKind, type WizardValues } from "./model";

const base: WizardValues = {
  startMin: 480,
  endMin: 1020,
  transport: "",
  tolls: [],
  train: { on: false, amount: "" },
  receipts: [],
  detail: "",
  handover: "",
  handoverText: "",
};

describe("worker report: 次へ の条件", () => {
  it("交通費は なし・高速・電車（金額あり）のどれかが要る", () => {
    expect(canLeaveTransport(base)).toBe(false);
    expect(canLeaveTransport({ ...base, transport: "none" })).toBe(true);
    expect(canLeaveTransport({ ...base, train: { on: true, amount: "" } })).toBe(false);
    expect(canLeaveTransport({ ...base, train: { on: true, amount: "640" } })).toBe(true);
  });
  it("引き継ぎは なし か、あり＋内容", () => {
    expect(canLeaveReport(base)).toBe(false);
    expect(canLeaveReport({ ...base, handover: "no" })).toBe(true);
    expect(canLeaveReport({ ...base, handover: "yes" })).toBe(false);
    expect(canLeaveReport({ ...base, handover: "yes", handoverText: "電球切れ" })).toBe(true);
  });
});

describe("worker report: 保存の形と読み込み", () => {
  const v: WizardValues = {
    ...base,
    tolls: [{ key: "t1", from: "三郷", to: "本牧ふ頭", fromIcId: "1", toIcId: "2", car: "NORMAL", round: true, amount: 4760, fareLabel: "ETC料金" }],
    train: { on: true, amount: "640" },
    receipts: [
      { key: "r1", kind: "PARKING", amount: 1100, paidOn: "2026-10-05", memo: "", receipt: null, preview: null, status: "ok", ocr: true },
      { key: "r2", kind: "OTHER", amount: null, paidOn: "", memo: "駐輪場", receipt: null, preview: null, status: "check", ocr: false },
      { key: "r3", kind: "FUEL", amount: null, paidOn: "", memo: "", receipt: null, preview: null, status: "reading", ocr: false },
    ],
  };
  it("高速は区間つき、電車は旅費交通費、読み取り中の行は送らない", () => {
    const rows = JSON.parse(serializeWizardExpenses(v)) as { category: string; amount: string; label: string; toll?: { from: string; round: boolean } }[];
    expect(rows.map((r) => r.category)).toEqual(["HIGHWAY", "TRAVEL", "PARKING", "OTHER"]);
    expect(rows[0].toll).toMatchObject({ from: "三郷", round: true });
    expect(rows[0].label).toBe("三郷 → 本牧ふ頭（普通車・往復・ETC料金）");
    expect(rows[1].amount).toBe("640");
    expect(rows[3]).toMatchObject({ amount: "", label: "駐輪場" });
  });
  it("合計", () => {
    expect(transportTotal(v)).toBe(5400);
    expect(receiptTotalsByKind(v)).toEqual({ parking: 1100, fuel: 0, others: 0 });
  });
  it("保存済みの経費をウィザードの値に戻す（以前の形式の駐車場代・電車賃も）", () => {
    const back = fromSavedExpenses(
      [
        { id: "e1", category: "HIGHWAY", label: "", amount: 4760, paidOn: null, ocr: false, receiptPhotoId: null, tollFrom: "三郷", tollTo: "本牧ふ頭", tollCar: "NORMAL", tollRound: true },
        { id: "e2", category: "TRAVEL", label: "電車・バス", amount: 640, paidOn: null, ocr: false, receiptPhotoId: null },
        { id: "e3", category: "HIGHWAY", label: "ETC明細", amount: 1200, paidOn: "2026-10-05", ocr: true, receiptPhotoId: "p1" },
      ],
      { parkingFee: 500, trainFare: 200 },
    );
    expect(back.tolls).toHaveLength(1);
    expect(back.tolls[0]).toMatchObject({ car: "NORMAL", round: true, amount: 4760 });
    expect(back.train).toEqual({ on: true, amount: "840" });
    expect(back.receipts.map((r) => [r.key, r.kind, r.amount])).toEqual([
      ["legacy-parking", "PARKING", 500],
      ["e3", "HIGHWAY", 1200],
    ]);
  });
});
