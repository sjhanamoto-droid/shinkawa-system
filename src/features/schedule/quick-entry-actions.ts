"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCan, PermissionError } from "@/lib/permissions";
import { getAnthropic, anthropicModel } from "@/lib/anthropic";
import { dateFromKey, jstDateKey } from "@/lib/date";
import { CATEGORY, CATEGORY_OPTIONS, isCategory, type CategoryKey } from "@/lib/constants";
import { fetchOccurrenceView } from "./query";
import { ymOf } from "./filters";
import type { ActionResult, OccurrenceView } from "./types";

// 電話の速報メモ「9/24 直井さん 1人」→ 仮予定。
// Claude API が設定されていれば構造化抽出、無ければ正規表現で同じ形にする。

const quickSchema = z.object({
  date: z.string().nullable().describe("実施日 YYYY-MM-DD。年が無ければ今日以降で最も近い日付。無ければ null"),
  customerName: z.string().nullable().describe("元請・顧客名（「さん」「様」「株式会社」等の敬称・法人格は除く）"),
  propertyName: z.string().nullable().describe("物件名・現場名・部屋番号など"),
  headcount: z.number().int().nullable().describe("人数"),
  startTime: z.string().nullable().describe("開始時刻 HH:mm"),
  category: z.enum(CATEGORY_OPTIONS).nullable().describe("種別"),
  note: z.string().nullable().describe("その他のメモ（原文の残り）"),
});
export type QuickParsed = z.infer<typeof quickSchema>;

const HONORIFIC_RE = /(さん|様|さま|殿|御中|株式会社|\(株\)|（株）|有限会社|\(有\)|（有）)/g;

function normalizeName(s: string): string {
  return s.replace(HONORIFIC_RE, "").replace(/\s+/g, "").trim();
}

/** 正規表現フォールバック */
function parseByRegex(text: string, today: string): QuickParsed {
  let rest = text.trim();
  let date: string | null = null;
  const dm = rest.match(/(?:(\d{4})[\/年])?(\d{1,2})[\/月](\d{1,2})日?/);
  if (dm) {
    const y = dm[1] ? Number(dm[1]) : Number(today.slice(0, 4));
    const m = Number(dm[2]);
    const d = Number(dm[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      // 年が無く過去日なら翌年
      if (!dm[1] && key < today) key = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      date = key;
    }
    rest = rest.replace(dm[0], " ");
  } else if (/明日/.test(rest)) {
    const t = dateFromKey(today);
    t.setDate(t.getDate() + 1);
    date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    rest = rest.replace(/明日/, " ");
  } else if (/今日/.test(rest)) {
    date = today;
    rest = rest.replace(/今日/, " ");
  }
  let headcount: number | null = null;
  const hm = rest.match(/(\d+)\s*(人|名)/);
  if (hm) {
    headcount = Number(hm[1]);
    rest = rest.replace(hm[0], " ");
  }
  let startTime: string | null = null;
  const tm = rest.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    startTime = `${tm[1].padStart(2, "0")}:${tm[2]}`;
    rest = rest.replace(tm[0], " ");
  }
  let category: CategoryKey | null = null;
  for (const key of CATEGORY_OPTIONS) {
    const label = CATEGORY[key].label;
    if (rest.includes(label)) {
      category = key;
      rest = rest.replace(label, " ");
      break;
    }
  }
  const tokens = rest.split(/[\s,、。]+/).filter(Boolean);
  const customerName = tokens[0] ? normalizeName(tokens[0]) : null;
  const note = tokens.slice(1).join(" ") || null;
  return { date, customerName: customerName || null, propertyName: null, headcount, startTime, category, note };
}

