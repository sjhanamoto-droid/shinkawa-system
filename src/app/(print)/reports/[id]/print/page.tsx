import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAppSettings } from "@/lib/settings";
import { COMPANY_NAME } from "@/lib/brand";
import { CATEGORY, isCategory, PHOTO_KIND_LABEL, isPhotoKind } from "@/lib/constants";
import { fmtWorkHours, REPORT_STATUS_LABEL, workMinutes } from "@/lib/reports";
import { fmtYen } from "@/lib/utils";
import { jstDateKey, jstDateTimeLabel } from "@/lib/date";
import { photoSrc } from "@/lib/photos";
import { fmtKeyLong } from "@/features/schedule/filters";
import { loadReport } from "@/features/reports/queries";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

// A4 1枚（写真が多ければ複数ページ）の作業日報。ブラウザの印刷／PDF保存を使う。
export default async function ReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const r = await loadReport(id, me);
  if (!r) notFound();
  const settings = await getAppSettings();
  const minutes = workMinutes(r.startTime, r.endTime);
  const proxyBy = r.createdBy && r.createdBy.id !== r.userId ? r.createdBy.name : null;
  const photos = r.photos.filter((p) => !p.isVideo);
  const cat = r.occurrence && isCategory(r.occurrence.category) ? CATEGORY[r.occurrence.category].label : null;

  const th = "w-28 border border-slate-300 bg-slate-50 px-2 py-1.5 text-left font-semibold";
  const td = "border border-slate-300 px-2 py-1.5";

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <PrintToolbar backHref={`/reports/${id}`} />
      <main className="mx-auto my-6 max-w-[186mm] bg-white p-[10mm] text-[12px] leading-relaxed text-slate-900 shadow print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
          <div>
            <h1 className="text-xl font-bold tracking-widest">作業日報</h1>
            <p className="mt-1">作業日：{fmtKeyLong(r.workDateKey)}</p>
            <p className="text-[11px] text-slate-600">
              {REPORT_STATUS_LABEL[r.status]}
              {r.submittedAt && `（提出 ${jstDateTimeLabel(r.submittedAt)}）`}
            </p>
          </div>
          <div className="text-right text-[11px]">
            <p className="font-bold">{settings.companyName || COMPANY_NAME}</p>
            {settings.companyAddress && <p>{settings.companyAddress}</p>}
            {settings.companyPhone && <p>TEL {settings.companyPhone}</p>}
          </div>
        </header>

        <table className="mb-4 w-full border-collapse">
          <tbody>
            <tr>
              <th className={th}>現場</th>
              <td className={td} colSpan={3}>
                {r.occurrenceTitle}
                {r.property && r.property.name !== r.occurrenceTitle && `（${r.property.name}）`}
                {cat && <span className="ml-2 text-[11px] text-slate-600">{cat}</span>}
              </td>
            </tr>
            {r.property?.address && (
              <tr>
                <th className={th}>住所</th>
                <td className={td} colSpan={3}>
                  {r.property.address}
                </td>
              </tr>
            )}
            <tr>
              <th className={th}>作業者</th>
              <td className={td}>
                {r.user.name}
                {proxyBy && <span className="ml-1 text-[11px] text-slate-600">（代理入力：{proxyBy}）</span>}
              </td>
              <th className={th}>作業時間</th>
              <td className={td}>
                {r.startTime}〜{r.endTime}（{fmtWorkHours(minutes)}）
              </td>
            </tr>
            {r.occurrence && r.occurrence.vehicles.length > 0 && (
              <tr>
                <th className={th}>使用車両</th>
                <td className={td} colSpan={3}>
                  {r.occurrence.vehicles.map((v) => v.vehicle.name).join("・")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <section className="mb-4">
          <h2 className="mb-1 border-l-4 border-slate-800 pl-2 font-bold">作業内容</h2>
          <p className="min-h-[24mm] whitespace-pre-wrap border border-slate-300 p-2">{r.detail || "（未入力）"}</p>
        </section>

        {r.showExpenses && (
          <section className="mb-4">
            <h2 className="mb-1 border-l-4 border-slate-800 pl-2 font-bold">経費</h2>
            <table className="w-full border-collapse">
              <tbody>
                {r.expenseLines.length === 0 && (
                  <tr>
                    <td className={td} colSpan={4}>
                      経費なし
                    </td>
                  </tr>
                )}
                {r.expenseLines.map((e) => (
                  <tr key={e.key}>
                    <th className={th}>{e.categoryLabel}</th>
                    <td className={`${td} w-16 text-center`}>{e.paidOn}</td>
                    <td className={td}>{e.label}</td>
                    <td className={`${td} w-28 text-right`}>{fmtYen(e.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <th className={th}>合計</th>
                  <td className={td} colSpan={2} />
                  <td className={`${td} text-right font-bold`}>{fmtYen(r.expenseTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="mb-4">
          <h2 className="mb-1 border-l-4 border-slate-800 pl-2 font-bold">引き継ぎ事項</h2>
          <p className="whitespace-pre-wrap border border-slate-300 p-2">{r.handover || (r.handoverNone ? "なし" : "（未入力）")}</p>
        </section>

        {r.showExpenses && r.expenseLines.some((e) => e.receiptPhotoId) && (
          <section className="mb-4">
            <h2 className="mb-1 border-l-4 border-slate-800 pl-2 font-bold">領収書</h2>
            <div className="grid grid-cols-3 gap-2">
              {r.expenseLines
                .filter((e) => e.receiptPhotoId)
                .map((e) => (
                  <figure key={e.key} className="break-inside-avoid border border-slate-300 p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoSrc(e.receiptPhotoId!)} alt="領収書" className="aspect-[3/4] w-full object-contain" />
                    <figcaption className="mt-0.5 text-[10px] text-slate-600">
                      {e.paidOn} {e.categoryLabel} {fmtYen(e.amount)}
                    </figcaption>
                  </figure>
                ))}
            </div>
          </section>
        )}

        {photos.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-1 border-l-4 border-slate-800 pl-2 font-bold">現場写真（{photos.length}枚）</h2>
            <div className="grid grid-cols-2 gap-2">
              {photos.map((p) => (
                <figure key={p.id} className="break-inside-avoid border border-slate-300 p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(p.id)} alt={p.caption ?? ""} className="aspect-[4/3] w-full object-contain" />
                  <figcaption className="mt-0.5 text-[10px] text-slate-600">
                    [{isPhotoKind(p.kind) ? PHOTO_KIND_LABEL[p.kind] : p.kind}] {p.caption ?? ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-6 flex items-end justify-between">
          <p className="text-[10px] text-slate-500">出力日：{fmtKeyLong(jstDateKey())}</p>
          <div className="flex">
            {["担当者", "確認者"].map((l) => (
              <div key={l} className="w-20 border border-slate-400 text-center">
                <p className="border-b border-slate-400 text-[10px]">{l}</p>
                <div className="h-16" />
              </div>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
