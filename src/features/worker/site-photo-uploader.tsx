"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileUp, Loader2 } from "lucide-react";
import { photoSrc } from "@/lib/photos";
import { prepareSiteFile } from "@/lib/prepare-site-file";
import { addSitePhotos, deleteSitePhoto, type SitePhotoKind } from "./site-actions";
import { TwoTapDelete } from "./ui/parts";

// 現場の詳細（スタッフ画面）から写真・図面を追加する。
// 写真は圧縮して保存、図面は画像か PDF（原本は非公開の Blob。一覧はサムネイル）。1件ずつ送る。

export function SitePhotoUploader({ propertyId, kind, blobEnabled }: { propertyId: string; kind: SitePhotoKind; blobEnabled: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const drawing = kind === "DRAWING";

  async function onPick(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (ref.current) ref.current.value = "";
    if (list.length === 0) return;
    setMessage(null);
    let ok = 0;
    const errors: string[] = [];
    for (const [i, file] of list.entries()) {
      setBusy(`${i + 1} / ${list.length} を保存しています...`);
      try {
        const photo = await prepareSiteFile(file, { kind, blobEnabled, allowPdf: drawing });
        const r = await addSitePhotos(propertyId, kind, JSON.stringify([photo]));
        if (r.error) errors.push(r.error);
        else ok += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "保存できませんでした");
      }
    }
    setBusy(null);
    setMessage(errors.length ? { ok: false, text: `${ok}件追加しました。${errors[0]}` } : { ok: true, text: `${ok}件追加しました` });
    if (ok > 0) router.refresh();
  }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        multiple
        accept={drawing ? "image/*,application/pdf" : "image/*"}
        className="hidden"
        onChange={(e) => void onPick(e.target.files)}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={!!busy}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--w-primary)] bg-[var(--w-primary-soft)] text-[17px] font-semibold text-[var(--w-primary-dark)] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : drawing ? <FileUp className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
        {busy ?? (drawing ? "図面を追加（写真・PDF）" : "写真を追加")}
      </button>
      {message && <p className={`mt-2 text-[15px] ${message.ok ? "text-[var(--w-primary-dark)]" : "text-[var(--w-danger)]"}`}>{message.text}</p>}
    </div>
  );
}

/** 自分が追加した写真・図面（消せる） */
export function MySitePhotos({ photos }: { photos: { id: string; isPdf: boolean; caption: string | null }[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  if (photos.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[14px] text-[var(--w-text-muted)]">自分が追加したもの（間違えたときは消せます）</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-lg border border-[var(--w-divider)]">
            <div className="flex h-20 items-center justify-center bg-[var(--w-disabled-bg)]">
              {p.isPdf ? (
                <span className="px-1 text-center text-[12px] text-[var(--w-text-sub)]">{p.caption || "PDF"}</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoSrc(p.id, true)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <TwoTapDelete
              label="消す"
              onDelete={async () => {
                const r = await deleteSitePhoto(p.id);
                if (r.error) setError(r.error);
                else router.refresh();
              }}
              className="h-10 w-full text-[13px] font-semibold"
            />
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-[14px] text-[var(--w-danger)]">{error}</p>}
    </div>
  );
}
