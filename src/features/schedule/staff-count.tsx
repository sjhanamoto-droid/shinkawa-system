"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fmtKeyShort } from "./filters";
import type { PersonRef } from "./types";

/** 日ごとの人数（表示用）。free＝空いている人、off＝休みの人 */
export type StaffInfo = { available: number; remaining: number; free: PersonRef[]; off: PersonRef[] };

function People({ list }: { list: PersonRef[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((p) => (
        <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-2.5 text-sm font-semibold text-ink">
          <Avatar name={p.name} color={p.avatarColor} image={p.avatarUrl} size="sm" className="!h-6 !w-6 !text-[10px]" />
          {p.name}
        </span>
      ))}
    </div>
  );
}

/** 「作業可能◯人 残り◯人」。残りをタップすると、空いている人（と休みの人）を出す */
export function StaffCount({ staff, dateKey, className }: { staff: StaffInfo; dateKey: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        className={cn("flex min-w-0 flex-wrap items-center gap-x-1 text-xs leading-tight tnum text-ink-muted", className)}
        title="作業可能＝社員・アルバイトのうち休みでない人／残り＝そのうちまだ現場に入っていない人"
      >
        <span className="whitespace-nowrap">作業可能{staff.available}人</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className={cn(
            "whitespace-nowrap rounded font-bold underline decoration-dotted underline-offset-2 hover:bg-surface-sunken",
            staff.remaining === 0 ? "text-red-600" : "text-brand-700",
          )}
        >
          残り{staff.remaining}人
        </button>
      </span>
      <Modal open={open} onClose={() => setOpen(false)} title={`${fmtKeyShort(dateKey)} 空いている人`}>
        <div className="space-y-4">
          <section className="space-y-2">
            <p className="text-sm font-bold text-ink">
              空いている人 <span className="tnum text-brand-700">{staff.free.length}人</span>
            </p>
            {staff.free.length > 0 ? <People list={staff.free} /> : <p className="text-sm text-ink-muted">全員どこかの現場に入っています</p>}
          </section>
          {staff.off.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-bold text-ink">
                休み <span className="tnum text-ink-muted">{staff.off.length}人</span>
              </p>
              <People list={staff.off} />
            </section>
          )}
          <p className="text-xs text-ink-faint">社員・アルバイトが対象です（協力会社・下請は含みません）。</p>
        </div>
      </Modal>
    </>
  );
}
