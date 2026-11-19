"use client";

// Search and the month filter on the receipts list (pilot feedback
// 2026-11-19: "type in the expense and the receipt pops up"). Asks
// GET /api/receipts/search (src/lib/home/search.ts), which also reaches the
// receipts beyond the newest 50 the list holds. The text and period live in
// the address (?q=&month= or &year=), written with history.replaceState so
// typing never reloads the page. Off in the demo tour and the tests
// (`enabled`), which make no requests.

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Receipt } from "@/lib/types";

const DEBOUNCE_MS = 300;
const MONTH = /^\d{4}-\d{2}$/;
const YEAR = /^\d{4}$/;

type Results = { receipts: Receipt[]; hasMore: boolean };

export type ReceiptSearchState = {
  q: string;
  period: string;
  setQ: (q: string) => void;
  setPeriod: (period: string) => void;
  clear: () => void;
  /** Text or a period chosen: the list shows `results`. */
  active: boolean;
  /** Null while the first page is on its way. */
  results: Results | null;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
};

function listKey(r: Receipt): string {
  return `${r.purchased_at ?? ""}|${r.created_at}|${r.id}`;
}

function paramsFor(q: string, period: string): URLSearchParams {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (MONTH.test(period)) p.set("month", period);
  else if (YEAR.test(period)) p.set("year", period);
  return p;
}

/**
 * `refreshKey` changes when the list's own rows do (an edit, a delete, a
 * new receipt): the results are asked for again so they never go stale.
 */
export function useReceiptSearch(enabled: boolean, refreshKey: unknown): ReceiptSearchState {
  const [q, setQState] = useState("");
  const [period, setPeriodState] = useState("");
  // What was last asked for; the debounce moves `q` into it.
  const [query, setQuery] = useState({ q: "", period: "" });
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The address may already carry a search (a reload, a shared link).
  useEffect(() => {
    if (!enabled) return;
    const p = new URLSearchParams(window.location.search);
    const initialQ = (p.get("q") ?? "").slice(0, 100);
    const month = p.get("month") ?? "";
    const year = p.get("year") ?? "";
    const initialPeriod = MONTH.test(month) ? month : YEAR.test(year) ? year : "";
    if (!initialQ && !initialPeriod) return;
    // One-off after mount: the server render doesn't read the address.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQState(initialQ);
    setPeriodState(initialPeriod);
    setQuery({ q: initialQ, period: initialPeriod });
  }, [enabled]);

  // Typing settles before a request; a period applies at once.
  useEffect(() => {
    if (q === query.q) return;
    const timer = setTimeout(() => setQuery((cur) => ({ ...cur, q })), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, query.q]);

  const active = enabled && (query.q.trim() !== "" || query.period !== "");

  const fetchPage = useCallback(
    async (after: string | null) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      const params = paramsFor(query.q, query.period);
      if (after) params.set("after", after);
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/receipts/search?${params}`, { signal: abort.signal });
        if (!res.ok) throw new Error(String(res.status));
        const page = (await res.json()) as Results;
        setResults((prev) =>
          after && prev ? { receipts: [...prev.receipts, ...page.receipts], hasMore: page.hasMore } : page,
        );
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error("[receipt search] failed", err instanceof Error ? err.message : err);
        setError("Search isn't working right now. Try again in a moment.");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (!enabled) return;
    // Only our own parameters change; others (?mailbox=…) stay as they are.
    const url = new URLSearchParams(window.location.search);
    for (const key of ["q", "month", "year"]) url.delete(key);
    for (const [key, value] of paramsFor(query.q, query.period)) url.set(key, value);
    const next = url.size ? `?${url}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
    if (!active) {
      abortRef.current?.abort();
      // Back to the plain list.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    void fetchPage(null);
  }, [enabled, active, query, fetchPage, refreshKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const lastKey = results && results.receipts.length > 0 ? listKey(results.receipts[results.receipts.length - 1]) : null;
  const loadMore = useCallback(() => {
    if (lastKey && !loading) void fetchPage(lastKey);
  }, [fetchPage, lastKey, loading]);

  const setPeriod = useCallback((value: string) => {
    setPeriodState(value);
    setQuery((cur) => ({ ...cur, period: value }));
  }, []);
  const clear = useCallback(() => {
    setQState("");
    setPeriodState("");
    setQuery({ q: "", period: "" });
  }, []);

  return { q, period, setQ: setQState, setPeriod, clear, active, results, loading, error, loadMore };
}

export type PeriodOption = { key: string; label: string };

/**
 * The search field and the period menu above the list. `periods` are the
 * months that have receipts (newest first), with a year of their own when
 * the receipts span more than one year.
 */
export function ReceiptSearchBar({
  search,
  months,
}: {
  search: ReceiptSearchState;
  months: PeriodOption[];
}) {
  const years = [...new Set(months.map((m) => m.key.slice(0, 4)))];
  return (
    <div role="search" className="mb-3 flex gap-2">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search receipts</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-[var(--ink-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search.q}
          onChange={(e) => search.setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && search.q) {
              e.preventDefault();
              search.setQ("");
            }
          }}
          placeholder="Merchant or amount"
          maxLength={100}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          // 16px so iOS Safari doesn't zoom in on focus.
          className="h-11 w-full rounded-[10px] border border-[var(--hairline)] bg-card pr-3 pl-10 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
      </label>
      <label className="shrink-0">
        <span className="sr-only">Period</span>
        <select
          value={search.period}
          onChange={(e) => search.setPeriod(e.target.value)}
          className="h-11 max-w-[150px] rounded-[10px] border border-[var(--hairline)] bg-card px-3 text-[15px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <option value="">Any time</option>
          {years.length > 1
            ? years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            : null}
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** One line under the bar while searching: how many, still looking, or what went wrong. */
export function ReceiptSearchStatus({ search, shown }: { search: ReceiptSearchState; shown: number }) {
  let text: string;
  if (search.error) text = search.error;
  else if (search.results == null) text = "Searching…";
  else if (shown === 0) text = "No receipts match.";
  else text = `${shown}${search.results.hasMore ? "+" : ""} ${shown === 1 ? "receipt" : "receipts"}`;
  return (
    <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
      <p role="status" className="type-caption text-[var(--ink-muted)]">
        {text}
      </p>
      <button
        type="button"
        onClick={search.clear}
        className="h-11 shrink-0 rounded-[10px] px-1 text-[15px] font-semibold text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Clear
      </button>
    </div>
  );
}
