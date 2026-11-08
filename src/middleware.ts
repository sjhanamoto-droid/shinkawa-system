import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { UI_COOKIE, decideUiMode, workerPathFor } from "@/lib/ui-mode";

// 認証ガード。未ログインは /login へ。
// ログイン済みで /login に来たときのホームへの振り分けは、ログイン画面側で行う（ここでは署名しか確かめられず、
// パスワード変更などで使えなくなったログインでも「ログイン済み」に見えて、/ と /login を往復してしまうため）。
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Vercel Cron（Bearer CRON_SECRET）はセッション Cookie を持たないため対象外。
  // 認可は各ルート側の Bearer トークン検証で行う。
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isLoginPage = pathname === "/login";

  if (!session && !isLoginPage) {
    // API（画像配信等）は HTML へリダイレクトせず 401 を返す
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // スマホはスタッフ画面（/w）へ。管理画面の URL を開いたら、対応するスタッフ画面に置き換える
  // GET のページ表示だけを振り分ける（画面からの送信＝server action の POST はそのまま通す）
  if (session && !pathname.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD")) {
    const mode = decideUiMode({ userAgent: req.headers.get("user-agent"), cookie: req.cookies.get(UI_COOKIE)?.value, role: session.role });
    if (mode === "worker") {
      const to = workerPathFor(pathname, req.nextUrl.searchParams);
      if (to) {
        const url = req.nextUrl.clone();
        const [path, query = ""] = to.split("?");
        url.pathname = path;
        url.search = query ? `?${query}` : "";
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // _next, 静的アセット, favicon, PWA アセット（manifest / sw.js / icons）等を除外
  matcher: [
    "/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icons/|apple-touch-icon.png|shinkawa-mark.png|favicon.ico|icon.svg|apple-icon.png|robots.txt).*)",
  ],
};
