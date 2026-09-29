// GET /attendance/export?ym=YYYY-MM — 稼働時間の月次CSV（給与計算用）。最高管理者・事務だけ。
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jstMonthKey } from "@/lib/date";
import { minutesToHours, parseMonthKey } from "@/lib/attendance";
import { WORKER_KIND_LABEL, type WorkerKind } from "@/lib/constants";
import { monthlyAttendance } from "@/features/attendance/queries";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "attendance.view")) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  const ym = parseMonthKey(req.nextUrl.searchParams.get("ym") ?? undefined, jstMonthKey());
  const { rows } = await monthlyAttendance(ym);
  const lines = [
    ["氏名", "区分", "稼働日数", "稼働時間（時間）", "稼働時間（分）"],
    ...rows.map((r) => [r.name, WORKER_KIND_LABEL[r.kind as WorkerKind] ?? r.kind, r.days, minutesToHours(r.minutes), r.minutes]),
  ];
  // Excel で文字化けしないよう BOM を付ける
  const body = "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${ym}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
