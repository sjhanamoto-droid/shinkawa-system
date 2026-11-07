import { Inter, Noto_Sans_JP } from "next/font/google";
import { requireUser } from "@/lib/session";
import { StartupGate } from "@/features/notifications/startup-gate";
import { ClaimGate } from "@/features/claims/claim-gate";
import { loadGateData } from "@/features/notifications/gates";
import { getCategories } from "@/lib/categories-server";
import { CategoryProvider } from "@/components/category-provider";
import "./worker.css";

// スタッフ画面（スマホ用）。管理画面とは別の見た目で、日報を書くことに絞る。
// 未確認のクレーム・未読の通知は管理画面と同じく最初に見せる。

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const noto = Noto_Sans_JP({ weight: ["500", "600"], variable: "--font-noto-jp", display: "swap", preload: false });

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ unread, pendingClaims }, categories] = await Promise.all([loadGateData(user), getCategories()]);
  return (
    <CategoryProvider categories={categories}>
      <div className={`worker ${inter.variable} ${noto.variable} min-h-dvh bg-[var(--w-primary)]`}>
        <div className="mx-auto min-h-dvh max-w-[480px] bg-[var(--w-primary)]">{children}</div>
        {pendingClaims.length > 0 ? <ClaimGate claims={pendingClaims} /> : <StartupGate items={unread} />}
      </div>
    </CategoryProvider>
  );
}