async function parseByClaude(text: string, today: string): Promise<QuickParsed | null> {
  const client = getAnthropic();
  if (!client) return null;
  try {
    const res = await client.messages.parse({
      model: anthropicModel(),
      max_tokens: 512,
      system: [
        "あなたは清掃・工事会社の事務員です。社長が電話の後にLINEへ流す速報メモ（例:「9月24日 直井さん 1人」）から予定の情報を抽出します。",
        `今日は ${today}（JST）です。年が書かれていない日付は今日以降で最も近い日付にしてください。`,
        "書かれていない情報は創作せず null にしてください。顧客名から敬称・法人格は除いてください。",
      ].join("\n"),
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(quickSchema) },
    });
    return res.parsed_output ?? null;
  } catch (e) {
    console.error("[quick-entry] Claude の抽出に失敗。正規表現にフォールバックします", e);
    return null;
  }
}

export async function quickEntry(text: string): Promise<
  ActionResult<{ occurrence: OccurrenceView; parsed: QuickParsed; unresolvedCustomer: boolean; usedAi: boolean }>
> {
  const me = await requireUser();
  const input = (text ?? "").trim().slice(0, 300);
  if (!input) return { ok: false, error: "内容を入力してください", code: "VALIDATION" };

  const today = jstDateKey();
  let parsed = await parseByClaude(input, today);
  const usedAi = parsed !== null;
  if (!parsed) parsed = parseByRegex(input, today);

  // 顧客の解決（完全一致 → 部分一致）
  let customer: { id: string; name: string } | null = null;
  const name = parsed.customerName ? normalizeName(parsed.customerName) : "";
  if (name) {
    customer =
      (await db.customer.findFirst({
        where: { OR: [{ shortName: name }, { name }, { kana: name }] },
        select: { id: true, name: true },
      })) ??
      (await db.customer.findFirst({
        where: { OR: [{ shortName: { contains: name } }, { name: { contains: name } }, { kana: { contains: name } }] },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }));
  }
  // 物件（顧客配下で1件だけなら自動、名前があれば部分一致）
  let propertyId: string | null = null;
  if (customer) {
    const props = await db.property.findMany({
      where: { customerId: customer.id, status: "ACTIVE" },
      select: { id: true, name: true },
      take: 20,
    });
    if (parsed.propertyName) {
      const pn = parsed.propertyName.replace(/\s+/g, "");
      propertyId = props.find((p) => p.name.replace(/\s+/g, "").includes(pn))?.id ?? null;
    }
    if (!propertyId && props.length === 1) propertyId = props[0].id;
  }

  const category: CategoryKey = parsed.category && isCategory(parsed.category) ? parsed.category : "REGULAR_CLEANING";
  const catDept = CATEGORY[category].department;
  const department = catDept ?? (me.department === "CONSTRUCTION" ? "CONSTRUCTION" : "CLEANING");
  try {
    assertCan(me, "occurrence.create", { department });
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message, code: "FORBIDDEN" };
    throw e;
  }

  const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const startTime = parsed.startTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.startTime) ? parsed.startTime : null;

  const created = await db.occurrence.create({
    data: {
      department,
      category,
      customerId: customer?.id ?? null,
      propertyId,
      customerNameRaw: customer ? null : parsed.customerName || null,
      title: customer ? null : parsed.customerName || (parsed.note ? parsed.note.slice(0, 40) : "速報"),
      targetMonth: ymOf(date ?? today),
      date: date ? dateFromKey(date) : null,
      startTime,
      headcount: parsed.headcount,
      note: [parsed.note, `速報メモ: ${input}`].filter(Boolean).join("\n"),
      status: date ? "TENTATIVE" : "UNASSIGNED",
      source: "QUICK",
      createdById: me.id,
      changeLogs: { create: { actorId: me.id, action: "CREATE", toValue: date ?? "日付未定", reason: "クイック登録" } },
    },
    select: { id: true },
  });

  const view = await fetchOccurrenceView(created.id, me);
  if (!view) return { ok: false, error: "登録に失敗しました" };
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true, data: { occurrence: view, parsed, unresolvedCustomer: !customer, usedAi } };
}
