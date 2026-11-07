"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// スタッフ画面の小さな部品。見た目はデザイン資料（01_spec, 02_source）の値に合わせる。

export type VisitState = "before" | "due" | "sent";

/** これから／日報まだ／提出済み */
export function StatePill({ state, onGreen = false, className }: { state: VisitState; onGreen?: boolean; className?: string }) {
  const style =
    state === "due"
      ? onGreen
        ? "bg-[#fde68a] text-[#713f12]"
        : "bg-[var(--w-warning-bg)] text-[var(--w-warning-text)]"
      : state === "sent"
        ? "bg-[var(--w-primary-soft)] text-[var(--w-primary-dark)]"
        : "bg-[var(--w-disabled-bg)] text-[var(--w-text-sub)]";
  const label = state === "due" ? "日報まだ" : state === "sent" ? "提出済み" : "これから";
  return <span className={cn("inline-flex h-7 shrink-0 items-center rounded-full px-3 text-[14px]", style, className)}>{label}</span>;
}

export function SentStamp({ className }: { className?: string }) {
  return (
    <span className={cn("w-stamp", className)} aria-label="提出済み">
      <span>提出</span>
      <span>済み</span>
    </span>
  );
}

const footerBtn = "flex h-16 items-center justify-center rounded-xl text-[16px]";

/** 画面の下のボタン（左に小さい 戻る・閉じる、右に 次へ・確定） */
export function FooterBar({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white px-4 pt-3 w-footer-safe">
      <div className={cn("grid gap-2", wide ? "grid-cols-[84px_1fr]" : "grid-cols-[76px_1fr]")}>{children}</div>
    </div>
  );
}

export function FooterSpacer() {
  return <div className="h-[calc(100px+env(safe-area-inset-bottom))]" aria-hidden />;
}

export function BackButton({ onClick, href, children = "戻る" }: { onClick?: () => void; href?: string; children?: React.ReactNode }) {
  const cls = cn(footerBtn, "border border-[var(--w-border)] bg-white text-[var(--w-text-sub)] active:bg-[var(--w-soft-bg)]");
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function PrimaryButton({
  onClick,
  href,
  disabled,
  children,
  type = "button",
  className,
}: {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  children: React.ReactNode;
  type?: "button" | "submit";
  className?: string;
}) {
  const cls = cn(
    footerBtn,
    "text-[20px] font-semibold",
    disabled ? "bg-[var(--w-disabled-bg)] text-[var(--w-text-muted)]" : "bg-[var(--w-primary)] text-white active:bg-[var(--w-primary-dark)]",
    className,
  );
  if (href && !disabled) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** 2回押して削除（1回目で「もう一度押すと削除します」、3秒で元に戻る） */
export function TwoTapDelete({ onDelete, label = "削除する", className }: { onDelete: () => void; label?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (armed) onDelete();
        else setArmed(true);
      }}
      className={cn("text-[var(--w-danger)]", className)}
    >
      {armed ? "もう一度押すと削除します" : label}
    </button>
  );
}

/** 全画面のシート（高速料金・領収書の修正など）。緑のヘッダー＋白い本文＋下のボタン */
export function FullSheet({ children, open }: { children: React.ReactNode; open: boolean }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-40 mx-auto max-w-[480px] overflow-y-auto overscroll-contain bg-white">{children}</div>;
}
