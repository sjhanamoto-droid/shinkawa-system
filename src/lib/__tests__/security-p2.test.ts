import { beforeEach, describe, expect, it, vi } from "vitest";

// セキュリティレビュー P2（No.6 ログインの失効・No.8 通知・No.9 CSV）の回帰テスト（DB・Cookie はモック）
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const db = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  pushSubscription: { findMany: vi.fn(), deleteMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";

beforeEach(() => vi.clearAllMocks());

const baseUser = { id: "u1", name: "藤野", email: "f@example.com", role: "STAFF", kind: "EMPLOYEE", department: null, avatarColor: "#000", avatarImage: null, active: true, canLogin: true, updatedAt: new Date() };

describe("No.6 パスワード変更・リセット・無効化より前のログインは使えない", () => {
  it("世代が同じなら通し、違えば断る。世代の入っていない以前のログインは 0 として扱う", async () => {
    const { signSession, SESSION_COOKIE } = await import("@/lib/auth");
    const { getCurrentUser } = await import("@/lib/session");
    const { SignJWT } = await import("jose");

    const tokenV1 = await signSession({ sub: "u1", role: "STAFF", name: "藤野", ver: 1 });
    const legacy = await new SignJWT({ role: "STAFF", name: "藤野" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

    const check = async (token: string, sessionVersion: number) => {
      cookieStore.get.mockImplementation((name: string) => (name === SESSION_COOKIE ? { value: token } : undefined));
      db.user.findUnique.mockResolvedValueOnce({ ...baseUser, sessionVersion });
      // getCurrentUser は react の cache で包まれているので、モジュールを毎回読み直す
      return getCurrentUser();
    };
    expect(await check(tokenV1, 1)).not.toBeNull();
    vi.resetModules();
    const s2 = await import("@/lib/session");
    cookieStore.get.mockImplementation(() => ({ value: tokenV1 }));
    db.user.findUnique.mockResolvedValueOnce({ ...baseUser, sessionVersion: 2 });
    expect(await s2.getCurrentUser()).toBeNull();
    vi.resetModules();
    const s3 = await import("@/lib/session");
    cookieStore.get.mockImplementation(() => ({ value: legacy }));
    db.user.findUnique.mockResolvedValueOnce({ ...baseUser, sessionVersion: 0 });
    expect(await s3.getCurrentUser()).not.toBeNull();
  });
});

describe("No.8 在籍していてログインできる人にだけ通知を送る", () => {
  it("送り先は active・canLogin の人の端末だけ", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    const { sendPushToUser } = await import("@/lib/push");
    db.pushSubscription.findMany.mockResolvedValueOnce([]);
    await sendPushToUser("u1", { title: "t" });
    expect(db.pushSubscription.findMany).toHaveBeenCalledWith({ where: { userId: "u1", user: { active: true, canLogin: true } } });
  });
});

describe("No.9 CSV の数式", () => {
  it("= + - @ タブ・改行で始まる文字は先頭に ' を付ける。数値・普通の文字はそのまま", async () => {
    const { csvCell } = await import("@/lib/csv");
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+81")).toBe("'+81");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("藤野 太郎")).toBe("藤野 太郎");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("\n=1")).toBe(`"'\n=1"`);
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(12.5)).toBe("12.5");
  });
});
