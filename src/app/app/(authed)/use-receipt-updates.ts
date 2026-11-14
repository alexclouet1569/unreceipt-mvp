"use client";

// New receipts appear by themselves on /app. While the tab is visible the
// page asks GET /api/receipts/updates every POLL_MS ("anything new?", a
// few indexed counts) and right away when the tab comes back; the list
// reloads (router.refresh) only when the answer's version changed. The
// email receipts that arrived since the user last looked feed the "N new
// receipts from your email" notice (src/lib/receipts/new-receipts.ts), with
// their rows so the notice can open one even when it sits beyond the
// list's newest 50.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  dismissAll,
  EMPTY_SEEN,
  markOpened,
  parseSeen,
  startSeen,
  unseen,
  type Fresh,
  type SeenState,
} from "@/lib/receipts/new-receipts";
import type { Receipt } from "@/lib/types";

export const POLL_MS = 20_000;
// After a refusal (rate limit, server error) skip this many polls.
const BACKOFF_POLLS = 3;

type Answer = {
  version: string;
  latestCreatedAt: string | null;
  fresh: Fresh[];
  receipts?: Receipt[];
};

const storageKey = (userId: string) => `unreceipt:new-receipts:${userId}`;

function readSeen(userId: string, memory: SeenState): SeenState {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw == null ? memory : parseSeen(raw);
  } catch {
    return memory;
  }
}

function writeSeen(userId: string, seen: SeenState): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(seen));
  } catch {
    // Private window or storage blocked: the notice works for this visit.
  }
}

export type NewReceipts = {
  /** Unseen email receipts, newest first, with their rows when the server sent them. */
  items: { id: string; createdAt: string; receipt: Receipt | null }[];
  open: (id: string) => void;
  dismiss: () => void;
};

/** Off (no requests at all) without a user id: tests and the demo tour. */
export function useReceiptUpdates(userId: string | null): NewReceipts {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const inFlight = useRef(false);
  const skip = useRef(0);
  // Without localStorage the state lives here for the visit.
  const memory = useRef<SeenState>(EMPTY_SEEN);
  const [fresh, setFresh] = useState<Fresh[]>([]);
  const [rows, setRows] = useState<Map<string, Receipt>>(new Map());
  const [seen, setSeen] = useState<SeenState>(EMPTY_SEEN);

  const save = useCallback(
    (next: SeenState) => {
      if (!userId) return;
      memory.current = next;
      writeSeen(userId, next);
      setSeen(next);
    },
    [userId],
  );

  const poll = useCallback(async () => {
    if (!userId || inFlight.current || document.visibilityState !== "visible") return;
    if (skip.current > 0) {
      skip.current -= 1;
      return;
    }
    inFlight.current = true;
    try {
      const current = readSeen(userId, memory.current);
      const query = new URLSearchParams({ rows: "web" });
      if (current.after) query.set("after", current.after);
      const res = await fetch(`/api/receipts/updates?${query}`, { cache: "no-store" });
      if (!res.ok) {
        skip.current = BACKOFF_POLLS;
        return;
      }
      const answer = (await res.json()) as Answer;
      const started = startSeen(current, answer.latestCreatedAt);
      if (started !== current) save(started);
      else setSeen(current);
      if (version.current != null && answer.version !== version.current) router.refresh();
      version.current = answer.version;
      setFresh(answer.fresh);
      if (answer.receipts?.length) {
        setRows((prev) => {
          const next = new Map(prev);
          for (const r of answer.receipts ?? []) next.set(r.id, r);
          return next;
        });
      }
    } catch {
      // Offline for a moment: the next poll asks again.
    } finally {
      inFlight.current = false;
    }
  }, [userId, router, save]);

  useEffect(() => {
    if (!userId) return;
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        skip.current = 0;
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, poll]);

  const items = unseen(fresh, seen).map((f) => ({ ...f, receipt: rows.get(f.id) ?? null }));

  return {
    items,
    open: (id) => save(markOpened(seen, fresh, id)),
    dismiss: () => save(dismissAll(seen, fresh)),
  };
}
