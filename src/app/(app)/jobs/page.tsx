import { redirect } from "next/navigation";

// 案件は現場に統合した（現場1件＝作業1つ）。古いリンク・ブックマーク用に現場一覧へ転送する。
export default function JobsPage() {
  redirect("/properties");
}
