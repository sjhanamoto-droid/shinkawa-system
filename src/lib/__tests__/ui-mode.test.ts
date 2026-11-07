import { describe, expect, it } from "vitest";
import { decideUiMode, isPhoneUserAgent, workerPathFor } from "@/lib/ui-mode";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

describe("ui-mode: スマホの判定", () => {
  it("iPhone・Android のスマホだけスマホ扱い", () => {
    expect(isPhoneUserAgent(IPHONE)).toBe(true);
    expect(isPhoneUserAgent(ANDROID)).toBe(true);
    expect(isPhoneUserAgent(ANDROID_TAB)).toBe(false);
    expect(isPhoneUserAgent(IPAD)).toBe(false);
    expect(isPhoneUserAgent(MAC)).toBe(false);
    expect(isPhoneUserAgent(null)).toBe(false);
  });
});

describe("ui-mode: 表示モード", () => {
  it("スマホは誰でもスタッフ画面、PC は管理画面", () => {
    expect(decideUiMode({ userAgent: IPHONE, cookie: null, role: "STAFF" })).toBe("worker");
    expect(decideUiMode({ userAgent: IPHONE, cookie: null, role: "OWNER" })).toBe("worker");
    expect(decideUiMode({ userAgent: MAC, cookie: null, role: "STAFF" })).toBe("admin");
  });
  it("管理画面への切り替えは最高管理者・事務・手配担当だけ", () => {
    expect(decideUiMode({ userAgent: IPHONE, cookie: "admin", role: "OWNER" })).toBe("admin");
    expect(decideUiMode({ userAgent: IPHONE, cookie: "admin", role: "OFFICE" })).toBe("admin");
    expect(decideUiMode({ userAgent: IPHONE, cookie: "admin", role: "SCHEDULER" })).toBe("admin");
    expect(decideUiMode({ userAgent: IPHONE, cookie: "admin", role: "STAFF" })).toBe("worker");
  });
  it("cookie でスタッフ画面を選べば PC でもスタッフ画面", () => {
    expect(decideUiMode({ userAgent: MAC, cookie: "worker", role: "OWNER" })).toBe("worker");
  });
});

describe("ui-mode: スタッフ画面での行き先", () => {
  const go = (path: string, qs = "") => workerPathFor(path, new URLSearchParams(qs));
  it("管理画面の URL を対応するスタッフ画面へ", () => {
    expect(go("/")).toBe("/w");
    expect(go("/reports/abc")).toBe("/w/reports/abc");
    expect(go("/reports/abc/edit")).toBe("/w/report?reportId=abc");
    expect(go("/reports/new", "occurrenceId=o1&userId=u1&date=2026-11-02&x=1")).toBe("/w/report?occurrenceId=o1&userId=u1&date=2026-11-02");
    expect(go("/reports/all")).toBe("/w/reports");
    expect(go("/schedule", "view=day&d=2026-11-06")).toBe("/w/calendar?d=2026-11-06");
    expect(go("/properties/p1")).toBe("/w/sites/p1");
    expect(go("/properties/p1/reports/new")).toBe("/w/sites");
    expect(go("/notifications")).toBe("/w/notifications");
    expect(go("/attendance")).toBe("/w");
  });
  it("スタッフ画面・ログイン・印刷・API はそのまま", () => {
    expect(go("/w")).toBeNull();
    expect(go("/w/report")).toBeNull();
    expect(go("/login")).toBeNull();
    expect(go("/reports/abc/print")).toBeNull();
    expect(go("/api/photos/x")).toBeNull();
  });
});
