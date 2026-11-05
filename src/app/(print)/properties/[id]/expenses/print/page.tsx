import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { COMPANY_NAME } from "@/lib/brand";
import { JOB_STATUS_LABEL } from "@/lib/constants";
import { getCategories } from "@/lib/categories-server";
import { fmtExpenseDate, fmtTimeRange } from "@/lib/reports";
import { fmtMonthLabel, isMonthKey, summarizeExpenses } from "@/lib/expenses";
import { fmtYen } from "@/lib/utils";
import { jstDateKey, storedDateKey } from "@/lib/date";
import { photoSrc } from "@/lib/photos";
import { fmtKeyLong, fmtKeyShort } from "@/features/schedule/filters";
import { PRIMARY_JOB_ORDER, describeWork } from "@/features/properties/work";
import { loadPropertyExpenseItems, loadPropertyWorkLog } from "@/features/expenses/queries";
import { PrintToolbar } from "@/components/print-toolbar";

export const dynamic = "force-dynamic";

// 現場の経費報告書（社内用）。?ym=YYYY-MM でその月、なしで全期間。?receipts=1 で領収書写真も載せる。
export default async function PropertyExpenseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ym?: string; receipts?: string }>;
}) {
  const me = await requireUser();
  if (!can(me, "expense.view")) notFound();
  const showAmount = can(me, "amount.view");
  const { id } = await params;
  const sp = await searchParams;
  const ym = isMonthKey(sp.ym) ? sp.ym : null;
  const withReceipts = sp.receipts === "1";

  const property = await db.property.findUnique({
    where: { id },
    select: {
      id: true, name: true, address: true, building: true, unitCount: true, contactName: true, contactPhone: true,
      customer: { select: { name: true, phone: true } },
      jobs: {
        orderBy: PRIMARY_JOB_ORDER,
        select: { id: true, name: true, department: true, category: true, contractType: true, ruleKind: true, ruleParams: true, status: true, amount: showAmount, startsOn: true, endsOn: true, note: true },
      },
    },
  });
  if (!property) notFound();

  const [items, workLog, categories, settings] = await Promise.all([
    loadPropertyExpenseItems(me, id, ym),
    loadPropertyWorkLog(me, id, ym),
    getCategories(),
    getAppSettings(),
  ]);
  const summary = summarizeExpenses(items);
  // 「契約金額 − 経費」は全期間・定期以外（スポット・工事）のときだけ比べられる。定期の金額は1回／月あたりのため
  const comparable = showAmount && !ym && property.jobs.length > 0 && property.jobs.every((j) => j.contractType !== "REGULAR") && property.jobs.some((j) => j.amount != null);
  const contractTotal = property.jobs.reduce((s, j) => s + (j.amount ?? 0), 0);
  const receipts = items.filter((i) => i.receiptPhotoId);
  const period = ym
    ? fmtMonthLabel(ym)
    : items.length || workLog.length
      ? `全期間（${fmtKeyLong([...items.map((i) => i.workDateKey), ...workLog.map((w) => w.workDateKey)].sort()[0])}〜）`
      : "全期間";

  const base = `/properties/${id}/expenses/print`;
  const toggleHref = `${base}?${new URLSearchParams({ ...(ym ? { ym } : {}), ...(withReceipts ? {} : { receipts: "1" }) }).toString()}`;

  const th = "border border-slate-300 bg-slate-50 px-2 py-1 text-left font-semibold";
  const td = "border border-slate-300 px-2 py-1";
  const h2 = "mb-1 border-l-4 border-slate-800 pl-2 font-bold";

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <PrintToolbar backHref={`/properties/${id}`}>
        <Link href={toggleHref} className="flex h-9 items-center rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft hover:bg-surface-sunken">
          {withReceipts ? "領収書写真を外す" : "領収書写真も載せる"}
        </Link>
      </PrintToolbar>
      <main className="mx-auto my-6 max-w-[186mm] bg-white p-[10mm] text-[11.5px] leading-relaxed text-slate-900 shadow print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-2">
          <div>
            <h1 className="text-xl font-bold tracking-widest">経費報告書</h1>
            <p className="mt-1 text-[13px] font-bold">{property.name}</p>
            <p>対象期間：{period}</p>
            <p className="text-[10px] text-slate-500">社内用</p>
          </div>
          <div className="text-right text-[11px]">
            <p className="font-bold">{settings.companyName || COMPANY_NAME}</p>
            {settings.companyAddress && <p>{settings.companyAddress}</p>}
            {settings.companyPhone && <p>TEL {settings.companyPhone}</p>}
            <p className="mt-1 text-[10px] text-slate-500">出力日：{fmtKeyLong(jstDateKey())}</p>
          </div>
        </header>

        <section className="mb-4 break-inside-avoid">
          <h2 className={h2}>現場情報</h2>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <th className={`${th} w-28`}>現場名</th>
                <td className={td}>{property.name}</td>
                <th className={`${th} w-28`}>顧客</th>
                <td className={td}>{property.customer.name}</td>
              </tr>
              <tr>
                <th className={th}>住所</th>
                <td className={td} colSpan={3}>
                  {property.address || "—"}
                  {property.building && `　${property.building}`}
                </td>
              </tr>
              <tr>
                <th className={th}>部屋数</th>
                <td className={td}>{property.unitCount ?? "—"}</td>
                <th className={th}>現場連絡先</th>
                <td className={td}>{[property.contactName, property.contactPhone].filter(Boolean).join("　") || "—"}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mb-4 break-inside-avoid">
          <h2 className={h2}>工事内容</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>工事・作業</th>
                <th className={`${th} w-16`}>状態</th>
                <th className={`${th} w-36`}>期間</th>
                {showAmount && <th className={`${th} w-28 text-right`}>契約金額（税抜）</th>}
              </tr>
            </thead>
            <tbody>
              {property.jobs.length === 0 && (
                <tr>
                  <td className={td} colSpan={showAmount ? 4 : 3}>登録された工事はありません</td>
                </tr>
              )}
              {property.jobs.map((j) => (
                <tr key={j.id}>
                  <td className={td}>
                    <p className="font-semibold">{j.name}</p>
                    <p className="text-[10px] text-slate-600">{describeWork(j, categories)}</p>
                    {j.note && <p className="whitespace-pre-wrap text-[10px] text-slate-600">{j.note}</p>}
                  </td>
                  <td className={td}>{(JOB_STATUS_LABEL as Record<string, string>)[j.status] ?? j.status}</td>
                  <td className={td}>
                    {j.startsOn || j.endsOn ? `${j.startsOn ? fmtKeyShort(storedDateKey(j.startsOn)) : ""}〜${j.endsOn ? fmtKeyShort(storedDateKey(j.endsOn)) : ""}` : "—"}
                  </td>
                  {showAmount && <td className={`${td} text-right`}>{fmtYen(j.amount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-4 break-inside-avoid">
          <h2 className={h2}>経費集計</h2>
          <div className="grid grid-cols-2 gap-3">
            <table className="w-full border-collapse self-start">
              <tbody>
                <tr>
                  <th className={th}>経費合計</th>
                  <td className={`${td} text-right text-[13px] font-bold`}>{fmtYen(summary.total)}</td>
                </tr>
                <tr>
                  <th className={th}>件数</th>
                  <td className={`${td} text-right`}>{summary.items.length}件</td>
                </tr>
                {comparable && (
                  <>
                    <tr>
                      <th className={th}>契約金額（税抜）</th>
                      <td className={`${td} text-right`}>{fmtYen(contractTotal)}</td>
                    </tr>
                    <tr>
                      <th className={th}>契約金額 − 経費（目安）</th>
                      <td className={`${td} text-right font-bold`}>{fmtYen(contractTotal - summary.total)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            <table className="w-full border-collapse self-start">
              <thead>
                <tr>
                  <th className={th}>科目</th>
                  <th className={`${th} w-12 text-right`}>件数</th>
                  <th className={`${th} w-24 text-right`}>金額</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.length === 0 && (
                  <tr>
                    <td className={td} colSpan={3}>経費なし</td>
                  </tr>
                )}
                {summary.byCategory.map((c) => (
                  <tr key={c.category || "unset"}>
                    <td className={td}>{c.label}</td>
                    <td className={`${td} text-right`}>{c.count}</td>
                    <td className={`${td} text-right`}>{fmtYen(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ym && summary.byMonth.length > 1 && (
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>月</th>
                  <th className={`${th} w-16 text-right`}>件数</th>
                  <th className={`${th} w-28 text-right`}>金額</th>
                </tr>
              </thead>
              <tbody>
                {[...summary.byMonth].reverse().map((m) => (
                  <tr key={m.ym}>
                    <td className={td}>{fmtMonthLabel(m.ym)}</td>
                    <td className={`${td} text-right`}>{m.count}</td>
                    <td className={`${td} text-right`}>{fmtYen(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-1 text-[10px] text-slate-500">※ 提出済みの日報に入力された経費を、日報の作業日で集計しています。</p>
        </section>

        <section className="mb-4">
          <h2 className={h2}>経費明細</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-16`}>作業日</th>
                <th className={`${th} w-20`}>作業者</th>
                <th className={`${th} w-24`}>科目</th>
                <th className={th}>内容</th>
                <th className={`${th} w-16`}>領収書日</th>
                <th className={`${th} w-24 text-right`}>金額</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.length === 0 && (
                <tr>
                  <td className={td} colSpan={6}>経費なし</td>
                </tr>
              )}
              {summary.items.map((i) => (
                <tr key={i.key} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap`}>{fmtKeyShort(i.workDateKey)}</td>
                  <td className={td}>{i.userName}</td>
                  <td className={td}>{i.categoryLabel}</td>
                  <td className={td}>{i.label}</td>
                  <td className={td}>{fmtExpenseDate(i.paidOn)}</td>
                  <td className={`${td} text-right`}>{fmtYen(i.amount)}</td>
                </tr>
              ))}
              {summary.items.length > 0 && (
                <tr>
                  <th className={th} colSpan={5}>合計</th>
                  <td className={`${td} text-right font-bold`}>{fmtYen(summary.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-4">
          <h2 className={h2}>作業実績（日報 {workLog.length}件）</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-16`}>作業日</th>
                <th className={`${th} w-20`}>作業者</th>
                <th className={`${th} w-24`}>時間</th>
                <th className={th}>作業内容</th>
              </tr>
            </thead>
            <tbody>
              {workLog.length === 0 && (
                <tr>
                  <td className={td} colSpan={4}>提出済みの日報はありません</td>
                </tr>
              )}
              {workLog.map((w) => (
                <tr key={w.id} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap`}>{fmtKeyShort(w.workDateKey)}</td>
                  <td className={td}>{w.userName}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtTimeRange(w.startTime, w.endTime)}</td>
                  <td className={`${td} whitespace-pre-wrap`}>{w.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {withReceipts && receipts.length > 0 && (
          <section className="mb-4">
            <h2 className={h2}>領収書（{receipts.length}枚）</h2>
            <div className="grid grid-cols-3 gap-2">
              {receipts.map((i) => (
                <figure key={i.key} className="break-inside-avoid border border-slate-300 p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(i.receiptPhotoId!)} alt="領収書" className="aspect-[3/4] w-full object-contain" />
                  <figcaption className="mt-0.5 text-[10px] text-slate-600">
                    {fmtKeyShort(i.workDateKey)} {i.userName} {i.categoryLabel} {fmtYen(i.amount)}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-6 flex justify-end">
          <div className="flex">
            {["作成者", "確認者"].map((l) => (
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
