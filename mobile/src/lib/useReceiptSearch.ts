// The receipts list's search and period filter, as on the website
// (src/app/app/(authed)/_receipt-search.tsx): the text settles for 300 ms
// before the server is asked (GET /api/mobile/receipts?q=&month=), a period
// applies at once, and "Show more" continues from the last receipt shown.
// The answers reach the receipts beyond the newest 50 the list holds.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MobileReceipt } from "@/lib/mobile/types";
import { searchReceipts } from "./api";

const DEBOUNCE_MS = 300;

export type ReceiptSearch = {
  q: string;
  period: string;
  setQ: (q: string) => void;
  setPeriod: (period: string) => void;
  clear: () => void;
  /** Text or a period chosen: the list shows `receipts`. */
  active: boolean;
  /** Null until the first page arrives. */
  receipts: MobileReceipt[] | null;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  loadMore: () => void;
};

/** `refreshKey` changes with the list's own rows: the results are asked for again. */
export function useReceiptSearch(refreshKey: unknown): ReceiptSearch {
  const [q, setQ] = useState("");
  const [period, setPeriodState] = useState("");
  const [query, setQuery] = useState({ q: "", period: "" });
  const [page, setPage] = useState<{ receipts: MobileReceipt[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only the newest request's answer is used.
  const run = useRef(0);

  useEffect(() => {
    if (q === query.q) return;
    const timer = setTimeout(() => setQuery((cur) => ({ ...cur, q })), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, query.q]);

  const active = query.q.trim() !== "" || query.period !== "";

  const fetchPage = useCallback(
    async (after: string | null) => {
      const mine = ++run.current;
      setLoading(true);
      setFailed(false);
      try {
        const next = await searchReceipts(query.q, query.period, after);
        if (mine !== run.current) return;
        setPage((prev) =>
          after && prev ? { receipts: [...prev.receipts, ...next.receipts], hasMore: next.hasMore } : next,
        );
      } catch {
        if (mine === run.current) setFailed(true);
      } finally {
        if (mine === run.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (!active) {
      run.current += 1;
      setPage(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    void fetchPage(null);
  }, [active, fetchPage, refreshKey]);

  const last = page?.receipts[page.receipts.length - 1];
  const loadMore = useCallback(() => {
    if (last?.listKey && !loading) void fetchPage(last.listKey);
  }, [fetchPage, last, loading]);

  const setPeriod = useCallback((value: string) => {
    setPeriodState(value);
    setQuery((cur) => ({ ...cur, period: value }));
  }, []);
  const clear = useCallback(() => {
    setQ("");
    setPeriodState("");
    setQuery({ q: "", period: "" });
  }, []);

  return {
    q,
    period,
    setQ,
    setPeriod,
    clear,
    active,
    receipts: page?.receipts ?? null,
    hasMore: page?.hasMore ?? false,
    loading,
    failed,
    loadMore,
  };
}
