"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  frequentInterchanges,
  frequentRoutes,
  quoteToll,
  searchInterchanges,
  type FrequentRoute,
  type IcOption,
  type TollQuote,
} from "@/features/tolls/actions";
import { BackButton, FullSheet, PrimaryButton } from "../ui/parts";
import { TOLL_CARS, TOLL_CAR_LABEL, TOLL_CAR_NOTE, newKey, type TollCar, type TollEntry } from "./model";

// 高速料金を選ぶ：乗ったインター → 降りたインター → 片道/往復・車種・料金の種類（ETC・現金・深夜割引など）→ 確定。
// 一度調べた区間は保存してあり、API を使わずに出す。調べられないときは手入力と「ドラぷら」へのリンク。

type Stage = "from" | "to" | "car";

/** 高速料金を調べるサイト（NAVITIME が使えないとき・料金を確かめたいとき） */
export const DRIVEPLAZA_URL = "https://www.driveplaza.com/dp/SearchTop";

export function TollSheet({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (t: TollEntry) => void }) {
  const [stage, setStage] = useState<Stage>("from");
  const [from, setFrom] = useState<IcOption | null>(null);
  const [to, setTo] = useState<IcOption | null>(null);
  const [round, setRound] = useState(true);
  const [car, setCar] = useState<TollCar>("NORMAL");
  /** 選んだ料金の種類（quote.options の code）。"manual" は手入力 */
  const [choice, setChoice] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [quote, setQuote] = useState<TollQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [routes, setRoutes] = useState<FrequentRoute[] | null>(null);

  // 開くたびに最初から
  useEffect(() => {
    if (!open) return;
    setStage("from");
    setFrom(null);
    setTo(null);
    setRound(true);
    setCar("NORMAL");
    setChoice(null);
    setManual("");
    setQuote(null);
    frequentRoutes()
      .then(setRoutes)
      .catch(() => setRoutes([]));
  }, [open]);

  const loadQuote = (refresh = false) => {
    if (!from || !to) return;
    setQuoting(true);
    quoteToll({ from: from.name, to: to.name, fromIcId: from.id, toIcId: to.id, refresh })
      .then((q) => setQuote(q))
      .catch(() => setQuote({ options: [], source: "none", canRefresh: false }))
      .finally(() => setQuoting(false));
  };

  // 区間が決まったら料金を出す（保存済みなら API は使わない）
  useEffect(() => {
    if (!from || !to) return;
    setQuote(null);
    setChoice(null);
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const mult = round ? 2 : 1;
  // この車種で出せる料金の種類（同じ金額は1つにまとめる）
  const options = useMemo(() => {
    const out: { code: string; label: string; amount: number }[] = [];
    for (const o of quote?.options ?? []) {
      const one = o.fares[car];
      if (one === null || one === undefined) continue;
      const amount = one * mult;
      const same = out.find((x) => x.amount === amount);
      if (same) same.label = `${same.label}／${o.label}`;
      else out.push({ code: o.code, label: o.label, amount });
    }
    return out;
  }, [quote, car, mult]);

  // 料金の種類は、最初の1つ（ETC料金）を選んでおく。無ければ手入力
  useEffect(() => {
    if (!quote) return;
    if (choice === "manual") return;
    if (!options.some((o) => o.code === choice)) setChoice(options[0]?.code ?? "manual");
  }, [options, quote, choice]);

  const picked = options.find((o) => o.code === choice) ?? null;
  const manualN = Number(manual);
  const amount = choice === "manual" ? (Number.isInteger(manualN) && manualN > 0 ? manualN : null) : (picked?.amount ?? null);
  const ready = !!from && !!to && amount !== null && amount <= 1_000_000;
  const question = stage === "from" ? "どこから乗りましたか？" : stage === "to" ? "どこで降りましたか？" : "料金を選びます";

  return (
    <FullSheet open={open}>
      <header className="bg-[var(--w-primary)] px-5 pb-5 text-white w-safe-top">
        <p className="text-[15px] text-[var(--w-primary-soft)]">高速料金を選ぶ</p>
        <h2 className="mt-2 text-[28px] font-medium leading-[40px]">{question}</h2>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <IcTile label="乗った" value={from?.name} active={stage === "from"} onClick={() => setStage("from")} />
          <ArrowRight className="h-7 w-7" aria-hidden />
          <IcTile label="降りた" value={to?.name} active={stage === "to"} onClick={() => from && setStage("to")} />
        </div>
      </header>

      <div className="px-5 py-5">
        {stage !== "car" ? (
          <>
            {/* よく使う区間（タップで区間と料金まで出す。API は使わない） */}
            {stage === "from" && routes && routes.length > 0 && (
              <div className="mb-6">
                <p className="text-[16px] font-semibold">よく使う区間</p>
                <div className="mt-2 space-y-2">
                  {routes.map((r) => (
                    <button
                      key={`${r.from.name}→${r.to.name}`}
                      type="button"
                      onClick={() => {
                        setFrom(r.from);
                        setTo(r.to);
                        setStage("car");
                      }}
                      className="flex min-h-[56px] w-full items-center gap-2 rounded-xl border border-[var(--w-border)] bg-white px-4 text-left text-[18px] active:bg-[var(--w-soft-bg)]"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {r.from.name} → {r.to.name}
                      </span>
                      <span className="shrink-0 text-[13px] text-[var(--w-text-muted)]">{r.count}回</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <IcPicker
              key={stage}
              exclude={stage === "to" ? from?.name : undefined}
              onPick={(ic) => {
                if (stage === "from") {
                  setFrom(ic);
                  setStage(to ? "car" : "to");
                } else {
                  setTo(ic);
                  setStage("car");
                }
              }}
            />
          </>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 rounded-2xl bg-[var(--w-disabled-bg)] p-1.5" role="radiogroup" aria-label="片道・往復">
              {[false, true].map((r) => (
                <button
                  key={String(r)}
                  type="button"
                  role="radio"
                  aria-checked={round === r}
                  onClick={() => setRound(r)}
                  className={cn("h-[52px] rounded-xl text-[18px]", round === r ? "bg-white font-semibold text-[var(--w-primary)] shadow-sm" : "text-[var(--w-text-sub)]")}
                >
                  {r ? "往復" : "片道"}
                </button>
              ))}
            </div>

            <div>
              <p className="text-[16px] font-semibold">乗った車</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TOLL_CARS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCar(c)}
                    aria-pressed={car === c}
                    className={cn(
                      "min-h-[56px] rounded-xl border-2 px-3 text-left",
                      car === c ? "border-[var(--w-primary)] bg-[var(--w-primary-soft)]" : "border-[var(--w-border)] bg-white",
                    )}
                  >
                    <span className="block text-[17px] font-semibold">{TOLL_CAR_LABEL[c]}</span>
                    {TOLL_CAR_NOTE[c] && <span className="block text-[12px] text-[var(--w-text-muted)]">{TOLL_CAR_NOTE[c]}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[16px] font-semibold">料金をタップしてください{round ? "（往復）" : "（片道）"}</p>
              {quoting && (
                <p className="mt-2 flex items-center gap-2 text-[15px] text-[var(--w-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  料金を調べています...
                </p>
              )}
              {quote && (
                <p className="mt-1 text-[13px] text-[var(--w-text-muted)]">
                  {quote.source === "saved"
                    ? "保存してある料金です。深夜・休日などの割引は、走った時間に合うものを選んでください。"
                    : quote.source === "api"
                      ? "最新の料金を調べました。深夜・休日などの割引は、走った時間に合うものを選んでください。"
                      : quote.source === "last"
                        ? "前回この区間で入力された金額です。違っていたら手入力してください。"
                        : "料金を出せませんでした。下のリンクで調べて、金額を入力してください。"}
                </p>
              )}
              <div className="mt-2 space-y-2">
                {options.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => setChoice(o.code)}
                    aria-pressed={choice === o.code}
                    className={cn(
                      "flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-2 text-left",
                      choice === o.code ? "border-[var(--w-primary)] bg-[var(--w-primary-soft)]" : "border-[var(--w-border)] bg-white",
                    )}
                  >
                    <span className="min-w-0 text-[16px] leading-6">{o.label}</span>
                    <span className="shrink-0 text-[24px] text-[var(--w-primary)]">¥{o.amount.toLocaleString("ja-JP")}</span>
                  </button>
                ))}
                <div className={cn("rounded-[14px] border-2 px-4 py-3", choice === "manual" ? "border-[var(--w-primary)] bg-[var(--w-primary-soft)]" : "border-[var(--w-border)]")}>
                  <button type="button" onClick={() => setChoice("manual")} className="w-full text-left text-[16px]">
                    金額を手入力する
                  </button>
                  {choice === "manual" && (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      placeholder={round ? "往復の金額" : "片道の金額"}
                      className={cn("mt-2 h-14 w-full rounded-xl border px-4 text-[22px] outline-none", manual ? "border-[#94a3b8] bg-white" : "border-[var(--w-check-border)] bg-[var(--w-check-bg)]")}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-3">
              {quote?.canRefresh && (
                <button type="button" onClick={() => loadQuote(true)} disabled={quoting} className="flex h-11 items-center gap-2 text-[15px] font-semibold text-[var(--w-primary-dark)]">
                  <RefreshCw className="h-4 w-4" />
                  最新の料金を調べ直す
                </button>
              )}
              <a href={DRIVEPLAZA_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[var(--w-primary-dark)]">
                <ExternalLink className="h-4 w-4 shrink-0" />
                料金が出ないとき・確かめたいときは「ドラぷら」で調べる
              </a>
            </div>
          </div>
        )}
      </div>

      <div className="h-[calc(100px+env(safe-area-inset-bottom))]" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] border-t border-[var(--w-divider)] bg-white px-4 pt-3 w-footer-safe">
        <div className="grid grid-cols-[84px_1fr] gap-2">
          <BackButton onClick={onClose}>閉じる</BackButton>
          <PrimaryButton
            disabled={!ready}
            onClick={() => {
              if (!ready || !from || !to || amount === null) return;
              onConfirm({
                key: newKey("t"),
                from: from.name,
                to: to.name,
                fromIcId: from.id,
                toIcId: to.id,
                car,
                round,
                amount,
                fareLabel: choice === "manual" ? null : (picked?.label.split("／")[0] ?? null),
              });
            }}
            className="text-[19px]"
          >
            {ready ? `確定 ¥${amount!.toLocaleString("ja-JP")}` : "確定"}
          </PrimaryButton>
        </div>
      </div>
    </FullSheet>
  );
}

function IcTile({ label, value, active, onClick }: { label: string; value: string | undefined; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("min-h-[64px] rounded-[14px] px-3 py-2 text-left", active ? "border-2 border-white bg-white/15" : "border-2 border-transparent bg-white/20")}
    >
      <span className="block text-[13px] text-[var(--w-primary-soft)]">{label}</span>
      <span className="block truncate text-[20px] font-semibold">{value ?? "未選択"}</span>
    </button>
  );
}

function IcPicker({ onPick, exclude }: { onPick: (ic: IcOption) => void; exclude?: string }) {
  const [q, setQ] = useState("");
  const [frequent, setFrequent] = useState<IcOption[] | null>(null);
  const [results, setResults] = useState<IcOption[] | null>(null);
  const [canRemote, setCanRemote] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    frequentInterchanges()
      .then((r) => setFrequent(r.items))
      .catch(() => setFrequent([]));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const word = q.trim();
    if (!word) {
      setResults(null);
      setCanRemote(false);
      return;
    }
    // 打ち終わるまで少し待ってから探す（NAVITIME の回数を節約）
    timer.current = setTimeout(() => {
      setSearching(true);
      searchInterchanges(word)
        .then((r) => {
          setResults(r.items);
          setCanRemote(r.canSearchRemote);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const list = useMemo(() => (results ?? frequent ?? []).filter((ic) => ic.name !== exclude), [results, frequent, exclude]);
  const word = q.trim();

  return (
    <div className="space-y-4">
      <label className="flex h-14 items-center gap-3 rounded-xl border border-[#94a3b8] px-4">
        <Search className="h-6 w-6 shrink-0 text-[var(--w-text-muted)]" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="全国のインターを検索"
          className="h-full min-w-0 flex-1 bg-transparent text-[18px] outline-none placeholder:text-[var(--w-text-muted)]"
          enterKeyHint="search"
        />
        {searching && <Loader2 className="h-5 w-5 animate-spin text-[var(--w-text-muted)]" />}
      </label>
      <p className="text-[16px] font-semibold">{word ? "検索結果" : "よく使うインター"}</p>
      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {list.map((ic) => (
            <button
              key={`${ic.id ?? ""}|${ic.name}`}
              type="button"
              onClick={() => onPick(ic)}
              className="min-h-[60px] rounded-xl border border-[var(--w-border)] bg-white px-2 py-2 text-[18px] active:bg-[var(--w-soft-bg)]"
            >
              <span className="block">{ic.name}</span>
              {ic.roadName && <span className="block text-[12px] text-[var(--w-text-muted)]">{ic.roadName}</span>}
            </button>
          ))}
        </div>
      )}
      {word && results && results.length === 0 && !searching && <p className="text-[15px] text-[var(--w-text-muted)]">見つかりませんでした</p>}
      {word && canRemote && !searching && (
        <button
          type="button"
          onClick={() => {
            setSearching(true);
            searchInterchanges(word, { remote: true })
              .then((r) => {
                setResults(r.items);
                setCanRemote(false);
              })
              .finally(() => setSearching(false));
          }}
          className="h-12 w-full rounded-xl border border-[var(--w-border)] text-[16px] text-[var(--w-primary-dark)]"
        >
          見つからないときは全国から探す
        </button>
      )}
      {!word && frequent && frequent.length === 0 && <p className="text-[15px] text-[var(--w-text-muted)]">インター名を入れて探してください</p>}
      {word && (
        <button type="button" onClick={() => onPick({ id: null, name: word, roadName: null })} className="h-14 w-full rounded-xl border border-dashed border-[var(--w-border)] text-[16px] text-[var(--w-text-sub)]">
          「{word}」で入力する
        </button>
      )}
    </div>
  );
}
