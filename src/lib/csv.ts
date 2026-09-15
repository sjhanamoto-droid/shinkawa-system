// RFC4180 準拠の CSV パーサ（純関数）。ダブルクォート内のカンマ・改行・"" エスケープに対応。
// サイボウズのアドレス帳エクスポート（Shift_JIS / UTF-8）の取り込みに使う。文字コードの判定は呼び出し側。

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.startsWith("﻿") ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // \r\n は次の \n で行を閉じる。単独 \r も改行扱い
      if (src[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 末尾の完全な空行は落とす
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** 先頭行をヘッダとして {ヘッダ名: 値} の配列にする。ヘッダの重複は "名前_2" のように連番を付ける */
export function csvToRecords(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = all[0].map((h) => {
    const base = h.trim() || "列";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = all.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? "").trim();
    });
    return rec;
  });
  return { headers, rows };
}

/** ArrayBuffer を UTF-8 で読み、文字化け（U+FFFD）が多ければ Shift_JIS として読み直す */
export function decodeCsvBuffer(buf: ArrayBuffer): { text: string; encoding: "utf-8" | "shift_jis" } {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const bad = (utf8.match(/�/g) ?? []).length;
  if (bad === 0) return { text: utf8, encoding: "utf-8" };
  try {
    const sjis = new TextDecoder("shift_jis").decode(buf);
    return { text: sjis, encoding: "shift_jis" };
  } catch {
    return { text: utf8, encoding: "utf-8" };
  }
}

// ── 顧客CSVの列マッピング ──
export type CustomerCsvField = "name" | "shortName" | "kana" | "phone" | "fax" | "email" | "headOfficeAddress" | "memo" | "cybozuId";
export const CUSTOMER_CSV_FIELDS: { key: CustomerCsvField; label: string; required?: boolean }[] = [
  { key: "name", label: "顧客名（会社名）", required: true },
  { key: "shortName", label: "短縮名" },
  { key: "kana", label: "ふりがな" },
  { key: "phone", label: "電話番号" },
  { key: "fax", label: "FAX" },
  { key: "email", label: "メール" },
  { key: "headOfficeAddress", label: "住所" },
  { key: "memo", label: "メモ" },
  { key: "cybozuId", label: "サイボウズID（重複判定キー）" },
];
export type CustomerCsvMapping = Partial<Record<CustomerCsvField, string | null>>;

const HEADER_HINTS: Record<CustomerCsvField, string[]> = {
  name: ["会社名", "顧客名", "名前", "氏名", "取引先", "会社", "name"],
  shortName: ["略称", "短縮", "表示名"],
  kana: ["よみ", "ヨミ", "ふりがな", "フリガナ", "カナ", "かな"],
  phone: ["tel", "電話", "phone"],
  fax: ["fax", "ファックス"],
  email: ["e-mail", "email", "メール", "mail"],
  headOfficeAddress: ["住所", "所在地", "address"],
  memo: ["メモ", "備考", "note"],
  cybozuId: ["uid", "id", "レコード番号", "コード"],
};

/** ヘッダ名から列マッピングを推定する */
export function guessCustomerMapping(headers: string[]): CustomerCsvMapping {
  const m: CustomerCsvMapping = {};
  const used = new Set<string>();
  for (const f of CUSTOMER_CSV_FIELDS) {
    const hints = HEADER_HINTS[f.key];
    const hit = headers.find((h) => !used.has(h) && hints.some((x) => h.toLowerCase().includes(x.toLowerCase())));
    if (hit) {
      m[f.key] = hit;
      used.add(hit);
    }
  }
  return m;
}
