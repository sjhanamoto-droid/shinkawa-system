"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { CUSTOMER_CSV_FIELDS, type CustomerCsvField, type CustomerCsvMapping } from "@/lib/csv";

export type ImportResult = {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  dryRun: boolean;
};

const MAX_ROWS = 2000;

function pick(row: Record<string, string>, mapping: CustomerCsvMapping, key: CustomerCsvField): string | null {
  const h = mapping[key];
  if (!h) return null;
  const v = (row[h] ?? "").trim();
  return v === "" ? null : v;
}

/**
 * サイボウズ アドレス帳などの CSV を顧客に取り込む。
 * - upsert キー: cybozuId（あれば）→ 無ければ name の完全一致
 * - dryRun=true なら件数とエラーだけ返す（書き込まない）
 */
export async function importCustomersCsv(input: {
  rows: Record<string, string>[];
  mapping: CustomerCsvMapping;
  dryRun: boolean;
}): Promise<ImportResult> {
  const me = await requireUser();
  const base: ImportResult = { ok: false, created: 0, updated: 0, skipped: 0, errors: [], dryRun: input.dryRun };
  try {
    assertCan(me, "customer.import");
  } catch (e) {
    return { ...base, error: e instanceof PermissionError ? e.message : "権限がありません" };
  }
  if (!input.mapping.name) return { ...base, error: "「顧客名」の列を指定してください" };
  if (input.rows.length === 0) return { ...base, error: "取り込む行がありません" };
  if (input.rows.length > MAX_ROWS) return { ...base, error: `一度に取り込めるのは ${MAX_ROWS} 行までです` };

  // 既存を一括で引く（name / cybozuId）
  const existing = await db.customer.findMany({ select: { id: true, name: true, cybozuId: true } });
  const byCybozu = new Map(existing.filter((c) => c.cybozuId).map((c) => [c.cybozuId as string, c.id]));
  const byName = new Map(existing.map((c) => [c.name, c.id]));

  const result = { ...base, ok: true };
  const seenInFile = new Set<string>();
  const now = new Date();

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    const rowNo = i + 2; // ヘッダを1行目として
    const name = pick(row, input.mapping, "name");
    if (!name) {
      result.errors.push({ row: rowNo, message: "顧客名が空のためスキップ" });
      result.skipped++;
      continue;
    }
    if (name.length > 100) {
      result.errors.push({ row: rowNo, message: "顧客名が長すぎます（100文字まで）" });
      result.skipped++;
      continue;
    }
    const cybozuId = pick(row, input.mapping, "cybozuId");
    const dupKey = cybozuId ?? `name:${name}`;
    if (seenInFile.has(dupKey)) {
      result.errors.push({ row: rowNo, message: `ファイル内で重複（${name}）のためスキップ` });
      result.skipped++;
      continue;
    }
    seenInFile.add(dupKey);

    const data: Record<string, string | null> = {};
    for (const f of CUSTOMER_CSV_FIELDS) {
      if (f.key === "name" || f.key === "cybozuId") continue;
      const v = pick(row, input.mapping, f.key);
      if (v !== null) data[f.key] = v.slice(0, f.key === "memo" ? 2000 : f.key === "headOfficeAddress" ? 300 : 100);
    }
    if (data.shortName && data.shortName.length > 20) data.shortName = data.shortName.slice(0, 20);

    const existingId = (cybozuId && byCybozu.get(cybozuId)) || byName.get(name) || null;
    if (existingId) {
      result.updated++;
      if (!input.dryRun) {
        await db.customer.update({
          where: { id: existingId },
          data: { name, ...data, ...(cybozuId ? { cybozuId } : {}), importedAt: now },
        });
      }
    } else {
      result.created++;
      if (!input.dryRun) {
        const c = await db.customer.create({ data: { name, ...data, cybozuId, importedAt: now } });
        byName.set(name, c.id);
        if (cybozuId) byCybozu.set(cybozuId, c.id);
      }
    }
  }

  if (!input.dryRun) {
    revalidatePath("/customers");
    revalidatePath("/schedule");
  }
  return result;
}
