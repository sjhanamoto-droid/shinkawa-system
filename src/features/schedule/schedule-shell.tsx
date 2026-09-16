"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Loader2, Plus, CalendarDays } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { isPlanner, can, type Actor } from "@/lib/permissions";
import { NON_WORK_CATEGORIES, type Department } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useOccurrenceStore } from "./use-occurrence-store";
import { useIsCoarsePointer, useScheduleSensors, parseDropId, type DragData } from "./dnd";
import { scheduleHref, stepDate, rangeFor, shiftKey, fmtYm, fmtKeyLong, fmtKeyShort, weekStartOf, ymOf } from "./filters";
import { moveOccurrence, setOccurrenceStatus, assignWorkers, assignVehicles, deleteOccurrence } from "./actions";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import { DayView } from "./day-view";
import { StaffBoard } from "./staff-board";
import { OccurrenceCard } from "./occurrence-card";
import { OccurrenceDrawer } from "./occurrence-drawer";
import { OccurrenceForm } from "./occurrence-form";
import { MoveSheet } from "./move-sheet";
import { MoveConfirmDialog } from "./move-confirm-dialog";
import { FilterBar } from "./filter-bar";
import { QuickEntry } from "./quick-entry";
import { Legend } from "./legend";
import type { FilterState, MoveInput, OccurrenceView, PersonRef, ScheduleData, VehicleRef, ViewMode } from "./types";

const POLL_MS = 30_000;

function nextStatusClient(o: OccurrenceView, date: string | null, assigneeCount: number): string {
  if (o.status === "DONE" || o.status === "CANCELLED") return o.status;
  if (!date) return "UNASSIGNED";
  if (assigneeCount === 0 && !(NON_WORK_CATEGORIES as string[]).includes(o.category)) return "UNASSIGNED";
  if (o.status === "UNASSIGNED") return "TENTATIVE";
  return o.status;
}

