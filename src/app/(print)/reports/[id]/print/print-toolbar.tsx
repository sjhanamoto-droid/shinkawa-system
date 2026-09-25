"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2 print:hidden">
      <Link href={backHref} className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-soft hover:bg-surface-sunken">
        <ArrowLeft className="h-4 w-4" />
        戻る
      </Link>
      <p className="flex-1 text-xs text-ink-muted">「印刷」からプリンター、または「PDFに保存」を選べます</p>
      <button type="button" onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white">
        <Printer className="h-4 w-4" />
        印刷
      </button>
    </div>
  );
}
