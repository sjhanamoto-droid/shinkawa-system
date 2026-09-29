import { BookOpen, ExternalLink, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app-shell/page-header";
import { PageContainer } from "@/components/app-shell/page-container";
import { SectionTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SearchParamToast } from "@/components/ui/toast";
import { catalogGroups } from "@/features/catalog/queries";

export const dynamic = "force-dynamic";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function CatalogPage() {
  const me = await requireUser();
  const manager = can(me, "catalog.manage");
  const groups = await catalogGroups();

  return (
    <div>
      <PageHeader
        title="カタログ"
        subtitle="自社ホームページ・メーカーのデジタルカタログ"
        right={
          manager && (
            <LinkButton href="/catalog/new" size="sm">
              <Plus className="h-4 w-4" />
              リンクを追加
            </LinkButton>
          )
        }
      />
      <PageContainer size="narrow">
        <SearchParamToast />
        {groups.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} title="リンクはまだありません" description={manager ? "「リンクを追加」から登録できます" : undefined} />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.name} className="space-y-2">
                <SectionTitle>{g.name}</SectionTitle>
                <ul className="card divide-y divide-line overflow-hidden">
                  {g.links.map((l) => (
                    <li key={l.id} className="flex items-center">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="tap-row flex min-w-0 flex-1 items-center gap-3.5 p-4 active:bg-surface-sunken">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <BookOpen className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-ink">{l.title}</span>
                          <span className="block truncate text-xs text-ink-muted">{l.note || hostOf(l.url)}</span>
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" />
                      </a>
                      {manager && (
                        <Link href={`/catalog/${l.id}/edit`} aria-label={`${l.title}を編集`} className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-sunken hover:text-ink-soft">
                          <Pencil className="h-4 w-4" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-center text-xs text-ink-faint">リンクは新しいタブ（スマホではブラウザ）で開きます</p>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
