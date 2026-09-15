// シンカワシステム シードデータ
//
// 決定的（seed 固定）な擬似乱数で、顧客300社・物件約450・案件（定期150＋スポット＋工事）・
// 前月〜翌月の実施回（1日10〜20件）・配員・変更履歴・通知を作る。
// SEED_ONLY_IF_EMPTY=1 のときは User が1件でもあればスキップ（vercel-build 用）。
// パスワードは SEED_PASSWORD（既定 shinkawa123）を全ログインユーザー共通で使う。

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { slotsForMonth, seriesKey, type RuleParams } from "../src/lib/recurrence";
import { dateFromKey, jstMonthKey, addMonthsKey, jstDateKey, storedDateKey } from "../src/lib/date";
import { AVATAR_COLORS, WORKER_TAG_SUGGESTIONS, type RuleKind } from "../src/lib/constants";

const db = new PrismaClient();

// ── 決定的 PRNG（mulberry32） ──
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260915);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cuidLike = (prefix: string, n: number) => `${prefix}_${n.toString(36).padStart(6, "0")}`;

// ── 日付ユーティリティ（キー文字列ベース） ──
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function keyOf(ym: string, d: number): string {
  return `${ym}-${String(d).padStart(2, "0")}`;
}
function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
/** 平日寄りのランダム日付 */
function randomDayKey(ym: string, weekdayBias = 0.8): string {
  for (let i = 0; i < 10; i++) {
    const key = keyOf(ym, int(1, daysInMonth(ym)));
    const wd = weekdayOf(key);
    if (wd !== 0 && wd !== 6) return key;
    if (!chance(weekdayBias)) return key;
  }
  return keyOf(ym, int(1, daysInMonth(ym)));
}

async function createMany<T>(label: string, rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 500) await fn(rows.slice(i, i + 500));
  console.log(`  ${label}: ${rows.length}件`);
}

// ── 名前のもと ──
const CUSTOMER_FIXED = [
  "グリーンランド", "AST", "エルゴ", "フラワー", "タキズミ", "武蔵野流", "クイーンズ", "マハロ", "三谷不動産", "ホームアシスト",
  "アバンス", "GMC", "ゴダイ", "都築SC", "草加SC", "コスモ", "ビルネット", "門戸", "S-Brain", "アートレオ", "ホーム技研", "帝栄高橋工業",
];
const PLACE = ["越谷", "草加", "春日部", "川口", "浦和", "大宮", "八潮", "三郷", "吉川", "松伏", "岩槻", "蕨", "戸田", "北千住", "綾瀬", "竹ノ塚", "西新井", "亀有", "金町", "松戸", "柏", "流山", "野田", "白岡", "久喜", "幸手", "杉戸", "宮代", "蓮田", "上尾"];
const CO_SUFFIX = ["不動産", "管理", "ハウジング", "建設", "ビルサービス", "リフォーム", "エステート", "住建", "産業", "興業", "工務店", "商事"];
const PROP_TYPE = ["マンション", "ハイツ", "ビル", "コーポ", "レジデンス", "ハイム", "アパート", "テラス", "パレス", "メゾン", "ガーデン", "スクエア"];
const PROP_NAME = ["さくら", "ひまわり", "けやき", "つばき", "第2", "第3", "南", "北", "東", "西", "中央", "駅前", "パーク", "グランド", "ロイヤル", "ラフォーレ", "サンライズ", "グリーン", "ブルー", "セント"];
const FIRST = ["太郎", "健太", "翔", "大輔", "拓也", "直樹", "一郎", "陽介", "誠", "亮", "彩", "美咲", "結衣", "麻衣", "さくら", "花", "香織", "優子", "里奈", "愛"];
const LAST = ["直井", "佐藤", "高橋", "田中", "渡辺", "伊藤", "山本", "中村", "小林", "加藤", "吉田", "山田", "松本", "井上", "木村", "林", "斎藤", "清水", "森", "池田", "橋本", "石川", "前田", "藤田", "岡田", "後藤", "長谷川", "村上", "近藤", "石井"];

