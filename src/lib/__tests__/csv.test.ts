import { describe, it, expect } from "vitest";
import { parseCsv, csvToRecords, guessCustomerMapping } from "@/lib/csv";

describe("csv: parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quotes, commas and newlines inside fields", () => {
    const text = 'name,memo\r\n"株式会社A, B","1行目\n2行目"\r\n"He said ""hi""",x';
    expect(parseCsv(text)).toEqual([
      ["name", "memo"],
      ["株式会社A, B", "1行目\n2行目"],
      ['He said "hi"', "x"],
    ]);
  });
  it("strips BOM and drops trailing empty lines", () => {
    expect(parseCsv("﻿a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csv: csvToRecords", () => {
  it("maps headers and dedupes duplicate header names", () => {
    const { headers, rows } = csvToRecords("会社名,TEL,TEL\nグリーンランド,048-1,048-2");
    expect(headers).toEqual(["会社名", "TEL", "TEL_2"]);
    expect(rows[0]).toEqual({ 会社名: "グリーンランド", TEL: "048-1", TEL_2: "048-2" });
  });
});

describe("csv: guessCustomerMapping", () => {
  it("guesses Cybozu-like headers", () => {
    const m = guessCustomerMapping(["UID", "会社名", "会社名（よみ）", "TEL", "FAX", "E-mail", "住所", "メモ"]);
    expect(m.name).toBe("会社名");
    expect(m.kana).toBe("会社名（よみ）");
    expect(m.phone).toBe("TEL");
    expect(m.fax).toBe("FAX");
    expect(m.email).toBe("E-mail");
    expect(m.headOfficeAddress).toBe("住所");
    expect(m.memo).toBe("メモ");
    expect(m.cybozuId).toBe("UID");
  });
});
