"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { UI_COOKIE, canUseAdminUi } from "@/lib/ui-mode";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** スタッフ画面 ⇄ 管理画面の切り替え。管理画面は最高管理者・事務・手配担当だけ */
export async function setUiMode(mode: "admin" | "worker") {
  const me = await requireUser();
  const store = await cookies();
  if (mode === "admin") {
    if (!canUseAdminUi(me.role)) redirect("/w/menu");
    store.set(UI_COOKIE, "admin", { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
    redirect("/");
  }
  // スタッフ画面に戻す：スマホなら cookie を消すだけで戻る。PC から確かめるときのために worker を入れる
  store.set(UI_COOKIE, "worker", { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  redirect("/w");
}

/** PC でスタッフ画面を見たあと、管理画面へ戻す（cookie を消す） */
export async function clearUiMode() {
  await requireUser();
  const store = await cookies();
  store.delete(UI_COOKIE);
  redirect("/");
}
