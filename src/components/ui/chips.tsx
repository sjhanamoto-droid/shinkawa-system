import Link from "next/link";
import { cn } from "@/lib/utils";

// 横スクロールするフィルタチップ群（リンク方式・サーバーサイドフィルタ）。マウス操作は chip-bar.tsx
export { ChipBar } from "./chip-bar";

export function ChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-line-strong bg-surface text-ink-soft hover:bg-surface-subtle",
      )}
    >
      {children}
    </Link>
  );
}
