import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `ログイン | ${APP_NAME}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#0b1110] px-5 py-10 safe-top safe-bottom">
      {/* 背景：深いチャコールに、ブランドの緑をごく薄い光として重ねる＋細いグリッド */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(16,185,129,0.22),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_85%_110%,rgba(20,184,166,0.10),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent_85%)]" />
      </div>
      <div className="app-container flex min-h-[calc(100dvh-5rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pb-6">
          <div className="mb-4 h-20 w-20 overflow-hidden rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/15">
            {/* 未ログインで表示されるページのため、最適化(_next/image)を介さず素の img で確実に表示 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shinkawa-logo.png" alt={APP_NAME} width={80} height={80} className="h-full w-full object-cover" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">{APP_NAME}</h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-white/55">{APP_TAGLINE}</p>
        </div>

        <div className="rounded-3xl bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
          <h2 className="mb-1 text-lg font-bold text-ink">ログイン</h2>
          <p className="mb-5 text-sm text-ink-muted">アカウント情報を入力してください</p>
          <LoginForm from={from} />
          <div className="mt-6 rounded-xl bg-surface-subtle p-3 text-xs leading-relaxed text-ink-muted">
            <p>パスワードを忘れた場合は事務所へ連絡してください。管理者が「作業者管理」から再設定できます。</p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/35">© 2026 {COMPANY_NAME}</p>
      </div>
    </main>
  );
}
