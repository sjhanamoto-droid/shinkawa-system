import { BookOpen, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/session";
import { catalogGroups } from "@/features/catalog/queries";
import { WorkerSubPage } from "@/features/worker/ui/sub-page";

export const dynamic = "force-dynamic";

export default async function WorkerCatalog() {
  const me = await requireUser();
  const groups = await catalogGroups();
  return (
    <WorkerSubPage userId={me.id} title="カタログ" backHref="/w/menu">
      {groups.length === 0 ? (
        <p className="text-[16px] text-[var(--w-text-muted)]">リンクはまだありません</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.name}>
              <h2 className="text-[18px] font-semibold">{g.name}</h2>
              <ul className="mt-2 divide-y divide-[var(--w-divider)] overflow-hidden rounded-[14px] border border-[var(--w-divider)]">
                {g.links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[68px] items-center gap-3 px-4 py-3 active:bg-[var(--w-soft-bg)]">
                      <BookOpen className="h-6 w-6 shrink-0 text-[var(--w-primary)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px]">{l.title}</span>
                        {l.note && <span className="block truncate text-[14px] text-[var(--w-text-muted)]">{l.note}</span>}
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </WorkerSubPage>
  );
}