export function ScheduleShell({ data }: { data: ScheduleData }) {
  const router = useRouter();
  const toast = useToast();
  const { filters, workers, vehicles, customers, properties, showAmount, today, me, defaultTimes } = data;
  const actor: Actor = { id: me.id, role: me.role, department: me.department };
  const canEdit = isPlanner(actor);
  const coarse = useIsCoarsePointer();
  const dnd = canEdit && !coarse;
  const sensors = useScheduleSensors(dnd);

  // ── ストア（表示範囲の実施回＋未割当レーン） ──
  const initial = useMemo(() => {
    const seen = new Set<string>();
    const out: OccurrenceView[] = [];
    for (const o of [...data.occurrences, ...data.unassigned]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
    return out;
  }, [data.occurrences, data.unassigned]);
  const store = useOccurrenceStore(initial);
  const personById = useMemo(() => new Map<string, PersonRef>(workers.map((w) => [w.id, w])), [workers]);
  const vehicleById = useMemo(() => new Map<string, VehicleRef>(vehicles.map((v) => [v.id, { id: v.id, name: v.name, color: v.color }])), [vehicles]);

  const range = rangeFor(filters);
  const byDay = useMemo(() => {
    const map = new Map<string, OccurrenceView[]>();
    for (const o of store.items) {
      if (!o.date) continue;
      const keys: string[] = [];
      if (o.endDate && o.endDate > o.date) {
        let k = o.date;
        while (k <= o.endDate) {
          if (k >= range.start && k < range.end) keys.push(k);
          k = shiftKey(k, 1);
        }
      } else keys.push(o.date);
      for (const k of keys) {
        const arr = map.get(k) ?? [];
        arr.push(o);
        map.set(k, arr);
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.startTime ?? "99:99";
        const tb = b.startTime ?? "99:99";
        if (ta !== tb) return ta < tb ? -1 : 1;
        return a.title.localeCompare(b.title, "ja");
      });
    }
    return map;
  }, [store.items, range.start, range.end]);
  const unassigned = useMemo(() => store.items.filter((o) => !o.date && o.status !== "DONE" && o.status !== "CANCELLED"), [store.items]);

  // ── ナビゲーション ──
  const [navPending, startNav] = useTransition();
  const navigate = useCallback(
    (patch: Partial<FilterState>) => {
      startNav(() => {
        router.push(scheduleHref(filters, patch, { defaultMine: me.role === "STAFF" }), { scroll: false });
      });
    },
    [router, filters, me.role],
  );

  // ── ポーリング（他の人の変更を取り込む） ──
  const draggingRef = useRef(false);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible" || draggingRef.current || store.pendingCount > 0) return;
      router.refresh();
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [router, store.pendingCount]);

  // ── UI 状態 ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (store.items.find((o) => o.id === selectedId) ?? null) : null;
  const [form, setForm] = useState<{ open: boolean; occurrence: OccurrenceView | null; date: string | null }>({ open: false, occurrence: null, date: null });
  const [moveFor, setMoveFor] = useState<OccurrenceView | null>(null);
  const [confirm, setConfirm] = useState<{ occurrence: OccurrenceView; move: MoveInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<OccurrenceView | null>(null);

  // ── 移動 ──
  const performMove = useCallback(
    async (o: OccurrenceView, move: MoveInput) => {
      const add = (move.workerAdd ?? []).map((id) => personById.get(id)).filter((p): p is PersonRef => !!p);
      const remove = new Set(move.workerRemove ?? []);
      const assignees = [...o.assignees.filter((a) => !remove.has(a.id)), ...add.filter((p) => !o.assignees.some((a) => a.id === p.id))];
      const endDate = move.date && o.endDate && o.date ? shiftKey(move.date, Math.max(0, Math.round((Date.parse(o.endDate) - Date.parse(o.date)) / 86_400_000))) : move.date ? o.endDate : null;
      store.apply(o.id, {
        date: move.date,
        endDate,
        targetMonth: move.date ? ymOf(move.date) : o.targetMonth,
        assignees,
        status: nextStatusClient(o, move.date, assignees.length),
      });
      setBusy(true);
      const r = await moveOccurrence(o.id, move, o.version);
      setBusy(false);
      if (r.ok) {
        store.commit(o.id, r.data.occurrence);
        const label = move.date ? fmtKeyShort(move.date) : "未割当";
        toast(`${o.title} を ${label} へ移動しました${r.data.movedIds.length ? `（以降 ${r.data.movedIds.length} 回も更新）` : ""}`);
        if (r.data.movedIds.length) router.refresh();
      } else {
        store.rollback(o.id);
        toast(r.error, { type: "error" });
        if (r.code === "CONFLICT" || r.code === "NOT_FOUND") router.refresh();
      }
    },
    [store, personById, toast, router],
  );

  // confirmAlways=true（ドラッグ＆ドロップ）は常に確認ダイアログを出す。
  // 移動シートからは本人が入力済みなので、定期の日付変更のときだけ「この回だけ／以降も」を確認する。
  const requestMove = useCallback(
    (o: OccurrenceView, move: MoveInput, opts: { confirmAlways?: boolean } = {}) => {
      const dateChanged = move.date !== o.date;
      const recurring = dateChanged && !!move.date && !!o.ruleKind && !!o.jobId;
      if (opts.confirmAlways || recurring) {
        setConfirm({ occurrence: o, move });
        return;
      }
      void performMove(o, { ...move, scope: "ONE" });
    },
    [performMove],
  );

  function onDragStart(e: DragStartEvent) {
    draggingRef.current = true;
    const d = e.active.data.current as DragData | undefined;
    setDragging(d?.occurrence ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    draggingRef.current = false;
    setDragging(null);
    const d = e.active.data.current as DragData | undefined;
    const target = parseDropId(e.over?.id);
    if (!d || !target) return;
    const o = d.occurrence;
    if (target.kind === "lane") {
      if (!o.date) return;
      requestMove(o, { date: null, scope: "ONE" }, { confirmAlways: true });
      return;
    }
    if (target.kind === "day") {
      if (o.date === target.date) return;
      requestMove(o, { date: target.date, scope: "ONE" }, { confirmAlways: true });
      return;
    }
    // 担当者ボードのセル
    const from = d.fromWorkerId ?? null;
    const to = target.workerId;
    const move: MoveInput = { date: target.date, scope: "ONE" };
    if (from !== to) {
      if (from) move.workerRemove = [from];
      if (to && !o.assignees.some((a) => a.id === to)) move.workerAdd = [to];
    }
    if (o.date === target.date && !move.workerAdd && !move.workerRemove) return;
    requestMove(o, move, { confirmAlways: true });
  }

  // ── 状態・担当・削除 ──
  async function onStatus(o: OccurrenceView, status: string, reason?: string) {
    store.apply(o.id, { status });
    setBusy(true);
    const r = await setOccurrenceStatus(o.id, status, o.version, reason);
    setBusy(false);
    if (r.ok) {
      store.commit(o.id, r.data.occurrence);
      toast(status === "DONE" ? "完了にしました" : status === "CONFIRMED" ? "確定しました" : status === "CANCELLED" ? "中止にしました" : "状態を更新しました");
    } else {
      store.rollback(o.id);
      toast(r.error, { type: "error" });
      if (r.code === "CONFLICT") router.refresh();
    }
  }

  async function onAssign(o: OccurrenceView, ids: string[]) {
    const assignees = ids.map((id) => personById.get(id)).filter((p): p is PersonRef => !!p);
    store.apply(o.id, { assignees, status: nextStatusClient(o, o.date, assignees.length) });
    setBusy(true);
    const r = await assignWorkers(o.id, ids, o.version);
    setBusy(false);
    if (r.ok) {
      store.commit(o.id, r.data.occurrence);
      toast("担当者を更新しました");
    } else {
      store.rollback(o.id);
      toast(r.error, { type: "error" });
      if (r.code === "CONFLICT") router.refresh();
    }
  }

  async function onAssignVehicles(o: OccurrenceView, ids: string[]) {
    // 無効化済みで選択肢に無い車両は、今付いているものから名前を引く
    const current = new Map(o.vehicles.map((v) => [v.id, v]));
    const next = ids.map((id) => vehicleById.get(id) ?? current.get(id)).filter((v): v is VehicleRef => !!v);
    store.apply(o.id, { vehicles: next });
    setBusy(true);
    const r = await assignVehicles(o.id, ids, o.version);
    setBusy(false);
    if (r.ok) {
      store.commit(o.id, r.data.occurrence);
      toast(next.length ? `使用車両を更新しました（${next.map((v) => v.name).join("・")}）` : "使用車両を外しました");
    } else {
      store.rollback(o.id);
      toast(r.error, { type: "error" });
      if (r.code === "CONFLICT") router.refresh();
    }
  }

  async function onDelete(o: OccurrenceView, scope: "ONE" | "FOLLOWING") {
    setBusy(true);
    const r = await deleteOccurrence(o.id, scope);
    setBusy(false);
    if (r.ok) {
      store.remove(r.data.deletedIds);
      setSelectedId(null);
      toast(`削除しました（${r.data.deletedIds.length}件）`);
      if (scope === "FOLLOWING") router.refresh();
    } else {
      toast(r.error, { type: "error" });
    }
  }

  // ── ヘッダ表示 ──
  const title =
    filters.view === "month"
      ? fmtYm(ymOf(filters.date))
      : filters.view === "day"
        ? fmtKeyLong(filters.date)
        : `${fmtKeyShort(weekStartOf(filters.date))} 〜 ${fmtKeyShort(shiftKey(weekStartOf(filters.date), 6))}`;

  const views: { key: ViewMode; label: string; className?: string }[] = [
    { key: "day", label: "日" },
    { key: "week", label: "週" },
    { key: "month", label: "月" },
    ...(canEdit ? [{ key: "board" as ViewMode, label: "担当者", className: "hidden md:flex" }] : []),
  ];
  const defaultDepartment: Department = filters.dept !== "ALL" ? filters.dept : me.department === "CONSTRUCTION" ? "CONSTRUCTION" : "CLEANING";

  const openAdd = (date: string | null) => setForm({ open: true, occurrence: null, date });
  const openEdit = (o: OccurrenceView) => {
    setForm({ open: true, occurrence: o, date: o.date });
  };
  const openDay = (date: string) => navigate({ view: "day", date });

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => { draggingRef.current = false; setDragging(null); }}>
      <div className="space-y-3">
        {/* ヘッダ：期間ナビ・ビュー切替・追加 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => navigate({ date: stepDate(filters, -1) })} aria-label="前へ" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-sunken">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => navigate({ date: today })} className="flex h-9 items-center gap-1 rounded-full border border-line-strong bg-surface px-3 text-xs font-bold text-ink-soft hover:bg-surface-subtle">
              <CalendarDays className="h-3.5 w-3.5" />
              今日
            </button>
            <button type="button" onClick={() => navigate({ date: stepDate(filters, 1) })} aria-label="次へ" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-sunken">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <h2 className="text-base font-bold text-ink md:text-lg">{title}</h2>
          {navPending && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-full bg-surface-sunken p-0.5">
              {views.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => navigate({ view: v.key })}
                  className={cn(
                    "h-8 items-center justify-center rounded-full px-3 text-xs font-bold transition-colors",
                    v.className ?? "flex",
                    filters.view === v.key ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink-soft",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {canEdit && (
              <Button type="button" size="sm" onClick={() => openAdd(filters.view === "month" ? today : filters.date)}>
                <Plus className="h-4 w-4" /> 予定
              </Button>
            )}
          </div>
        </div>

        {can(actor, "occurrence.create") && (
          <QuickEntry
            onCreated={(o, unresolved) => {
              if (unresolved) toast("顧客が見つからなかったので、件名に残しました。編集で顧客を選んでください", { type: "error" });
              // 表示範囲の外に入った予定は、その日の週へ移動して見せる（未割当はレーンに出る）
              const inRange = !o.date || (o.date >= range.start && o.date < range.end);
              if (!inRange && o.date) {
                navigate({ view: filters.view === "month" ? "month" : "week", date: o.date });
                return;
              }
              store.upsert(o);
              setSelectedId(o.id);
            }}
          />
        )}

        <FilterBar filters={filters} workers={workers} customers={customers} onChange={navigate} showMine />

        <div className={cn(navPending && "pointer-events-none opacity-60 transition-opacity")}>
          {filters.view === "month" && (
            <MonthView dateKey={filters.date} byDay={byDay} todayKey={today} coarse={coarse} canEdit={canEdit} dnd={dnd} onSelect={(o) => setSelectedId(o.id)} onAdd={openAdd} onOpenDay={openDay} />
          )}
          {filters.view === "week" && (
            <WeekView dateKey={filters.date} byDay={byDay} unassigned={unassigned} todayKey={today} canEdit={canEdit} dnd={dnd} onSelect={(o) => setSelectedId(o.id)} onAdd={openAdd} onOpenDay={openDay} />
          )}
          {filters.view === "day" && (
            <DayView dateKey={filters.date} items={byDay.get(filters.date) ?? []} unassigned={unassigned} canEdit={canEdit} mine={filters.mine} onSelect={(o) => setSelectedId(o.id)} onAdd={openAdd} />
          )}
          {filters.view === "board" && (
            <StaffBoard dateKey={filters.date} items={store.items} workers={workers} todayKey={today} dnd={dnd} dept={filters.dept} onSelect={(o) => setSelectedId(o.id)} />
          )}
        </div>

        <Legend />
        {coarse && canEdit && <p className="px-1 text-[11px] text-ink-faint">タッチ端末では予定を開いて「移動」から日付・担当を変更できます。</p>}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-56 rotate-1 shadow-float">
            <OccurrenceCard occurrence={dragging} variant="chip" />
          </div>
        )}
      </DragOverlay>

      {selected && (
        <OccurrenceDrawer
          occurrence={selected}
          workers={workers}
          vehicles={vehicles}
          me={actor}
          onClose={() => setSelectedId(null)}
          onEdit={openEdit}
          onMove={(o) => setMoveFor(o)}
          onStatus={onStatus}
          onAssign={onAssign}
          onAssignVehicles={onAssignVehicles}
          onDelete={onDelete}
          busy={busy}
        />
      )}

      <OccurrenceForm
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        occurrence={form.occurrence}
        initialDate={form.date}
        customers={customers}
        properties={properties}
        workers={workers}
        vehicles={vehicles}
        showAmount={showAmount}
        defaultDepartment={defaultDepartment}
        defaultTimes={defaultTimes}
        onSaved={(o) => {
          store.upsert(o);
          setSelectedId(o.id);
          toast(form.occurrence ? "保存しました" : "予定を追加しました");
        }}
      />

      <MoveSheet
        open={!!moveFor}
        occurrence={moveFor}
        workers={workers}
        today={today}
        onClose={() => setMoveFor(null)}
        pending={busy}
        onSubmit={(move) => {
          const o = moveFor;
          setMoveFor(null);
          if (o) requestMove(o, move);
        }}
      />

      <MoveConfirmDialog
        open={!!confirm}
        occurrence={confirm?.occurrence ?? null}
        move={confirm?.move ?? null}
        workers={workers}
        onClose={() => setConfirm(null)}
        pending={busy}
        onConfirm={(scope, reason) => {
          const r = confirm;
          setConfirm(null);
          if (r) void performMove(r.occurrence, { ...r.move, scope, reason: reason ?? r.move.reason });
        }}
      />
    </DndContext>
  );
}
