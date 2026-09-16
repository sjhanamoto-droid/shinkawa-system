// ルートのスモークテスト。開発サーバー（BASE、既定 http://localhost:3000）に対して、
// シード済みユーザーのセッション Cookie を発行し、各ページが 200 かつ期待する文言を含むかを確認する。
//   npm run dev  →  別ターミナルで  npm run test:routes

import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const AUTH_SECRET = process.env.AUTH_SECRET ?? env.match(/AUTH_SECRET="?([^"\n]+)"?/)?.[1] ?? "";
const secret = new TextEncoder().encode(AUTH_SECRET);
const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const COOKIE = "shinkawa_session";

async function mint(userId: string, role: string, name: string) {
  return new SignJWT({ role, name }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(secret);
}

async function check(path: string, cookie: string, expect: string[]) {
  const res = await fetch(BASE + path, { headers: { Cookie: `${COOKIE}=${cookie}` }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const mainNotFound = /<h1[^>]*>404<\/h1>|<h2[^>]*>This page could not be found/.test(body);
  const missing = expect.filter((e) => !body.includes(e));
  const ok = res.status === 200 && !mainNotFound && missing.length === 0;
  console.log(`${ok ? "✅" : "❌"}  ${String(res.status).padEnd(3)} ${path}${mainNotFound ? "  [404本文]" : ""}${missing.length ? `  欠落:[${missing.join(", ")}]` : ""}`);
  return { path, status: res.status, ok };
}

async function checkRedirect(path: string, cookie: string, label: string) {
  const r = await fetch(BASE + path, { headers: { Cookie: `${COOKIE}=${cookie}` }, redirect: "manual" });
  const body = r.status === 200 ? await r.text() : "";
  const streamed = r.status === 200 && /http-equiv="refresh"/.test(body) && body.includes("NEXT_REDIRECT");
  const ok = r.status === 307 || r.status === 302 || streamed;
  console.log(`${ok ? "✅" : "❌"}  ${r.status} ${path}（${label}→リダイレクト期待）`);
  return ok;
}

async function main() {
  const owner = await db.user.findFirst({ where: { role: "OWNER" } });
  const office = await db.user.findFirst({ where: { role: "OFFICE" } });
  const scheduler = await db.user.findFirst({ where: { role: "SCHEDULER" } });
  const staff = await db.user.findFirst({ where: { role: "STAFF", kind: "EMPLOYEE", canLogin: true } });
  const customer = await db.customer.findFirst({ where: { properties: { some: {} } } });
  const property = await db.property.findFirst({ where: { status: "ACTIVE" } });
  const job = await db.job.findFirst({ where: { ruleKind: { not: null } } });
  const partner = await db.partner.findFirst();
  const vehicle = await db.vehicle.findFirst({ where: { active: true } });
  const someUser = await db.user.findFirst({ where: { role: "STAFF" } });
  if (!owner || !office || !scheduler || !staff || !customer || !property || !job || !partner || !vehicle || !someUser) throw new Error("seed not found");

  const o = await mint(owner.id, owner.role, owner.name);
  const s = await mint(staff.id, staff.role, staff.name);
  const sc = await mint(scheduler.id, scheduler.role, scheduler.name);
  const results: { ok: boolean; path: string; status: number }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  console.log("\n=== 最高管理者 ===");
  results.push(await check("/", o, ["今日の予定", owner.name]));
  results.push(await check("/schedule", o, ["カレンダー", "未割当"]));
  results.push(await check(`/schedule?view=month&d=${today}`, o, ["カレンダー"]));
  results.push(await check(`/schedule?view=day&d=${today}`, o, ["カレンダー"]));
  results.push(await check(`/schedule?view=board&d=${today}`, o, ["担当未定"]));
  results.push(await check("/customers", o, ["顧客", customer.name]));
  results.push(await check(`/customers/${customer.id}`, o, [customer.name, "物件（現場）"]));
  results.push(await check(`/customers/${customer.id}/edit`, o, ["顧客名"]));
  results.push(await check("/customers/new", o, ["顧客名"]));
  results.push(await check("/customers/import", o, ["CSV"]));
  results.push(await check("/properties", o, ["現場（物件）"]));
  results.push(await check(`/properties/${property.id}`, o, [property.name, "基本情報", "メモ・引き継ぎ"]));
  results.push(await check(`/properties/${property.id}/edit`, o, ["物件名", "キーBOX"]));
  results.push(await check("/properties/new", o, ["物件名"]));
  results.push(await check("/jobs", o, ["案件"]));
  results.push(await check(`/jobs/${job.id}`, o, [job.name, "実施回"]));
  results.push(await check(`/jobs/${job.id}/edit`, o, ["案件名", "周期"]));
  results.push(await check("/jobs/new", o, ["案件名"]));
  results.push(await check("/workers", o, ["作業者", owner.name]));
  results.push(await check("/workers/new", o, ["作業者を追加"]));
  results.push(await check(`/workers/${someUser.id}/edit`, o, ["作業者を編集", someUser.name]));
  results.push(await check("/partners", o, ["協力会社", partner.name]));
  results.push(await check(`/partners/${partner.id}/edit`, o, [partner.name]));
  results.push(await check("/vehicles", o, ["車両", vehicle.name]));
  results.push(await check("/vehicles/new", o, ["車両を追加"]));
  results.push(await check(`/vehicles/${vehicle.id}/edit`, o, ["車両を編集", vehicle.name]));
  results.push(await check("/notifications", o, ["通知"]));
  results.push(await check("/settings", o, ["設定", "作業者管理", "車両管理"]));
  results.push(await check("/settings/app", o, ["会社情報"]));
  results.push(await check("/settings/account", o, ["アカウント設定"]));
  results.push(await check("/menu", o, ["メニュー"]));
  results.push(await check("/help", o, ["使い方"]));

  console.log("\n=== スタッフ ===");
  results.push(await check("/", s, ["今日のあなたの予定", staff.name]));
  results.push(await check("/schedule", s, ["カレンダー"]));
  results.push(await check("/properties", s, ["現場（物件）"]));
  results.push(await check(`/properties/${property.id}`, s, [property.name]));
  results.push(await check("/settings", s, ["設定", "アカウント設定"]));

  console.log("\n=== 手配担当 ===");
  results.push(await check("/jobs", sc, ["案件"]));
  results.push(await check("/customers", sc, ["顧客"]));

  console.log("\n=== 認可 ===");
  let authzOk = true;
  authzOk = (await checkRedirect("/workers", s, "スタッフ")) && authzOk;
  authzOk = (await checkRedirect("/jobs", s, "スタッフ")) && authzOk;
  authzOk = (await checkRedirect("/customers/import", sc, "手配担当")) && authzOk;
  authzOk = (await checkRedirect("/partners", sc, "手配担当")) && authzOk;
  authzOk = (await checkRedirect("/vehicles", sc, "手配担当")) && authzOk;
  // スタッフの HTML に金額が含まれないこと
  {
    const r = await fetch(BASE + `/jobs/${job.id}`, { headers: { Cookie: `${COOKIE}=${s}` }, redirect: "manual" });
    const ok = r.status !== 200 || !(await r.text()).includes("金額");
    console.log(`${ok ? "✅" : "❌"}  ${r.status} /jobs/${job.id}（スタッフに金額が出ない）`);
    authzOk = ok && authzOk;
  }

  console.log("\n=== ガード（未ログイン→/login） ===");
  const noauth = await fetch(BASE + "/", { redirect: "manual" });
  const guardOk = noauth.status === 307 || noauth.status === 302;
  console.log(`${guardOk ? "✅" : "❌"}  ${noauth.status} /`);

  const failed = results.filter((r) => !r.ok);
  const allOk = failed.length === 0 && guardOk && authzOk;
  console.log(`\n────────── ${results.length - failed.length}/${results.length} ルートOK / ガード${guardOk ? "OK" : "NG"} / 認可${authzOk ? "OK" : "NG"} ──────────`);
  if (!allOk) process.exitCode = 1;
  else console.log("🎉 全ルート正常 + 認可ガード確認");
}

main().finally(() => db.$disconnect());
