"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { OccurrenceView } from "./types";

// ドラッグ＆ドロップの ID 規約
//   draggable: occ:<id>                 data = { occurrence, fromWorkerId? }
//   droppable: day:<YYYY-MM-DD>         日付列（週ビュー・月セル）
//              lane                     未割当レーン（日付を外す）
//              cell:<userId>:<date>     担当者ボードのセル
//              cell:unassigned:<date>   担当者ボードの「担当未定」行

export type DragData = { occurrence: OccurrenceView; fromWorkerId?: string | null };

export type DropTarget =
  | { kind: "day"; date: string }
  | { kind: "lane" }
  | { kind: "cell"; workerId: string | null; date: string };

export function dragId(occId: string): string {
  return `occ:${occId}`;
}
export function dayDropId(date: string): string {
  return `day:${date}`;
}
export function cellDropId(workerId: string | null, date: string): string {
  return `cell:${workerId ?? "unassigned"}:${date}`;
}
export const LANE_DROP_ID = "lane";

export function parseDropId(id: string | number | undefined): DropTarget | null {
  if (typeof id !== "string") return null;
  if (id === LANE_DROP_ID) return { kind: "lane" };
  if (id.startsWith("day:")) return { kind: "day", date: id.slice(4) };
  if (id.startsWith("cell:")) {
    const [, worker, date] = id.split(":");
    return { kind: "cell", workerId: worker === "unassigned" ? null : worker, date };
  }
  return null;
}

/** タッチ端末（pointer: coarse）か。true のときは D&D を無効にして「移動」シートを使う */
export function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

export function useScheduleSensors(enabled: boolean) {
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const keyboard = useSensor(KeyboardSensor);
  const active = useSensors(pointer, keyboard);
  const none = useSensors();
  return useMemo(() => (enabled ? active : none), [enabled, active, none]);
}
