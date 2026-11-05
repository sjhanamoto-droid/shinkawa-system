"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/form";

/** 現場詳細からの日報の後追加：作業日と作業者を選ぶ（選ぶたびに URL を置き換えて、その日の予定を出し直す） */
export function LateReportPicker({
  date,
  maxDate,
  userId,
  workers,
}: {
  date: string;
  maxDate: string;
  userId: string;
  /** 管理者のときだけ。スタッフは自分で固定 */
  workers: { id: string; name: string }[] | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(next: { date?: string; userId?: string }) {
    const d = next.date ?? date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > maxDate) return;
    const p = new URLSearchParams({ date: d, userId: next.userId ?? userId });
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  }

  return (
    <div className="space-y-3">
      <Field label="作業日" htmlFor="late-date" required description="今日までの日付を選べます">
        <Input id="late-date" type="date" value={date} max={maxDate} onChange={(e) => go({ date: e.target.value })} className="h-12 text-base font-bold tnum" />
      </Field>
      {workers && (
        <Field label="作業者" htmlFor="late-user" required description="ほかの人の分は代理入力になります">
          <Select id="late-user" value={userId} onChange={(e) => go({ userId: e.target.value })} className="h-12">
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {pending && (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込んでいます...
        </p>
      )}
    </div>
  );
}
