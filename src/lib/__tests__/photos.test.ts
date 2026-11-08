import { describe, expect, it } from "vitest";
import { parseAndValidatePhotosField } from "@/lib/photos";

const blobPath = (ext: string) => `media/2026-11-08/12345678-1234-1234-1234-123456789abc.${ext}`;

describe("photos: Blob に置いた図面の PDF", () => {
  it("PDF は Blob のパス・サイズ（20MBまで）で受け付ける", () => {
    const r = parseAndValidatePhotosField(JSON.stringify([{ blobPath: blobPath("pdf"), mimeType: "application/pdf", sizeBytes: 5 * 1024 * 1024, caption: "平面図", kind: "DRAWING" }]));
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.added[0]).toMatchObject({ blobPath: blobPath("pdf"), mimeType: "application/pdf", isVideo: false, kind: "DRAWING" });
  });
  it("20MB を超える PDF・拡張子の合わないパスは断る", () => {
    expect("error" in parseAndValidatePhotosField(JSON.stringify([{ blobPath: blobPath("pdf"), mimeType: "application/pdf", sizeBytes: 21 * 1024 * 1024, caption: "", kind: "DRAWING" }]))).toBe(true);
    expect("error" in parseAndValidatePhotosField(JSON.stringify([{ blobPath: blobPath("exe"), mimeType: "application/pdf", sizeBytes: 1000, caption: "", kind: "DRAWING" }]))).toBe(true);
  });
});
