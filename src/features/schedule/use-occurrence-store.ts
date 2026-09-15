"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OccurrenceView } from "./types";

// 楽観更新ストア。
// - apply(id, patch): 先にローカルを書き換え、元の値を pending に控える
// - commit(id, row): サーバーの結果で確定
// - rollback(id): 失敗時に元へ戻す
// - props が更新された（router.refresh 等）ときは pending 中の id 以外を同期する

export function useOccurrenceStore(initial: OccurrenceView[]) {
  const [items, setItems] = useState<OccurrenceView[]>(initial);
  const pending = useRef(new Map<string, OccurrenceView>());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setItems((prev) => {
      if (pending.current.size === 0) return initial;
      const keep = new Map(prev.filter((o) => pending.current.has(o.id)).map((o) => [o.id, o]));
      const merged = initial.map((o) => keep.get(o.id) ?? o);
      for (const o of keep.values()) if (!initial.some((x) => x.id === o.id)) merged.push(o);
      return merged;
    });
  }, [initial]);

  const apply = useCallback((id: string, patch: Partial<OccurrenceView>) => {
    setItems((prev) => {
      const cur = prev.find((o) => o.id === id);
      if (!cur) return prev;
      if (!pending.current.has(id)) pending.current.set(id, cur);
      setPendingCount(pending.current.size);
      return prev.map((o) => (o.id === id ? { ...o, ...patch } : o));
    });
  }, []);

  const commit = useCallback((id: string, row: OccurrenceView | null) => {
    pending.current.delete(id);
    setPendingCount(pending.current.size);
    setItems((prev) => {
      if (!row) return prev.filter((o) => o.id !== id);
      return prev.some((o) => o.id === id) ? prev.map((o) => (o.id === id ? row : o)) : [...prev, row];
    });
  }, []);

  const rollback = useCallback((id: string) => {
    const orig = pending.current.get(id);
    pending.current.delete(id);
    setPendingCount(pending.current.size);
    if (!orig) return;
    setItems((prev) => prev.map((o) => (o.id === id ? orig : o)));
  }, []);

  const upsert = useCallback((row: OccurrenceView) => {
    setItems((prev) => (prev.some((o) => o.id === row.id) ? prev.map((o) => (o.id === row.id ? row : o)) : [...prev, row]));
  }, []);

  const remove = useCallback((ids: string[]) => {
    setItems((prev) => prev.filter((o) => !ids.includes(o.id)));
  }, []);

  const isPending = useCallback((id: string) => pending.current.has(id), []);

  return { items, apply, commit, rollback, upsert, remove, isPending, pendingCount };
}

export type OccurrenceStore = ReturnType<typeof useOccurrenceStore>;
