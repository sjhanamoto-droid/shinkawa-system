"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ExternalLink, FileText, History, Loader2, Upload } from "lucide-react";
import { photoSrc } from "@/lib/photos";
import { jstDateTimeLabel } from "@/lib/date";
import { prepareSiteFile } from "@/lib/prepare-site-file";
import { reviseDrawing } from "@/features/worker/site-actions";
import type { DrawingItem, DrawingVersion } from "./drawings";

// 現場の図面の一覧（管理画面・スタッフ画面で共通）。
// 一覧はサムネイルだけ。PDF の本体は「開く」を押したときだけ取りに行く。
// 「改訂版を上げる」で新しい版にでき、前の版は「過去の版」として残る。

function Thumb({ v, size }: { v: DrawingVersion; size: "lg" | "sm" }) {
  const cls = size === "lg" ? "h-24 w-[4.5rem]" : "h-14 w-10";
  if (v.hasThumb || !v.isPdf) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoSrc(v.id, true)} alt="" loading="lazy" className={`${cls} shrink-0 rounded-md border border-line bg-white object-cover`} />;
  }
  return (
    <span className={`${cls} flex shrink-0 items-center justify-center rounded-md border border-line bg-surface-subtle`}>
      <FileText className="h-6 w-6 text-red-500" aria-hidden />
    </span>
  );
}

function label(v: DrawingVersion): string {
  return `第${v.revision}版・${jstDateTimeLabel(v.createdAt)}${v.createdByName ? `・${v.createdByName}` : ""}`;
}

export function DrawingList({ items, canRevise, blobEnabled }: { items: DrawingItem[]; canRevise: boolean; blobEnabled: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((d, i) => (
        <DrawingRow key={d.id} d={d} index={i} canRevise={canRevise} blobEnabled={blobEnabled} />
      ))}
    </ul>
  );
}

function DrawingRow({ d, index, canRevise, blobEnabled }: { d: DrawingItem; index: number; canRevise: boolean; blobEnabled: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = d.caption || `図面 ${index + 1}`;

  async function onPick(files: FileList | null) {
    const file = files?.[0];
    if (ref.current) ref.current.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const photo = await prepareSiteFile(file, { kind: "DRAWING", blobEnabled, allowPdf: true });
      const r = await reviseDrawing(d.id, JSON.stringify([photo]));
      if (r.error) setError(r.error);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <a href={d.openHref} target="_blank" rel="noreferrer" aria-label={`${name}を開く`}>
          <Thumb v={d} size="lg" />
        </a>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[15px] font-bold text-ink">{name}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{label(d)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={d.openHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-brand-700 active:bg-surface-sunken"
            >
              <ExternalLink className="h-4 w-4" />
              開く
            </a>
            {canRevise && (
              <>
                <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void onPick(e.target.files)} />
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  disabled={busy}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink-soft active:bg-surface-sunken disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {busy ? "保存しています..." : "改訂版を上げる"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-status-danger">{error}</p>}
      {d.history.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-9 items-center gap-1.5 text-sm font-semibold text-ink-soft">
            <History className="h-4 w-4" />
            過去の版（{d.history.length}）
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {open && (
            <ul className="mt-1 space-y-1.5">
              {d.history.map((h) => (
                <li key={h.id}>
                  <a href={h.openHref} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-1 py-1 active:bg-surface-sunken">
                    <Thumb v={h} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{h.caption || name}</span>
                      <span className="block text-xs text-ink-muted">{label(h)}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
