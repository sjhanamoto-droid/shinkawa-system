"use client";

import { useTransition, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { addRelatedProperty, removePropertyRelation } from "./actions";
import { CardLink } from "@/components/ui/card";
import { Select, Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type RelatedRow = {
  relationId: string;
  note: string | null;
  other: { id: string; name: string; address: string | null };
};
export type RelationCandidate = { id: string; name: string; address: string | null };

export function RelationControl({ propertyId, related, candidates, canEdit }: { propertyId: string; related: RelatedRow[]; candidates: RelationCandidate[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const toast = useToast();

  function add() {
    if (!selected) return;
    const otherId = selected;
    const n = note;
    start(async () => {
      const r = await addRelatedProperty(propertyId, otherId, n || undefined);
      if (r.error) toast(r.error, { type: "error" });
      setSelected("");
      setNote("");
    });
  }

  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      {related.length > 0 && (
        <div className="space-y-2">
          {related.map((r) => (
            <div key={r.relationId} className="flex items-center gap-2">
              <CardLink href={`/properties/${r.other.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.other.name}</p>
                  {r.other.address && <p className="truncate text-xs text-ink-muted">{r.other.address}</p>}
                  {r.note && <p className="truncate text-xs text-ink-faint">{r.note}</p>}
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </CardLink>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => start(async () => void (await removePropertyRelation(r.relationId, propertyId)))}
                  disabled={pending}
                  aria-label="関連を解除"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && candidates.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-3">
          <p className="text-xs font-semibold text-ink-muted">関連物件を追加（同じ建物の別部屋・系列店舗など）</p>
          <Select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="関連物件を選択">
            <option value="">物件を選択…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.address ? `（${c.address}）` : ""}
              </option>
            ))}
          </Select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" />
          <button type="button" onClick={add} disabled={pending || !selected} className={buttonClass({ size: "md", className: "w-full" })}>
            <Plus className="h-4 w-4" />
            関連物件を追加
          </button>
        </div>
      )}
      {related.length === 0 && (!canEdit || candidates.length === 0) && <p className="text-sm text-ink-muted">関連物件はありません</p>}
    </div>
  );
}
