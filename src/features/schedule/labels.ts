import type { OccurrenceView } from "./types";

// 予定の表示名まわり（サーバー・クライアントの両方から使う）

export function timeLabel(o: OccurrenceView): string | null {
  if (!o.startTime) return null;
  return o.endTime ? `${o.startTime}–${o.endTime}` : o.startTime;
}

/** 休みの予定か（カレンダーでは休む人の名前を出し、その日の先頭に並べる） */
export function isOffOccurrence(o: { category: string }): boolean {
  return o.category === "OFF";
}

/** 顧客名。顧客が無い予定（休み等）は null */
export function customerLabelOf(o: OccurrenceView): string | null {
  return o.customer?.name ?? o.customerNameRaw ?? null;
}

/** カレンダーに出す名前：1行目＝顧客名（無ければ件名）、2行目＝現場名。顧客がいて現場が無ければ「現場未設定」 */
export function occurrenceLabels(o: OccurrenceView): { primary: string; site: string | null; siteMissing: boolean; extra: string | null } {
  // 休み：休む人の名前を並べる（件名を入れていれば後ろに添える）
  if (isOffOccurrence(o)) {
    const names = o.assignees.map((a) => a.name).join("・");
    const note = o.title && o.title !== "予定" && o.title !== "休み" ? o.title : null;
    return { primary: names || note || "休み", site: null, siteMissing: false, extra: names ? note : null };
  }
  const customer = customerLabelOf(o);
  const site = o.property?.name ?? null;
  const known = [customer, o.customer?.name, site].filter(Boolean);
  // 手入力の件名（「〇〇様 立会い」など）は顧客名・現場名と別に出す
  const extra = customer && !known.includes(o.title) ? o.title : null;
  return { primary: customer ?? o.title, site, siteMissing: !site && !!customer, extra };
}
