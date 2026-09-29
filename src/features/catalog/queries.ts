import "server-only";
import { db } from "@/lib/db";

/** 見出しの並び：「自社」を先頭に、あとは並び順の小さいリンクを含む見出しから */
export async function catalogGroups() {
  const links = await db.catalogLink.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const names = [...new Set(links.map((l) => l.groupName))].sort((a, b) => (a === "自社" ? -1 : b === "自社" ? 1 : 0));
  return names.map((name) => ({ name, links: links.filter((l) => l.groupName === name) }));
}
