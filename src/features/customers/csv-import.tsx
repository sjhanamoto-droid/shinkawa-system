"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { csvToRecords, decodeCsvBuffer, guessCustomerMapping, CUSTOMER_CSV_FIELDS, type CustomerCsvMapping } from "@/lib/csv";
import { importCustomersCsv, type ImportResult } from "./import-actions";

export function CsvImport() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CustomerCsvMapping>({});
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    setDone(null);
    try {
      const buf = await file.arrayBuffer();
      const { text, encoding } = decodeCsvBuffer(buf);
      const { headers, rows } = csvToRecords(text);
      if (headers.length === 0) {
        setError("CSV の内容を読み取れませんでした");
        return;
      }
      setFileName(file.name);
      setEncoding(encoding);
      setHeaders(headers);
      setRows(rows);
      setMapping(guessCustomerMapping(headers));
    } catch {
      setError("ファイルの読み込みに失敗しました");
    }
  }

  function run(dryRun: boolean) {
    setError(null);
    start(async () => {
      const r = await importCustomersCsv({ rows, mapping, dryRun });
      if (!r.ok) {
        setError(r.error ?? "取り込みに失敗しました");
        return;
      }
      if (dryRun) setPreview(r);
      else {
        setDone(r);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <SectionTitle>1. CSV ファイルを選ぶ</SectionTitle>
        <Card className="p-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-4 py-8 text-center hover:bg-surface-subtle">
            <Upload className="h-6 w-6 text-ink-muted" />
            <span className="text-sm font-bold text-ink">{fileName ?? "ここをタップしてファイルを選択"}</span>
            <span className="text-xs text-ink-muted">サイボウズ「アドレス帳」のエクスポート（Shift_JIS / UTF-8）に対応</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {fileName && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
              <FileSpreadsheet className="h-4 w-4" />
              {rows.length} 行 ・ {headers.length} 列 ・ 文字コード {encoding}
            </p>
          )}
        </Card>
      </section>

      {headers.length > 0 && (
        <section className="space-y-2.5">
          <SectionTitle>2. 列の対応を確認</SectionTitle>
          <Card className="space-y-3 p-4">
            {CUSTOMER_CSV_FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-[1fr_1.4fr] items-center gap-3">
                <span className="text-sm font-semibold text-ink-soft">
                  {f.label}
                  {f.required && <span className="ml-1 text-status-danger">*</span>}
                </span>
                <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))}>
                  <option value="">（取り込まない）</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            {rows.length > 0 && mapping.name && (
              <div className="rounded-xl bg-surface-subtle p-3 text-xs text-ink-soft">
                <p className="mb-1 font-bold text-ink-muted">プレビュー（先頭3行）</p>
                {rows.slice(0, 3).map((r, i) => (
                  <p key={i} className="truncate">
                    {CUSTOMER_CSV_FIELDS.filter((f) => mapping[f.key])
                      .map((f) => r[mapping[f.key] as string])
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                ))}
              </div>
            )}
          </Card>
        </section>
      )}

      {headers.length > 0 && (
        <section className="space-y-2.5">
          <SectionTitle>3. 確認して取り込む</SectionTitle>
          <Card className="space-y-3 p-4">
            <p className="text-xs text-ink-muted">同じサイボウズIDまたは同じ顧客名がある場合は上書き更新し、無ければ新規作成します。</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => run(true)} disabled={pending || !mapping.name}>
                {pending && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                確認（書き込まない）
              </Button>
              <Button type="button" className="flex-1" onClick={() => run(false)} disabled={pending || !preview}>
                取り込む
              </Button>
            </div>
            {preview && !done && (
              <div className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold text-ink">
                  新規 {preview.created} 件 ・ 更新 {preview.updated} 件 ・ スキップ {preview.skipped} 件
                </p>
                {preview.errors.length > 0 && (
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-amber-700">
                    {preview.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        {e.row}行目：{e.message}
                      </li>
                    ))}
                    {preview.errors.length > 50 && <li>…ほか {preview.errors.length - 50} 件</li>}
                  </ul>
                )}
              </div>
            )}
            {done && (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  取り込みました：新規 {done.created} 件 ・ 更新 {done.updated} 件 ・ スキップ {done.skipped} 件
                </span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
