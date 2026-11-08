// 表示モード（管理画面／スタッフ画面）の判定。middleware（Edge）からも使うので、ここには純粋な関数だけを置く。
//
// - スマホで開いた人は全員スタッフ画面（/w）
// - 最高管理者・事務・手配担当は、スタッフ画面のメニューから管理画面に切り替えられる（cookie に残す）
// - cookie で明示されていればそれに従う（PC からスタッフ画面を確かめるときなど）

export const UI_COOKIE = "shinkawa_ui";
export type UiMode = "admin" | "worker";

/** 管理画面に切り替えられる役割 */
export const ADMIN_UI_ROLES = ["OWNER", "OFFICE", "SCHEDULER"] as const;

export function canUseAdminUi(role: string | null | undefined): boolean {
  return !!role && (ADMIN_UI_ROLES as readonly string[]).includes(role);
}

/** スマホ（タブレットは除く）か。iPad・Android タブレットは管理画面のまま */
export function isPhoneUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad/i.test(ua)) return false;
  return /iPhone|iPod/i.test(ua) || /Android.*Mobile/i.test(ua) || /Windows Phone/i.test(ua);
}

export function decideUiMode(input: { userAgent: string | null | undefined; cookie: string | null | undefined; role: string | null | undefined }): UiMode {
  if (input.cookie === "admin" && canUseAdminUi(input.role)) return "admin";
  if (input.cookie === "worker") return "worker";
  return isPhoneUserAgent(input.userAgent) ? "worker" : "admin";
}

/** スタッフ画面だけのパス（管理画面モードでもそのまま開ける） */
export function isWorkerPath(pathname: string): boolean {
  return pathname === "/w" || pathname.startsWith("/w/");
}

/**
 * スタッフ画面モードで管理画面の URL を開いたときの行き先。null はそのまま通す（ログイン・印刷・API など）。
 * 通知のリンク（/reports/:id など）がスタッフ画面でもそのまま使えるように、対応する画面へ置き換える。
 */
export function workerPathFor(pathname: string, search: URLSearchParams): string | null {
  if (isWorkerPath(pathname)) return null;
  if (pathname === "/login" || pathname.startsWith("/api/") || pathname === "/offline" || pathname.startsWith("/viewer/")) return null;
  // 印刷・PDF はどちらの画面からも開ける
  if (/^\/reports\/[^/]+\/print$/.test(pathname) || /^\/properties\/[^/]+\/expenses\/print$/.test(pathname)) return null;

  const q = (keys: string[]) => {
    const p = new URLSearchParams();
    for (const k of keys) {
      const v = search.get(k);
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  if (pathname === "/reports/new") return `/w/report${q(["occurrenceId", "propertyId", "userId", "date", "late"])}`;
  let m = pathname.match(/^\/reports\/([^/]+)\/edit$/);
  if (m && m[1] !== "all") return `/w/report?reportId=${encodeURIComponent(m[1])}`;
  m = pathname.match(/^\/reports\/([^/]+)$/);
  if (m && m[1] !== "all") return `/w/reports/${encodeURIComponent(m[1])}`;
  if (pathname === "/reports" || pathname.startsWith("/reports/")) return "/w/reports";
  if (pathname.startsWith("/schedule")) return `/w/calendar${q(["d"])}`;
  m = pathname.match(/^\/properties\/([^/]+)$/);
  if (m) return `/w/sites/${encodeURIComponent(m[1])}`;
  if (pathname.startsWith("/properties")) return "/w/sites";
  if (pathname.startsWith("/notifications") || pathname.startsWith("/announcements") || pathname.startsWith("/claims")) return "/w/notifications";
  if (pathname.startsWith("/catalog")) return "/w/catalog";
  if (pathname.startsWith("/help")) return "/w/help";
  if (pathname.startsWith("/settings/account")) return "/w/account";
  if (pathname.startsWith("/menu")) return "/w/menu";
  return "/w";
}
