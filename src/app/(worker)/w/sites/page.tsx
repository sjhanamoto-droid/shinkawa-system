import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { addDaysKey, dateFromKey, dayRangeForKey, jstDateKey, storedDateKey } from "@/lib/date";
import { fmtDayLabel } from "@/lib/worker";
import { WorkerTabBar } from "@/features/worker/ui/tab-bar";

export const dynamic = "force-dynamic";

/** 現場をさがす：自分の現場（前後60日に担当した・する現場）／すべての現場 */
export default async function WorkerSites({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 40);
  const all = sp.all === "1";
  const today = jstDateKey();
  const nameWhere = q ? { OR: [{ name: { contains: q } }, { address: { contains: q } }] } : {};

  const mine = await db.occurrence.findMany({
    where: {
      assignments: { some: { userId: me.id } },
      status: { not: "CANCELLED" },
      propertyId: { not: null },
      date: { gte: dateFromKey(addDaysKey(today, -60)), lt: dayRangeForKey(addDaysKey(today, 60)).lt },
    },
    select: { propertyId: true, date: true },
    orderBy: { date: "asc" },
  });
  const nextOf = new Map<string, string>();
  const lastOf = new Map<string, string>();
  for (const o of mine) {
    const k = storedDateKey(o.date!);
    if (k >= today && !nextOf.has(o.propertyId!)) nextOf.set(o.propertyId!, k);
    if (k < today) lastOf.set(o.propertyId!, k);
  }
  const mineIds = [...new Set(mine.map((o) => o.propertyId!))];
  const [properties, unreadCount] = await Promise.all([
    db.property.findMany({
      where: all ? nameWhere : { id: { in: mineIds }, ...nameWhere },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" },
      take: all ? 60 : 200,
    }),
    db.notification.count({ where: { userId: me.id, read: false } }),
  ]);
  // 自分の現場は、次に行く日が近い順（行く予定が無ければ最近行った順）
  if (!all) {
    properties.sort((a, b) => {
      const na = nextOf.get(a.id) ?? "9999";
      const nb = nextOf.get(b.id) ?? "9999";
      if (na !== nb) return na < nb ? -1 : 1;
      return (lastOf.get(b.id) ?? "").localeCompare(lastOf.get(a.id) ?? "");
    });
  }
  const tabHref = (a: boolean) => `/w/sites?${new URLSearchParams({ ...(q ? { q } : {}), ...(a ? { all: "1" } : {}) }).toString()}`;

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-6 text-white w-safe-top">
      <h1 className="text-[30px] font-medium leading-[42px]">現場をさがす</h1>
      <form action="/w/sites" className="mt-4">
        {all && <input type="hidden" name="all" value="1" />}
        <label className="flex h-14 items-center gap-3 rounded-xl bg-white px-4 text-[var(--w-text)]">
          <Search className="h-6 w-6 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
          <input name="q" defaultValue={q} placeholder="現場名・住所で探す" enterKeyHint="search" className="h-full min-w-0 flex-1 bg-transparent text-[18px] outline-none" />
        </label>
      </form>
      <div className="mt-4 grid grid-cols-2 rounded-2xl bg-white/[.16] p-1.5">
        {[false, true].map((a) => (
          <Link key={String(a)} href={tabHref(a)} className={`flex h-12 items-center justify-center rounded-xl text-[17px] ${all === a ? "bg-white font-semibold text-[var(--w-primary)]" : ""}`}>
            {a ? "すべての現場" : "自分の現場"}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {properties.length === 0 && <p className="text-[16px] text-[var(--w-primary-soft)]">{q ? "見つかりませんでした" : all ? "現場がありません" : "前後60日に担当している現場はありません"}</p>}
        {properties.map((p) => {
          const next = nextOf.get(p.id);
          return (
            <Link key={p.id} href={`/w/sites/${p.id}`} className="block rounded-2xl bg-white px-4 py-4 text-[var(--w-text)]">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[20px]">{p.name}</span>
                {next === today && <span className="rounded-full bg-[var(--w-warning-bg)] px-2.5 py-0.5 text-[13px] text-[var(--w-warning-text)]">今日</span>}
              </span>
              {p.address && <span className="mt-0.5 block truncate text-[15px] text-[var(--w-text-sub)]">{p.address}</span>}
              {next && next !== today && <span className="mt-1 block text-[14px] text-[var(--w-primary)]">次回 {fmtDayLabel(next)}</span>}
            </Link>
          );
        })}
      </div>
      <WorkerTabBar unreadCount={unreadCount} />
    </div>
  );
}