async function main() {
  if (process.env.SEED_ONLY_IF_EMPTY === "1") {
    const existing = await db.user.count();
    if (existing > 0) {
      console.log("既にデータが存在するためシードをスキップします。");
      return;
    }
  }
  const password = process.env.SEED_PASSWORD || "shinkawa123";
  const passwordHash = await bcrypt.hash(password, 10);
  const thisMonth = jstMonthKey();
  const prevMonth = addMonthsKey(thisMonth, -1);
  const nextMonth = addMonthsKey(thisMonth, 1);
  const months = [prevMonth, thisMonth, nextMonth];
  const todayKey = jstDateKey();

  console.log("🧹 既存データを削除中...");
  await db.assignment.deleteMany();
  await db.occurrenceChangeLog.deleteMany();
  await db.notification.deleteMany();
  await db.pushSubscription.deleteMany();
  await db.photo.deleteMany();
  await db.comment.deleteMany();
  await db.reportExpense.deleteMany();
  await db.dailyReport.deleteMany();
  await db.handover.deleteMany();
  await db.occurrence.deleteMany();
  await db.job.deleteMany();
  await db.propertyRelation.deleteMany();
  await db.propertyMemo.deleteMany();
  await db.property.deleteMany();
  await db.contactPerson.deleteMany();
  await db.customer.deleteMany();
  await db.user.deleteMany();
  await db.partner.deleteMany();

  console.log("⚙️ アプリ設定");
  await db.appSetting.upsert({
    where: { id: "singleton" },
    update: { companyName: "株式会社シンカワ", defaultStartTime: "09:00", defaultEndTime: "17:00", generateDay: 25 },
    create: { id: "singleton", companyName: "株式会社シンカワ", companyAddress: "埼玉県越谷市", companyPhone: "048-000-0000", defaultStartTime: "09:00", defaultEndTime: "17:00", generateDay: 25 },
  });

  // ── 協力会社 ──
  console.log("🤝 協力会社");
  const partnerDefs = [
    { name: "クリーンサポート埼玉", kind: "PARTNER", department: "CLEANING" },
    { name: "ビルメンテ川口", kind: "PARTNER", department: "CLEANING" },
    { name: "（有）マルヨシ清掃", kind: "PARTNER", department: "CLEANING" },
    { name: "スカイクリーン", kind: "PARTNER", department: "CLEANING" },
    { name: "（有）大和内装", kind: "SUBCONTRACTOR", department: "CONSTRUCTION" },
    { name: "アベ電設", kind: "SUBCONTRACTOR", department: "CONSTRUCTION" },
  ];
  const partners = await Promise.all(
    partnerDefs.map((p, i) =>
      db.partner.create({ data: { ...p, kana: p.name, contactName: `${pick(LAST)} ${pick(FIRST)}`, phone: `048-${int(100, 999)}-${int(1000, 9999)}`, sortOrder: i } }),
    ),
  );

  // ── ユーザー（作業者台帳） ──
  console.log("👤 作業者");
  type UserSeed = Prisma.UserCreateManyInput;
  const users: UserSeed[] = [];
  let ui = 0;
  const color = () => AVATAR_COLORS[ui++ % AVATAR_COLORS.length].value;
  const tagsFor = (kind: string) => {
    const t = new Set<string>();
    if (kind === "PARTTIME") t.add("アルバイト");
    for (let i = 0; i < int(0, 2); i++) t.add(pick(WORKER_TAG_SUGGESTIONS.filter((x) => x !== "アルバイト")));
    return Array.from(t);
  };
  users.push({ id: "u_kondo", name: "近藤 社長", kana: "こんどう", email: "kondo@example.com", passwordHash, role: "OWNER", kind: "EMPLOYEE", department: null, tags: [], canLogin: true, avatarColor: color(), sortOrder: 0 });
  users.push({ id: "u_jimu", name: "事務 花子", kana: "じむ はなこ", email: "jimu@example.com", passwordHash, role: "OFFICE", kind: "EMPLOYEE", department: null, tags: [], canLogin: true, avatarColor: color(), sortOrder: 1 });
  users.push({ id: "u_tehai_c", name: "石神 清掃手配", kana: "いしがみ", email: "tehai-c@example.com", passwordHash, role: "SCHEDULER", kind: "EMPLOYEE", department: "CLEANING", tags: ["運転可"], canLogin: true, avatarColor: color(), sortOrder: 2 });
  users.push({ id: "u_tehai_k", name: "武田 工事手配", kana: "たけだ", email: "tehai-k@example.com", passwordHash, role: "SCHEDULER", kind: "EMPLOYEE", department: "CONSTRUCTION", tags: ["運転可"], canLogin: true, avatarColor: color(), sortOrder: 3 });
  const staffNames: [string, string, string][] = [
    ["藤野", "ふじの", "CLEANING"], ["島田", "しまだ", "CLEANING"], ["高畑", "たかはた", "CLEANING"], ["梅澤", "うめざわ", "CLEANING"], ["山口", "やまぐち", "CLEANING"], ["鈴木", "すずき", "CONSTRUCTION"],
  ];
  staffNames.forEach(([n, k, d], i) => {
    users.push({ id: `u_staff_${i}`, name: n, kana: k, email: `${k}@example.com`, passwordHash, role: "STAFF", kind: "EMPLOYEE", department: d, tags: tagsFor("EMPLOYEE"), canLogin: true, avatarColor: color(), sortOrder: 10 + i });
  });
  const ptNames = ["JOE", "スカイ", "大河原", "笹崎", "豊川", "新井", "林崎", "河辺"];
  ptNames.forEach((n, i) => {
    users.push({ id: `u_pt_${i}`, name: n, kana: n, email: `pt${String(i + 1).padStart(2, "0")}@example.com`, passwordHash, role: "STAFF", kind: "PARTTIME", department: "CLEANING", tags: Array.from(new Set(["アルバイト", pick(["土日可", "大学生", "夜間可", "運転可"])])), canLogin: true, avatarColor: color(), sortOrder: 20 + i });
  });
  const cleaningPartners = partners.filter((p) => p.kind === "PARTNER");
  for (let i = 0; i < 10; i++) {
    const p = cleaningPartners[i % cleaningPartners.length];
    users.push({ id: `u_ps_${i}`, name: `${pick(LAST)} ${pick(FIRST)}`, kana: null, email: null, passwordHash: null, role: "STAFF", kind: "PARTNER_STAFF", department: "CLEANING", partnerId: p.id, tags: tagsFor("PARTNER_STAFF"), canLogin: false, avatarColor: color(), sortOrder: 30 + i });
  }
  const subPartners = partners.filter((p) => p.kind === "SUBCONTRACTOR");
  for (let i = 0; i < 6; i++) {
    const p = subPartners[i % subPartners.length];
    users.push({ id: `u_sub_${i}`, name: `${pick(LAST)} ${pick(FIRST)}`, kana: null, email: null, passwordHash: null, role: "STAFF", kind: "SUBCONTRACTOR", department: "CONSTRUCTION", partnerId: p.id, tags: [pick(["クロス", "設備", "電気", "大工", "塗装"])], canLogin: false, avatarColor: color(), sortOrder: 40 + i });
  }
  await db.user.createMany({ data: users });
  console.log(`  作業者: ${users.length}名`);
  const cleaningWorkers = users.filter((u) => u.department === "CLEANING" && u.role === "STAFF").map((u) => u.id as string);
  const constructionWorkers = users.filter((u) => u.department === "CONSTRUCTION" && u.role === "STAFF").map((u) => u.id as string);
  const partnerStaffByPartner = new Map<string, string[]>();
  for (const u of users) if (u.partnerId) partnerStaffByPartner.set(u.partnerId, [...(partnerStaffByPartner.get(u.partnerId) ?? []), u.id as string]);

  // ── 顧客 ──
  console.log("🏢 顧客");
  const customers: Prisma.CustomerCreateManyInput[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < 300; i++) {
    let name: string;
    let shortName: string;
    if (i < CUSTOMER_FIXED.length) {
      shortName = CUSTOMER_FIXED[i];
      name = /^[A-Za-z-]+$/.test(shortName) ? `${shortName}株式会社` : `株式会社${shortName}`;
    } else {
      const base = `${pick(PLACE)}${pick(CO_SUFFIX)}`;
      if (usedNames.has(base)) {
        i--;
        continue;
      }
      shortName = base.slice(0, 8);
      name = chance(0.5) ? `株式会社${base}` : `${base}株式会社`;
    }
    usedNames.add(name);
    customers.push({
      id: cuidLike("c", i),
      name,
      shortName,
      kana: shortName,
      registrationType: chance(0.85) ? "PRIME" : "OWNER",
      tradeStatus: chance(0.9) ? "CONTINUING" : chance(0.5) ? "NEW" : "SUSPENDED",
      phone: `048-${int(100, 999)}-${int(1000, 9999)}`,
      headOfficeAddress: `埼玉県${pick(PLACE)}市${pick(["中央", "本町", "駅前", "東", "西"])}${int(1, 5)}-${int(1, 20)}-${int(1, 15)}`,
      cybozuId: i % 10 === 0 ? `CB-${String(i + 1).padStart(4, "0")}` : null,
      importedAt: i % 10 === 0 ? new Date() : null,
    });
  }
  await createMany("顧客", customers, (c) => db.customer.createMany({ data: c }));

  // ── 物件 ──
  console.log("🏠 物件");
  const properties: Prisma.PropertyCreateManyInput[] = [];
  let pi = 0;
  for (const c of customers) {
    const n = int(1, 3);
    for (let k = 0; k < n; k++) {
      const hasKeybox = chance(0.6);
      const name = `${pick(PROP_NAME)}${pick(PROP_TYPE)}${chance(0.3) ? ` ${pick(["A棟", "B棟", "本館", "別館"])}` : ""}`;
      properties.push({
        id: cuidLike("p", pi++),
        customerId: c.id as string,
        name,
        kana: name,
        address: `埼玉県${pick(PLACE)}市${pick(["中央", "本町", "駅前", "南", "北", "東", "西", "新田", "大成"])}${int(1, 6)}-${int(1, 25)}-${int(1, 20)}`,
        building: chance(0.4) ? `${int(2, 5)}階建 ${int(6, 24)}戸` : null,
        unitCount: int(1, 20),
        keyboxStatus: hasKeybox ? "HAS" : chance(0.5) ? "NONE" : null,
        keyboxNumber: hasKeybox ? String(int(1000, 9999)) : null,
        keyboxPlace: hasKeybox ? pick(["1階メーターボックス内", "裏口ドアノブ", "駐輪場の柱", "管理人室横", "集合ポスト下"]) : null,
        keyboxNoneReason: !hasKeybox && chance(0.5) ? "管理会社から当日受領" : null,
        accessNote: chance(0.3) ? pick(["駐車は敷地内1台まで", "裏口から入館。インターホン不要", "管理人さんに一声かける", "ゴミ置き場の鍵は別途"]) : null,
        status: chance(0.95) ? "ACTIVE" : "INACTIVE",
      });
    }
  }
  await createMany("物件", properties, (c) => db.property.createMany({ data: c }));
  const activeProps = properties.filter((p) => p.status === "ACTIVE");

  // ── 案件 ──
  console.log("📋 案件");
  const jobs: (Prisma.JobCreateManyInput & { _rule?: { kind: RuleKind; params: RuleParams } })[] = [];
  let ji = 0;
  const ruleMix: [RuleKind, number][] = [["MONTHLY", 50], ["TWICE_MONTHLY", 25], ["WEEKLY", 30], ["NTH_WEEKDAY", 25], ["EVERY_N_MONTHS", 12], ["SEASONAL", 8]];
  const propPool = shuffle(activeProps);
  let pp = 0;
  const nextProp = () => propPool[pp++ % propPool.length];
  for (const [kind, count] of ruleMix) {
    for (let i = 0; i < count; i++) {
      const prop = nextProp();
      let params: RuleParams = {};
      let category = "REGULAR_CLEANING";
      switch (kind) {
        case "MONTHLY":
          params = chance(0.7) ? { dayOfMonth: int(1, 28) } : {};
          break;
        case "TWICE_MONTHLY":
          params = chance(0.7) ? { firstDay: int(1, 15), secondDay: int(16, 28) } : {};
          break;
        case "WEEKLY":
          params = { weekday: chance(0.6) ? 3 : int(1, 5) };
          break;
        case "NTH_WEEKDAY":
          params = { weekday: int(1, 6), nth: int(1, 4) };
          break;
        case "EVERY_N_MONTHS":
          params = { interval: pick([2, 3, 6]), anchorMonth: prevMonth, dayOfMonth: int(1, 28) };
          category = chance(0.5) ? "FLOOR_CLEANING" : "REGULAR_CLEANING";
          break;
        case "SEASONAL":
          params = { months: chance(0.5) ? [12] : [7, 8], dayOfMonth: chance(0.5) ? int(1, 28) : null };
          category = chance(0.5) ? "AIRCON" : "REGULAR_CLEANING";
          break;
      }
      if (kind === "MONTHLY" && chance(0.15)) category = "FLOOR_CLEANING";
      jobs.push({
        id: cuidLike("j", ji++),
        customerId: prop.customerId,
        propertyId: prop.id as string,
        name: `${category === "AIRCON" ? "エアコン清掃" : category === "FLOOR_CLEANING" ? "床清掃" : "共用部定期清掃"}`,
        department: "CLEANING",
        category,
        contractType: "REGULAR",
        ruleKind: kind,
        ruleParams: params as Prisma.InputJsonValue,
        unitCount: prop.unitCount ?? null,
        headcount: int(1, 3),
        defaultStartTime: pick(["09:00", "09:00", "10:00", "13:00", null]),
        defaultEndTime: null,
        amount: int(80, 1200) * 100,
        status: "ACTIVE",
        _rule: { kind, params },
      });
    }
  }
  for (let i = 0; i < 60; i++) {
    const prop = nextProp();
    const category = pick(["HANDOVER_CLEANING", "POST_REFORM_CLEANING", "HANDOVER_CLEANING"]);
    jobs.push({ id: cuidLike("j", ji++), customerId: prop.customerId, propertyId: prop.id as string, name: `${category === "HANDOVER_CLEANING" ? "引渡し清掃" : "リフォーム後清掃"} ${int(101, 505)}号`, department: "CLEANING", category, contractType: "SPOT", unitCount: 1, headcount: int(1, 3), defaultStartTime: "09:00", amount: int(150, 600) * 100, status: "ACTIVE" });
  }
  for (let i = 0; i < 20; i++) {
    const prop = nextProp();
    const category = chance(0.7) ? "INTERIOR" : "EXTERIOR";
    jobs.push({ id: cuidLike("j", ji++), customerId: prop.customerId, propertyId: prop.id as string, name: `${category === "INTERIOR" ? "内装工事" : "外壁工事"} ${pick(["クロス張替", "CF張替", "塗装", "原状回復", "設備交換"])}`, department: "CONSTRUCTION", category, contractType: "CONSTRUCTION", unitCount: 1, headcount: int(2, 4), defaultStartTime: "08:30", amount: int(1500, 12000) * 100, status: "ACTIVE" });
  }
  await createMany("案件", jobs.map(({ _rule, ...j }) => { void _rule; return j; }), (c) => db.job.createMany({ data: c }));

  // ── 実施回 ──
  console.log("🗓 実施回");
  const occurrences: Prisma.OccurrenceCreateManyInput[] = [];
  const assignments: Prisma.AssignmentCreateManyInput[] = [];
  const changeLogs: Prisma.OccurrenceChangeLogCreateManyInput[] = [];
  let oi = 0;
  const statusFor = (dateKey: string | null, ym: string): string => {
    if (!dateKey) return "UNASSIGNED";
    if (ym === prevMonth || dateKey < todayKey) return chance(0.92) ? "DONE" : "CANCELLED";
    if (ym === nextMonth) return chance(0.3) ? "TENTATIVE" : "UNASSIGNED";
    const r = rand();
    return r < 0.6 ? "CONFIRMED" : r < 0.9 ? "TENTATIVE" : "UNASSIGNED";
  };
  const assign = (occId: string, dept: string, headcount: number, status: string) => {
    if (status === "UNASSIGNED" || status === "CANCELLED") return;
    // 1割は「日付ありで担当なし」を再現したいが、状態は UNASSIGNED にしておく
    const pool = dept === "CONSTRUCTION" ? constructionWorkers : cleaningWorkers;
    let picked: string[];
    if (dept === "CLEANING" && chance(0.25)) {
      const p = pick(cleaningPartners);
      picked = shuffle(partnerStaffByPartner.get(p.id) ?? []).slice(0, Math.max(1, headcount));
    } else {
      picked = shuffle(pool).slice(0, Math.max(1, Math.min(headcount, 3)));
    }
    picked.forEach((userId, i) => assignments.push({ occurrenceId: occId, userId, isLead: i === 0, createdById: "u_jimu" }));
  };
  const pushOcc = (o: Omit<Prisma.OccurrenceCreateManyInput, "id" | "version">, dept: string, headcount: number) => {
    const id = cuidLike("o", oi++);
    let status = o.status ?? "UNASSIGNED";
    // 日付あり・担当なし（担当未定）を1割ほど混ぜる
    const noWorker = o.date != null && status !== "DONE" && status !== "CANCELLED" && o.category !== "OFF" && chance(0.1);
    if (noWorker) status = "UNASSIGNED";
    occurrences.push({ ...o, id, status, version: 1 });
    if (!noWorker) assign(id, dept, headcount, status);
    return id;
  };

  for (const j of jobs) {
    if (j.contractType === "REGULAR" && j._rule) {
      for (const ym of months) {
        for (const slot of slotsForMonth(j._rule.kind, j._rule.params, ym)) {
          const status = statusFor(slot.date, ym);
          pushOcc(
            {
              jobId: j.id,
              propertyId: j.propertyId,
              customerId: j.customerId,
              seriesKey: seriesKey(j.id as string, ym, slot.index),
              department: j.department,
              category: j.category,
              targetMonth: ym,
              date: slot.date ? dateFromKey(slot.date) : null,
              windowStart: dateFromKey(slot.windowStart),
              windowEnd: dateFromKey(slot.windowEnd),
              startTime: j.defaultStartTime ?? null,
              status,
              headcount: j.headcount,
              unitCount: j.unitCount,
              amount: j.amount,
              source: "GENERATED",
              createdById: "u_jimu",
            },
            j.department,
            j.headcount ?? 1,
          );
        }
      }
    } else if (j.contractType === "SPOT") {
      const ym = pick(months);
      const dateKey = randomDayKey(ym);
      const status = statusFor(dateKey, ym);
      pushOcc({ jobId: j.id, propertyId: j.propertyId, customerId: j.customerId, department: j.department, category: j.category, targetMonth: ym, date: dateFromKey(dateKey), startTime: j.defaultStartTime ?? null, status, headcount: j.headcount, unitCount: 1, amount: j.amount, source: "MANUAL", createdById: pick(["u_jimu", "u_kondo"]) }, j.department, j.headcount ?? 2);
    } else {
      const ym = pick(months);
      const dateKey = randomDayKey(ym, 0.95);
      const span = int(1, 4);
      const status = statusFor(dateKey, ym);
      pushOcc({ jobId: j.id, propertyId: j.propertyId, customerId: j.customerId, department: "CONSTRUCTION", category: j.category, targetMonth: ym, date: dateFromKey(dateKey), endDate: dateFromKey(shiftKey(dateKey, span)), startTime: "08:30", endTime: "17:00", status, headcount: j.headcount, unitCount: 1, amount: j.amount, source: "MANUAL", createdById: "u_tehai_k" }, "CONSTRUCTION", j.headcount ?? 3);
    }
  }
  // 追加のスポット（月40件）・休み・現調・応援
  for (const ym of months) {
    for (let i = 0; i < 40; i++) {
      const prop = nextProp();
      const dateKey = randomDayKey(ym);
      const category = pick(["HANDOVER_CLEANING", "HANDOVER_CLEANING", "POST_REFORM_CLEANING", "AIRCON", "FLOOR_CLEANING"]);
      const status = statusFor(dateKey, ym);
      pushOcc({ propertyId: prop.id as string, customerId: prop.customerId, department: "CLEANING", category, targetMonth: ym, date: dateFromKey(dateKey), startTime: pick(["09:00", "10:00", "13:00", null]), status, headcount: int(1, 3), unitCount: category === "HANDOVER_CLEANING" ? 1 : prop.unitCount ?? null, amount: int(150, 800) * 100, source: chance(0.3) ? "QUICK" : "MANUAL", createdById: pick(["u_jimu", "u_kondo", "u_tehai_c"]) }, "CLEANING", 2);
    }
    for (let i = 0; i < 8; i++) {
      const dateKey = randomDayKey(ym);
      const w = pick([...cleaningWorkers, ...constructionWorkers]);
      const id = cuidLike("o", oi++);
      occurrences.push({ id, department: "CLEANING", category: "OFF", title: "休み", targetMonth: ym, date: dateFromKey(dateKey), status: ym === prevMonth ? "DONE" : "CONFIRMED", source: "MANUAL", createdById: "u_jimu", version: 1 });
      assignments.push({ occurrenceId: id, userId: w, createdById: "u_jimu" });
    }
    for (let i = 0; i < 6; i++) {
      const prop = nextProp();
      const dateKey = randomDayKey(ym);
      const status = statusFor(dateKey, ym);
      pushOcc({ propertyId: prop.id as string, customerId: prop.customerId, department: chance(0.5) ? "CLEANING" : "CONSTRUCTION", category: "SURVEY", targetMonth: ym, date: dateFromKey(dateKey), startTime: pick(["10:00", "13:30", "15:00"]), status, headcount: 1, source: "MANUAL", createdById: "u_kondo" }, "CLEANING", 1);
    }
    for (let i = 0; i < 4; i++) {
      const dateKey = randomDayKey(ym);
      const status = statusFor(dateKey, ym);
      pushOcc({ department: "CLEANING", category: "SUPPORT", title: `${pick(CUSTOMER_FIXED)} 応援`, targetMonth: ym, date: dateFromKey(dateKey), status, headcount: int(1, 2), source: "MANUAL", createdById: "u_kondo" }, "CLEANING", 1);
    }
  }
  await createMany("実施回", occurrences, (c) => db.occurrence.createMany({ data: c }));
  // 同一(occurrence,user)の重複を除く
  const seenA = new Set<string>();
  const uniqAssignments = assignments.filter((a) => {
    const k = `${a.occurrenceId}:${a.userId}`;
    if (seenA.has(k)) return false;
    seenA.add(k);
    return true;
  });
  await createMany("配員", uniqAssignments, (c) => db.assignment.createMany({ data: c }));

  // ── 変更履歴（移動30件） ──
  const movable = occurrences.filter((o) => o.date && o.targetMonth !== nextMonth);
  for (let i = 0; i < 30 && i < movable.length; i++) {
    const o = movable[int(0, movable.length - 1)];
    const to = o.date as Date;
    const toKey = storedDateKey(to);
    const fromKey = shiftKey(toKey, pick([-2, -1, 1, 2]));
    changeLogs.push({ occurrenceId: o.id as string, actorId: pick(["u_jimu", "u_kondo"]), action: "MOVE", field: "date", fromValue: fromKey, toValue: toKey, scope: "ONE", reason: pick(["人員の組み替え", "お客様都合", "雨天のため", null]) });
  }
  await createMany("変更履歴", changeLogs, (c) => db.occurrenceChangeLog.createMany({ data: c }));

  // ── 通知 ──
  await db.notification.createMany({
    data: [
      { userId: "u_kondo", type: "GENERATED", title: `${nextMonth.replace("-", "年")}月分の定期を生成しました`, body: "未割当レーンから日付を決めてください", href: `/schedule?view=week&d=${nextMonth}-01`, dedupeKey: `seed-gen-${nextMonth}` },
      { userId: "u_staff_0", type: "OCC_MOVED", title: "予定の日付が変わりました", body: "グリーンランド 定期清掃（人員の組み替え）", href: "/schedule?view=day", dedupeKey: "seed-moved-1" },
      { userId: "u_staff_1", type: "OCC_ASSIGNED", title: "予定の担当になりました", body: "AST 引渡し清掃", href: "/schedule?view=day", dedupeKey: "seed-assigned-1" },
    ],
  });

  // ── 物件メモ・引き継ぎ（少し） ──
  const memoProps = shuffle(activeProps).slice(0, 40);
  await db.propertyMemo.createMany({
    data: memoProps.map((p) => ({ propertyId: p.id as string, content: pick(["ゴミ置き場の鍵は管理人室", "3階の廊下、電球切れを報告済み", "駐車は裏の月極2台まで", "オーナーさんが時々来る。挨拶を", "ワックスはA棟のみ"]), createdById: pick(["u_staff_0", "u_staff_1", "u_kondo"]) })),
  });
  await db.handover.createMany({
    data: memoProps.slice(0, 12).map((p) => ({ propertyId: p.id as string, content: pick(["エントランスの自動ドアが不調。触らないこと", "次回、ベランダ側の排水溝も清掃", "鍵の場所が変わった（ポスト下→管理人室）"]), createdById: "u_staff_0" })),
  });

  // ── サマリー ──
  const perDay = new Map<string, number>();
  for (const o of occurrences) {
    if (!o.date) continue;
    const k = typeof o.date === "string" ? o.date.slice(0, 10) : storedDateKey(o.date);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const counts = Array.from(perDay.values());
  const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
  console.log("\n✅ シード完了");
  console.log(`  顧客 ${customers.length} / 物件 ${properties.length} / 案件 ${jobs.length} / 実施回 ${occurrences.length}（未割当 ${occurrences.filter((o) => !o.date).length}） / 配員 ${uniqAssignments.length}`);
  console.log(`  1日あたり平均 ${avg.toFixed(1)} 件（最小 ${Math.min(...counts)} / 最大 ${Math.max(...counts)}）`);
  console.log(`\n  ログイン: kondo@example.com（最高管理者） / jimu@example.com（事務）/ tehai-c@example.com（清掃手配）/ fujino@example.com（スタッフ）  パスワード: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
