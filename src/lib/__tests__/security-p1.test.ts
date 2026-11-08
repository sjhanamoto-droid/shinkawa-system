import { beforeEach, describe, expect, it, vi } from "vitest";

// セキュリティレビュー P1 の回帰テスト（DB・Blob はモック）
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const db = {
  photo: { findFirst: vi.fn(), findMany: vi.fn() },
  deletedMedia: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  user: { update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));
const deleteBlobPaths = vi.fn();
vi.mock("@/lib/media", () => ({ deleteBlobPaths, isBlobConfigured: () => true, signedReadUrl: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "u_sched", role: "SCHEDULER", department: "CLEANING" }) }));

beforeEach(() => vi.clearAllMocks());

describe("本人設定で部門を変えられない", () => {
  it("department を送っても保存しない", async () => {
    const { updateAccount } = await import("@/features/settings/actions");
    const fd = new FormData();
    fd.set("name", "石神");
    fd.set("department", "");
    fd.append("department", "CONSTRUCTION");
    await updateAccount({}, fd);
    expect(db.user.update).toHaveBeenCalledTimes(1);
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty("department");
  });
});

describe("写真の保存先の使い回しを断る", () => {
  it("すでに写真・削除済みにある保存先は断る", async () => {
    const { reusedBlobPathError } = await import("@/lib/blob-reuse");
    db.photo.findFirst.mockResolvedValueOnce({ id: "p1" });
    db.deletedMedia.findFirst.mockResolvedValueOnce(null);
    expect(await reusedBlobPathError(["media/a.jpg"], "u_me")).not.toBeNull();
    db.photo.findFirst.mockResolvedValueOnce(null);
    db.deletedMedia.findFirst.mockResolvedValueOnce({ id: "d1" });
    expect(await reusedBlobPathError(["media/a.jpg"], "u_me")).not.toBeNull();
  });
  it("同じ保存先を1回の送信で2つ使うのも断る。新しい保存先・保存先なしは通す", async () => {
    const { reusedBlobPathError } = await import("@/lib/blob-reuse");
    expect(await reusedBlobPathError(["media/a.jpg", "media/a.jpg"], "u_me")).not.toBeNull();
    db.photo.findFirst.mockResolvedValueOnce(null);
    db.deletedMedia.findFirst.mockResolvedValueOnce(null);
    expect(await reusedBlobPathError(["media/b.jpg", null, undefined], "u_me")).toBeNull();
    expect(await reusedBlobPathError([null], "u_me")).toBeNull();
  });
  it("自分が登録したもの（保存できたのに画面が戻らず押し直した）は通す。登録者が空の古い行はほかの人として扱う", async () => {
    const { reusedBlobPathError } = await import("@/lib/blob-reuse");
    db.photo.findFirst.mockResolvedValueOnce(null);
    db.deletedMedia.findFirst.mockResolvedValueOnce(null);
    expect(await reusedBlobPathError(["media/mine.jpg"], "u_me")).toBeNull();
    expect(db.photo.findFirst.mock.calls[0][0].where).toMatchObject({
      blobPath: { in: ["media/mine.jpg"] },
      OR: [{ createdById: null }, { createdById: { not: "u_me" } }],
    });
  });
});

describe("猶予が過ぎた削除済みの片付け", () => {
  it("まだほかの写真・削除済みが使っている原本は消さず、行だけ消す", async () => {
    const { purgeTrash } = await import("@/lib/media-backup");
    db.deletedMedia.findMany
      .mockResolvedValueOnce([
        { id: "d1", blobPath: "media/shared-live.jpg" },
        { id: "d2", blobPath: "media/shared-trash.jpg" },
        { id: "d3", blobPath: "media/only.jpg" },
        { id: "d4", blobPath: null },
      ])
      .mockResolvedValueOnce([{ blobPath: "media/shared-trash.jpg" }]);
    db.photo.findMany.mockResolvedValueOnce([{ blobPath: "media/shared-live.jpg" }]);
    expect(await purgeTrash()).toBe(4);
    expect(deleteBlobPaths).toHaveBeenCalledWith(["media/only.jpg"]);
    expect(db.deletedMedia.findMany.mock.calls[1][0].where.id).toEqual({ notIn: ["d1", "d2", "d3", "d4"] });
    expect(db.deletedMedia.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["d1", "d2", "d3", "d4"] } } });
  });
});

describe("通知の宛先はプッシュサービスだけ", () => {
  it("主要なプッシュサービスは通す", async () => {
    const { isAllowedPushEndpoint } = await import("@/lib/push");
    for (const u of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/QABC",
    ]) expect(isAllowedPushEndpoint(u), u).toBe(true);
  });
  it("内部アドレス・http・別ホスト・まぎらわしいホストは断る", async () => {
    const { isAllowedPushEndpoint } = await import("@/lib/push");
    for (const u of [
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://evil.example.com/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilpush.apple.com/x",
      "not a url",
    ]) expect(isAllowedPushEndpoint(u), u).toBe(false);
  });
});
