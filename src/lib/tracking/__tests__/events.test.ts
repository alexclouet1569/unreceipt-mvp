import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localeOfPath, setEventSender, trackEvent, trackedLink } from "@/lib/tracking/events";
import { handleFunnelClick } from "@/lib/tracking/links";
import { cleanPlausiblePayload, plausibleAllowed, plausibleUrl } from "@/lib/tracking/where";

// jsdom's location can't be assigned; replace it for the test.
function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: url.href, host: url.host, hostname: url.hostname, pathname: url.pathname, search: url.search },
  });
}

const realLocation = window.location;

// The handlers under test run on the links; this runs last (bubbling to the
// document) and stops jsdom from trying to follow them.
document.addEventListener("click", (e) => e.preventDefault());

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  setEventSender(null);
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("trackEvent", () => {
  it("calls Plausible's track() with the event, the page's URL and props", () => {
    setLocation("https://unreceipt.com/sv?utm_source=test&utm_campaign=x&fbclid=abc");
    const plausible = vi.fn();
    setEventSender(plausible);
    trackEvent("cta_signup", { page: "/sv", locale: "sv" });
    expect(plausible).toHaveBeenCalledWith("cta_signup", {
      url: "https://unreceipt.com/sv?utm_source=test&utm_campaign=x",
      props: { page: "/sv", locale: "sv" },
    });
  });

  it("does nothing when Plausible isn't loaded", () => {
    setLocation("https://unreceipt.com/sv");
    expect(() => trackEvent("cta_signup")).not.toThrow();
  });

  it("does nothing on a page where Plausible isn't allowed", () => {
    setLocation("https://app.unreceipt.com/app/settings");
    const plausible = vi.fn();
    setEventSender(plausible);
    trackEvent("cta_signup");
    expect(plausible).not.toHaveBeenCalled();
  });

  it("never throws when Plausible does", () => {
    setLocation("https://unreceipt.com/");
    setEventSender(() => {
      throw new Error("blocked");
    });
    expect(() => trackEvent("demo_tour_start")).not.toThrow();
  });
});

describe("localeOfPath", () => {
  it("reads the language from the path", () => {
    expect(localeOfPath("/")).toBe("en");
    expect(localeOfPath("/sv")).toBe("sv");
    expect(localeOfPath("/sv/redovisningsbyra")).toBe("sv");
    expect(localeOfPath("/fr/independants")).toBe("fr");
    expect(localeOfPath("/svenska")).toBe("en");
    expect(localeOfPath("/demo/company")).toBe("en");
  });
});

describe("handleFunnelClick", () => {
  function link(href: string, attrs: Record<string, string>): HTMLAnchorElement {
    const a = document.createElement("a");
    a.setAttribute("href", href);
    for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
    const span = document.createElement("span");
    span.textContent = "Join";
    a.appendChild(span);
    document.body.appendChild(a);
    return a;
  }

  function click(target: Element): MouseEvent {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  it("adds the source to a sign-up link and sends cta_signup, from /sv?utm_source=test&utm_campaign=x", () => {
    setLocation("https://unreceipt.com/sv?utm_source=test&utm_campaign=x");
    const plausible = vi.fn();
    setEventSender(plausible);
    const a = link("https://app.unreceipt.com/app/login?mode=signup", trackedLink("cta_signup", { attribution: true }));
    const span = a.querySelector("span")!;
    span.addEventListener("click", (e) =>
      handleFunnelClick(e, { href: window.location.href, referrer: "" }, window.location.pathname)
    );
    click(span);

    const url = new URL(a.getAttribute("href")!);
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("utm_source")).toBe("test");
    expect(url.searchParams.get("utm_campaign")).toBe("x");
    expect(url.searchParams.get("landing")).toBe("/sv");
    expect(plausible).toHaveBeenCalledWith("cta_signup", {
      url: "https://unreceipt.com/sv?utm_source=test&utm_campaign=x",
      props: { page: "/sv", locale: "sv" },
    });
  });

  it("sends the event without touching a link that carries no source", () => {
    setLocation("https://unreceipt.com/accountants");
    const plausible = vi.fn();
    setEventSender(plausible);
    const a = link("mailto:support@unreceipt.com", trackedLink("cta_demo_page"));
    a.addEventListener("click", (e) => handleFunnelClick(e, { href: window.location.href, referrer: "" }, "/accountants"));
    click(a);
    expect(a.getAttribute("href")).toBe("mailto:support@unreceipt.com");
    expect(plausible).toHaveBeenCalledWith("cta_demo_page", expect.objectContaining({ props: { page: "/accountants", locale: "en" } }));
  });

  it("still carries the source when Plausible isn't loaded", () => {
    setLocation("https://unreceipt.com/?utm_source=linkedin");
    const a = link("/app/login?mode=signup", trackedLink("cta_signup", { attribution: true }));
    a.addEventListener("click", (e) => handleFunnelClick(e, { href: window.location.href, referrer: "" }, "/"));
    click(a);
    expect(a.getAttribute("href")).toBe("/app/login?mode=signup&utm_source=linkedin&landing=%2F");
  });

  it("ignores untracked links and clicks another handler cancelled", () => {
    setLocation("https://unreceipt.com/");
    const plausible = vi.fn();
    setEventSender(plausible);
    const plain = link("/sv", {});
    plain.addEventListener("click", (e) => handleFunnelClick(e, { href: window.location.href, referrer: "" }, "/"));
    click(plain);

    const guarded = link("/app/login?mode=signup", trackedLink("cta_signup", { attribution: true }));
    guarded.addEventListener("click", (e) => {
      e.preventDefault();
      handleFunnelClick(e, { href: "https://unreceipt.com/?utm_source=x", referrer: "" }, "/");
    });
    click(guarded);

    expect(plausible).not.toHaveBeenCalled();
    expect(guarded.getAttribute("href")).toBe("/app/login?mode=signup");
  });
});

