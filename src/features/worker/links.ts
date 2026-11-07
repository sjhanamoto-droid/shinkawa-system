// スタッフ画面の行き先

/** 日報を書く画面へ（予定×作業日。書きかけ・提出済みならその日報） */
export function reportHref(v: { occurrenceId: string; dateKey: string; reportId: string | null }) {
  return v.reportId ? `/w/report?reportId=${v.reportId}` : `/w/report?occurrenceId=${v.occurrenceId}&date=${v.dateKey}`;
}

/** 現場の情報へ（現場タブと同じ現場の詳細。予定から開いたことを付けて、下に「日報を書く」を出す）。現場の無い予定は予定の情報へ */
export function visitHref(v: { occurrenceId: string; dateKey: string; propertyId?: string | null }) {
  if (v.propertyId) return `/w/sites/${v.propertyId}?visit=${v.occurrenceId}&date=${v.dateKey}`;
  return `/w/visits/${v.occurrenceId}?date=${v.dateKey}`;
}
