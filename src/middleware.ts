import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// 認証ガード。未ログインは /login へ、ログイン済みで /login に来たらホームへ。
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

  if (session && isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // _next, 静的アセット, favicon, PWA アセット（manifest / sw.js / icons）等を除外
  matcher: [
    "/((?!_next/static|_next/image|manifest.webmanifest|sw.js|icons/|apple-touch-icon.png|shinkawa-logo.png|favicon.ico|icon.svg|apple-icon.png|robots.txt).*)",
  ],
};
