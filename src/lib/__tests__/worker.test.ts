import { describe, expect, it } from "vitest";
import { fmtClock, fmtDayLabel, fmtDuration, fromSavedTimes, pickFocus, stepTime, toSavedTimes, visitState, MAX_END_MIN } from "@/lib/worker";

describe("worker: 時間", () => {
  it("24時以降は翌", () => {
    expect(fmtClock(8 * 60)).toBe("8:00");
    expect(fmtClock(1440 + 60)).toBe("翌1:00");
  });
  it("＋−は10分ずつ、刻みに合わせて範囲内に収める", () => {
    expect(stepTime(480, 1, 0, MAX_END_MIN)).toBe(490);
    expect(stepTime(485, 1, 0, MAX_END_MIN)).toBe(490);
    expect(stepTime(485, -1, 0, MAX_END_MIN)).toBe(480);
    expect(stepTime(0, -1, 0, MAX_END_MIN)).toBe(0);
    expect(stepTime(1430, 1, 0, 1430)).toBe(1430);
  });
  it("翌日の終了は保存すると時刻だけ、読み込むと翌日に戻る", () => {
    expect(toSavedTimes(22 * 60, 1440 + 5 * 60)).toEqual({ startTime: "22:00", endTime: "05:00" });
    expect(fromSavedTimes("22:00", "05:00")).toEqual({ startMin: 1320, endMin: 1440 + 300 });
    expect(fromSavedTimes("08:00", "17:00")).toEqual({ startMin: 480, endMin: 1020 });
  });
  it("表示", () => {
    expect(fmtDuration(540)).toBe("9時間");
    expect(fmtDuration(510)).toBe("8時間30分");
    expect(fmtDayLabel("2026-10-05")).toBe("10月5日（月）");
  });
});

describe("worker: 現場の状態", () => {
  const today = "2026-10-05";
  const v = { dateKey: today, startTime: "09:00", endTime: "12:00", submitted: false };
  it("終了予定の30分前から日報まだ", () => {
    expect(visitState(v, today, 9 * 60)).toBe("before");
    expect(visitState(v, today, 11 * 60 + 29)).toBe("before");
    expect(visitState(v, today, 11 * 60 + 30)).toBe("due");
  });
  it("提出済み・過去の日・明日", () => {
    expect(visitState({ ...v, submitted: true }, today, 0)).toBe("sent");
    expect(visitState({ ...v, dateKey: "2026-10-04" }, today, 0)).toBe("due");
    expect(visitState({ ...v, dateKey: "2026-10-06" }, today, 23 * 60)).toBe("before");
  });
  it("時刻が無い予定はいつでも書ける・夜間作業は翌日の終了で判定", () => {
    expect(visitState({ ...v, startTime: null, endTime: null }, today, 0)).toBe("due");
    expect(visitState({ ...v, startTime: "22:00", endTime: "05:00" }, today, 23 * 60)).toBe("before");
  });
  it("札には日報まだを優先、無ければ次の現場", () => {
    expect(pickFocus([{ id: 1, state: "before" as const }, { id: 2, state: "due" as const }])?.id).toBe(2);
    expect(pickFocus([{ id: 1, state: "sent" as const }, { id: 2, state: "before" as const }])?.id).toBe(2);
    expect(pickFocus([{ id: 1, state: "sent" as const }])).toBeNull();
  });
});
