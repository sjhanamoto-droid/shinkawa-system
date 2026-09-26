"use client";

import { useEffect } from "react";
import { markAnnouncementRead } from "./actions";

/** 全体連絡を開いたら、自分宛ての通知を既読にする */
export function MarkAnnouncementRead({ id }: { id: string }) {
  useEffect(() => {
    void markAnnouncementRead(id);
  }, [id]);
  return null;
}
