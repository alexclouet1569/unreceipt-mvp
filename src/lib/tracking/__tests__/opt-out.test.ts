import { describe, expect, it } from "vitest";
import {
  OPT_OUT_KEY,
  applyOptOutFromUrl,
  isOptedOut,
  optOutRequested,
  skipOptedOut,
  withoutOptOutParam,
} from "@/lib/tracking/opt-out";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("optOutRequested", () => {
  it("reads off and on, any case", () => {
    expect(optOutRequested("https://unreceipt.com/?analytics=off")).toBe("off");
    expect(optOutRequested("https://unreceipt.com/sv?utm_source=x&analytics=ON")).toBe("on");
  });

  it("ignores anything else", () => {
    expect(optOutRequested("https://unreceipt.com/")).toBeNull();
    expect(optOutRequested("https://unreceipt.com/?analytics=maybe")).toBeNull();
    expect(optOutRequested("not a url")).toBeNull();
  });
});

describe("applyOptOutFromUrl", () => {
  it("sets Plausible's own flag on off and removes it on on", () => {
    const s = memoryStorage();
    expect(applyOptOutFromUrl("https://unreceipt.com/?analytics=off", s)).toBe("off");
    expect(s.data.get(OPT_OUT_KEY)).toBe("true");
    expect(OPT_OUT_KEY).toBe("plausible_ignore");
    expect(isOptedOut(s)).toBe(true);
    expect(applyOptOutFromUrl("https://unreceipt.com/fr?analytics=on", s)).toBe("on");
    expect(isOptedOut(s)).toBe(false);
  });

  it("stores nothing for an ordinary visit", () => {
    const s = memoryStorage();
    expect(applyOptOutFromUrl("https://unreceipt.com/sv", s)).toBeNull();
    expect(s.data.size).toBe(0);
  });

  it("survives blocked storage", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(applyOptOutFromUrl("https://unreceipt.com/?analytics=off", throwing)).toBeNull();
    expect(isOptedOut(throwing)).toBe(false);
    expect(isOptedOut(null)).toBe(false);
  });
});

describe("skipOptedOut", () => {
  it("drops the event that carries ?analytics=off and every later one", () => {
    const s = memoryStorage();
    expect(skipOptedOut({ url: "https://unreceipt.com/?analytics=off" }, s)).toBeNull();
    expect(skipOptedOut({ url: "https://unreceipt.com/sv" }, s)).toBeNull();
  });

  it("keeps events from a browser that never opted out, or opted back in", () => {
    const s = memoryStorage();
    const event = { url: "https://unreceipt.com/sv", type: "pageview" };
    expect(skipOptedOut(event, s)).toBe(event);
    s.setItem(OPT_OUT_KEY, "true");
    expect(skipOptedOut({ url: "https://unreceipt.com/?analytics=on" }, s)).toEqual({
      url: "https://unreceipt.com/?analytics=on",
    });
  });
});

describe("withoutOptOutParam", () => {
  it("drops only ?analytics= and keeps the rest", () => {
    expect(withoutOptOutParam("https://unreceipt.com/sv?utm_source=li&analytics=off#faq")).toBe("/sv?utm_source=li#faq");
    expect(withoutOptOutParam("https://unreceipt.com/?analytics=off")).toBe("/");
  });

  it("leaves an address without it alone", () => {
    expect(withoutOptOutParam("https://unreceipt.com/sv?utm_source=li")).toBeNull();
  });
});
