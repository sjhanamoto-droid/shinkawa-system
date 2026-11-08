// スタッフ画面（/w）をローカルで試すためのデモデータ。ローカルのDBにだけ入れる（本番DBでは動かない）。
//
//   npx tsx scripts/dev-worker-demo.ts           … デモのスタッフと予定を作る（何度実行しても作り直すだけ）
//   npx tsx scripts/dev-worker-demo.ts --clean   … デモのデータを消す
//
// ログイン情報は .omc/local-test-accounts.md に書き出す（.omc は Git に上がらない）。

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DEMO_EMAIL = "staff-demo@shinkawa.test";
const DEMO_NOTE = "【デモ】スタッフ画面";
const PROPERTY_PREFIX = "【デモ】";
const ACCOUNTS_FILE = new URL("../.omc/local-test-accounts.md", import.meta.url);

const db = new PrismaClient();

/** ローカルのDB以外では動かさない */
function assertLocalDb() {
  let url = process.env.POSTGRES_PRISMA_URL ?? "";
  if (!url) {
    for (const f of ["../.env.local", "../.env"]) {
      try {
        const m = readFileSync(new URL(f, import.meta.url), "utf8").match(/^POSTGRES_PRISMA_URL=["']?([^"'\n]+)["']?/m);
        if (m) {
          url = m[1];
          break;
        }
      } catch {
        /* ファイルが無ければ次 */
      }
    }
  }
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    console.error(`ローカルのDBではないため中止しました（接続先: ${host || "不明"}）`);
    process.exit(1);
  }
}

function jstKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** 'YYYY-MM-DD' → サーバーTZの深夜0時（アプリの保存形式と同じ） */
function dateOf(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function clean() {
  const occs = await db.occurrence.findMany({ where: { note: DEMO_NOTE }, select: { id: true } });
  const ids = occs.map((o) => o.id);
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  const reports = await db.dailyReport.findMany({
    where: { OR: [{ occurrenceId: { in: ids } }, ...(user ? [{ userId: user.id }] : [])] },
    select: { id: true },
  });
  const rids = reports.map((r) => r.id);
  await db.reportExpense.deleteMany({ where: { reportId: { in: rids } } });
  await db.photo.deleteMany({ where: { reportId: { in: rids } } });
  await db.handover.deleteMany({ where: { reportId: { in: rids } } });
  await db.dailyReport.deleteMany({ where: { id: { in: rids } } });
  await db.occurrence.deleteMany({ where: { id: { in: ids } } });
  await db.property.deleteMany({ where: { name: { startsWith: PROPERTY_PREFIX } } });
  return { occurrences: ids.length, reports: rids.length };
}

async function main() {
  assertLocalDb();
  const removed = await clean();
  if (process.argv.includes("--clean")) {
    await db.user.deleteMany({ where: { email: DEMO_EMAIL } });
    console.log(`デモのデータを消しました（予定 ${removed.occurrences}件・日報 ${removed.reports}件・スタッフ）`);
    return;
  }

  // ── スタッフ（ログインできる作業者）。パスワードは実行のたびに作り直す ──
  const password = `demo-${randomBytes(4).toString("hex")}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { name: "テスト スタッフ", kana: "てすと すたっふ", email: DEMO_EMAIL, passwordHash, role: "STAFF", kind: "EMPLOYEE", department: "CLEANING", canLogin: true, active: true, avatarColor: "#067a54", sortOrder: 999 },
    update: { passwordHash, role: "STAFF", canLogin: true, active: true, sessionVersion: { increment: 1 } },
    select: { id: true },
  });

  // ── 現場（デモ用。キーBOX・連絡先・注意つき） ──
  const customer = await db.customer.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!customer) throw new Error("顧客が1件もありません。先に通常のシードを入れてください");
  const mk = (name: string, data: Partial<{ address: string; keyboxNumber: string; keyboxPlace: string; accessNote: string; contactName: string; contactPhone: string }>) =>
    db.property.create({ data: { customerId: customer.id, name: `${PROPERTY_PREFIX}${name}`, keyboxStatus: data.keyboxNumber ? "HAS" : null, ...data }, select: { id: true } });
  const yokohama = await mk("横浜市の現場", {
    address: "横浜市中区本町1-2-3",
    keyboxNumber: "4821",
    keyboxPlace: "1階 管理室横",
    accessNote: "駐車場は建物の裏です。入る前に管理室へ声をかけてください。",
    contactName: "管理室",
    contactPhone: "045-000-0000",
  });
  const tateyama = await mk("館山ビル", { address: "千葉県館山市北条1-1-1", accessNote: "エレベーターは使わず階段で搬入してください。" });
  const honmoku = await mk("本牧倉庫", { address: "横浜市中区本牧ふ頭1", keyboxNumber: "0715" });

  // ── 予定（今日2件・明日・今週・日報を書き忘れた過去の日） ──
  const today = jstKey(0);
  const occ = (propertyId: string, dayOffset: number, start: string, end: string, category: string, title?: string) =>
    db.occurrence.create({
      data: {
        propertyId,
        customerId: customer.id,
        date: dateOf(jstKey(dayOffset)),
        targetMonth: jstKey(dayOffset).slice(0, 7),
        category,
        department: "CLEANING",
        status: "CONFIRMED",
        title: title ?? null,
        startTime: start,
        endTime: end,
        note: DEMO_NOTE,
        assignments: { create: [{ userId: staff.id }] },
      },
    });
  await occ(yokohama.id, 0, "09:00", "12:00", "FLOOR_CLEANING");
  await occ(tateyama.id, 0, "14:00", "17:00", "REGULAR_CLEANING");
  await occ(honmoku.id, 1, "09:00", "12:00", "REGULAR_CLEANING");
  await occ(yokohama.id, 3, "08:30", "17:00", "FLOOR_CLEANING");
  await occ(honmoku.id, -2, "09:00", "15:30", "REGULAR_CLEANING");

  mkdirSync(new URL("../.omc/", import.meta.url), { recursive: true });
  writeFileSync(
    ACCOUNTS_FILE,
    [
      "# ローカル確認用アカウント（このファイルは Git に上がりません）",
      "",
      `作成日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
      "",
      "## スタッフ（作業者）",
      `- メールアドレス: ${DEMO_EMAIL}`,
      `- パスワード: ${password}`,
      "- 権限: スタッフ（清掃）",
      "",
      "`npx tsx scripts/dev-worker-demo.ts` を実行するたびに、予定とパスワードは作り直されます。",
      "",
    ].join("\n"),
  );
  console.log(`デモのスタッフと予定を作りました（今日 ${today}）。ログイン情報: .omc/local-test-accounts.md`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