describe("plausibleAllowed", () => {
  it("allows every page of the marketing site", () => {
    expect(plausibleAllowed("unreceipt.com", "/")).toBe(true);
    expect(plausibleAllowed("unreceipt.com", "/sv/redovisningsbyra")).toBe(true);
  });

  it("allows only the demo on the product host", () => {
    expect(plausibleAllowed("app.unreceipt.com", "/demo")).toBe(true);
    expect(plausibleAllowed("app.unreceipt.com", "/demo/company")).toBe(true);
    expect(plausibleAllowed("app.unreceipt.com", "/app")).toBe(false);
    expect(plausibleAllowed("app.unreceipt.com", "/app/connect/abc")).toBe(false);
    expect(plausibleAllowed("app.unreceipt.com", "/firm")).toBe(false);
    expect(plausibleAllowed("app.unreceipt.com", "/admin")).toBe(false);
    expect(plausibleAllowed("app.unreceipt.com", "/democracy")).toBe(false);
  });

  it("allows marketing pages and the demo on local and preview addresses", () => {
    expect(plausibleAllowed("localhost:3000", "/sv")).toBe(true);
    expect(plausibleAllowed("localhost:3000", "/privacy")).toBe(true);
    expect(plausibleAllowed("unreceipt-git-x.vercel.app", "/demo/accountant")).toBe(true);
    expect(plausibleAllowed("localhost:3000", "/app/login")).toBe(false);
    expect(plausibleAllowed("unreceipt-git-x.vercel.app", "/app")).toBe(false);
  });

  it("allows nothing on an unknown host", () => {
    expect(plausibleAllowed("evil.com", "/")).toBe(false);
  });
});

describe("plausibleUrl", () => {
  it("keeps the path and the campaign tags only", () => {
    expect(plausibleUrl("https://unreceipt.com/sv?utm_source=a&gclid=1&utm_campaign=b#faq")).toBe(
      "https://unreceipt.com/sv?utm_source=a&utm_campaign=b"
    );
    expect(plausibleUrl("https://app.unreceipt.com/demo/company?step=3")).toBe("https://app.unreceipt.com/demo/company");
    expect(plausibleUrl("nope")).toBeNull();
  });
});

describe("cleanPlausiblePayload", () => {
  it("cleans the URL of every request the tracker sends", () => {
    expect(
      cleanPlausiblePayload({ n: "engagement", u: "https://app.unreceipt.com/demo/company?step=4&token=x#y", d: "unreceipt.com" })
    ).toEqual({ n: "engagement", u: "https://app.unreceipt.com/demo/company", d: "unreceipt.com" });
    expect(cleanPlausiblePayload({ n: "pageview", u: "", d: "unreceipt.com" })).toBeNull();
  });
});
