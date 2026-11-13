import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ForwardingWizard, providerForEmail } from "@/app/app/(authed)/settings/forwarding/ForwardingWizard";
import { HandForward } from "@/app/app/(authed)/settings/forwarding/guide/HandForward";
import { CHAPTERS } from "@/app/app/(authed)/settings/forwarding/guide/actions";
import { GMAIL, guessMailLang, type MailLang } from "@/app/app/(authed)/settings/forwarding/guide/ui-labels";
import { RECEIPT_SUBJECT_WORDS, gmailFilterQuery, icloudRuleWords, outlookSubjectWords } from "@/lib/forwarding-filters";

const ADDRESS = "receipts+abc12345mn@in.unreceipt.com";
const fetchMock = vi.fn();
let status = {
  confirmation: null as null | { code: string | null; forAddress: string | null; receivedAt: string; autoConfirmed?: boolean; confirmUrl?: string | null },
  lastEmailAt: null as string | null,
};

function mockMatchMedia(coarse: boolean, reducedMotion = false) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: (coarse && q.includes("coarse")) || (reducedMotion && q.includes("reduce")),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const setup = async (accountEmail?: string, lang: MailLang = "en", onLangChange?: (l: MailLang) => void) => {
  const user = userEvent.setup();
  render(<ForwardingWizard forwardingEmail={ADDRESS} accountEmail={accountEmail} lang={lang} onLangChange={onLangChange} />);
  // Let the deferred restore from localStorage run.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return user;
};

// The current action of the checklist.
const currentStep = () => screen.getByRole("button", { current: "step" });
// Let the cursor's animation frames run.
const frames = () => act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
const saveAt = (provider: string, step: number, action = 0) =>
  window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider, step, action, done: false }));

describe("ForwardingWizard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    status = { confirmation: null, lastEmailAt: null };
    fetchMock.mockReset().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url === "/api/forwarding/status" ? status : { ok: true, sentTo: "anna@acme.se" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    mockMatchMedia(false);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts by asking where receipts arrive", async () => {
    await setup();
    expect(screen.getByRole("heading", { name: "Where do your receipts arrive?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gmail/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Outlook/ })).toBeInTheDocument();
  });

  it("walks Gmail one action at a time, with a picture, a deep link and the things to paste", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /Gmail/ }));

    expect(screen.getByText("Gmail · Step 1 of 4")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((li) => li.closest('[aria-label="Steps"]'))).toHaveLength(5);
    expect(currentStep()).toHaveTextContent("Forwarding and POP/IMAP");
    expect(screen.getByRole("img", { name: /Open Gmail on the “Forwarding and POP\/IMAP” page/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Gmail forwarding settings/ })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#settings/fwdandpop",
    );
    // The old 8-click trail is gone.
    expect(screen.queryByRole("list", { name: "Where to click" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toHaveTextContent("Click “Add a forwarding address”");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toHaveTextContent("Paste your UnReceipt address, then click “Next”");
    // The address to paste sits under the action that needs it (and in the picture).
    expect(screen.getByRole("button", { name: "Copy forwarding address" })).toBeInTheDocument();
    expect(screen.getAllByText(ADDRESS).length).toBeGreaterThan(0);

    // Through Proceed and OK to the confirmation chapter.
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Gmail · Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText(/Waiting for Gmail/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toHaveTextContent("Leave “Disable forwarding” selected");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Gmail · Step 3 of 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toHaveTextContent("Paste this into “Has the words”");
    expect(screen.getByRole("button", { name: "Copy Gmail filter" })).toBeInTheDocument();
    expect(screen.getAllByText(gmailFilterQuery()).length).toBeGreaterThan(0);
  });

  it("lets the user tap back to an earlier action, and Back crosses chapters", async () => {
    saveAt("gmail", 0, 3);
    const user = await setup();
    expect(currentStep()).toHaveTextContent("Proceed");
    expect(screen.getAllByText("(done)")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /Click “Add a forwarding address”/ }));
    expect(currentStep()).toHaveTextContent("Add a forwarding address");

    cleanup();
    saveAt("gmail", 1, 0);
    const user2 = await setup();
    await user2.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Gmail · Step 1 of 4")).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Click “OK”");
  });

  it("names Gmail's buttons in the language of the user's email", async () => {
    const onLangChange = vi.fn();
    const user = await setup("anna@gmail.com", "sv", onLangChange);
    expect(currentStep()).toHaveTextContent("“Vidarebefordran och POP/IMAP”");
    expect(screen.getByRole("img", { name: /Vidarebefordran och POP\/IMAP/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Svenska" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Français" }));
    expect(onLangChange).toHaveBeenCalledWith("fr");

    // Screen readers say the button name the way the user's own screen does.
    expect(screen.getAllByText("“Vidarebefordran och POP/IMAP”")[0]).toHaveAttribute("lang", "sv");

    cleanup();
    await setup("anna@gmail.com", "fr");
    expect(currentStep()).toHaveTextContent(`“${GMAIL.forwardingTab.fr}”`);
  });

  it("announces the new current step after Next", async () => {
    saveAt("gmail", 0, 0);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 5: Click “Add a forwarding address”")).toHaveAttribute("aria-live", "polite");
  });

  it("shows Gmail's code as soon as it arrives", async () => {
    status = { confirmation: { code: "593872831", forAddress: "anna@gmail.com", receivedAt: new Date().toISOString() }, lastEmailAt: null };
    // A position saved before actions existed (no `action`) still loads.
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 1, done: false }));
    await setup();
    expect(await screen.findByText("593872831")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've confirmed it" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/forwarding/status", { cache: "no-store" });
  });

  it("says when we confirmed Gmail's request, keeping the code as a fallback", async () => {
    status = {
      confirmation: { code: "593872831", forAddress: "anna@gmail.com", receivedAt: new Date().toISOString(), autoConfirmed: true },
      lastEmailAt: null,
    };
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 1, done: false }));
    await setup();
    expect(await screen.findByText(/we approved it for you/)).toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("Nothing to type: we confirmed it for you");
    expect(screen.getByText("anna@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("593872831")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("offers Gmail's confirmation link when the email has no code (Gmail's current format)", async () => {
    const link = "https://mail-settings.google.com/mail/vf-%5BANGjdJ8abc%5D-xyzTOKEN123456";
    status = {
      confirmation: { code: null, forAddress: "anna@gmail.com", receivedAt: new Date().toISOString(), confirmUrl: link },
      lastEmailAt: null,
    };
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 1, done: false }));
    await setup();
    const confirm = await screen.findByRole("link", { name: /Confirm in Gmail/ });
    expect(confirm).toHaveAttribute("href", link);
    expect(confirm).toHaveAttribute("rel", "noopener noreferrer");
    // Never asks for a code that Gmail didn't send.
    expect(currentStep()).toHaveTextContent("Confirm with Gmail's link below, then reload Gmail");
    expect(currentStep()).not.toHaveTextContent(/Paste Gmail.s code/);
    expect(screen.getByText("anna@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've confirmed it" })).toBeInTheDocument();
  });

  it("keeps the link as a fallback after confirming for the user", async () => {
    const link = "https://mail-settings.google.com/mail/vf-%5BANGjdJ8abc%5D-xyzTOKEN123456";
    status = {
      confirmation: { code: null, forAddress: "anna@gmail.com", receivedAt: new Date().toISOString(), autoConfirmed: true, confirmUrl: link },
      lastEmailAt: null,
    };
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 1, done: false }));
    await setup();
    expect(await screen.findByText(/we approved it for you/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Confirm in Gmail/ })).toHaveAttribute("href", link);
  });

  it("says when Gmail's email came but couldn't be read", async () => {
    status = { confirmation: { code: null, forAddress: null, receivedAt: new Date().toISOString() }, lastEmailAt: null };
    window.localStorage.setItem("unreceipt.forwarding-wizard", JSON.stringify({ provider: "gmail", step: 1, done: false }));
    await setup();
    expect(await screen.findByText(/couldn.t read it/)).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for Gmail/)).toBeNull();
  });

  it("remembers going back to the list instead of guessing again", async () => {
    const user = await setup("anna@gmail.com");
    expect(screen.getByText(/Your sign-in email is Gmail/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change email" }));
    cleanup();
    await setup("anna@gmail.com");
    expect(screen.getByRole("heading", { name: "Where do your receipts arrive?" })).toBeInTheDocument();
  });

  it("starts on the user's own provider, picked from their email", async () => {
    await setup("anna@gmail.com");
    expect(screen.getByText("Gmail · Step 1 of 4")).toBeInTheDocument();
    cleanup();
    window.localStorage.clear();
    await setup("anna@hotmail.se");
    expect(screen.getByText(/Outlook · Step 1 of/)).toBeInTheDocument();
    cleanup();
    window.localStorage.clear();
    await setup("anna@acme.se");
    expect(screen.getByRole("heading", { name: "Where do your receipts arrive?" })).toBeInTheDocument();
  });

  it("confirms when the test email arrives, then finishes", async () => {
    saveAt("outlook", 2, 2);
    const user = await setup();
    expect(currentStep()).toHaveTextContent("Click “Save”");
    status = { confirmation: null, lastEmailAt: new Date(Date.now() + 1000).toISOString() };
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Outlook · Step 4 of 4")).toBeInTheDocument();
    expect(await screen.findByText(/It works/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { name: "You're set" })).toBeInTheDocument();
  });

  it("lets Outlook users copy each subject word", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /Outlook/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(currentStep()).toHaveTextContent("Add these words one at a time");
    const words = outlookSubjectWords();
    expect(screen.getAllByRole("button", { name: /^Copy “/ })).toHaveLength(words.length);
  });

  it("on a phone, offers to email the page to the user", async () => {
    mockMatchMedia(true);
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "Email me this page" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/forwarding/send-link", { method: "POST" });
    expect(await screen.findByText(/Sent to anna@acme.se/)).toBeInTheDocument();
  });
  it("walks iCloud with one rule per word, in the language of the user's email", async () => {
    saveAt("icloud", 1, 0);
    await setup(undefined, "sv");
    expect(currentStep()).toHaveTextContent("kvitto");
    cleanup();
    saveAt("icloud", 2, 0);
    await setup(undefined, "sv");
    const others = icloudRuleWords("sv").slice(1);
    expect(screen.getAllByRole("button", { name: /^Copy “/ }).map((b) => b.textContent)).toEqual(others);
    expect(screen.getByText(/a few receipts may slip through/)).toBeInTheDocument();
  });

  it("tells Yahoo users plainly that it forwards everything, and sends them to forwarding by hand", async () => {
    const user = await setup("anna@yahoo.se");
    expect(screen.getByText("Yahoo or Proton · Step 1 of 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yahoo Mail" }));
    expect(screen.getByText(/forwards all your mail, not just receipts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forward receipts by hand" })).toHaveAttribute("href", "#hand-heading");
    await user.click(screen.getByRole("button", { name: "Proton Mail" }));
    expect(screen.getByText(/Free Proton plans can.t forward/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { name: "Forward them by hand" })).toBeInTheDocument();
  });

  it("glides the cursor to the button, or leaves it there under reduced motion", async () => {
    saveAt("gmail", 0, 1);
    await setup();
    await frames();
    expect(document.querySelector('[data-mark="target"]')).toHaveTextContent("Add a forwarding address");
    expect(document.querySelector("[data-cursor]")).toHaveAttribute("data-cursor", "glide");
    cleanup();
    mockMatchMedia(false, true);
    saveAt("gmail", 0, 1);
    await setup();
    await frames();
    expect(document.querySelector("[data-cursor]")).toHaveAttribute("data-cursor", "still");
  });

  it("guesses the provider and the email language", () => {
    expect(providerForEmail("a@icloud.com")).toBe("icloud");
    expect(providerForEmail("a@proton.me")).toBe("paid");
    expect(providerForEmail("a@yahoo.fr")).toBe("paid");
    expect(providerForEmail("a@acme.se")).toBeNull();
    expect(guessMailLang(["sv-SE", "en"])).toBe("sv");
    expect(guessMailLang(["fr-FR"])).toBe("fr");
    expect(guessMailLang(["de-DE"])).toBe("en");
  });

  it("only suggests iCloud words that are in the receipt word list", () => {
    for (const lang of ["en", "sv", "fr"] as const) {
      for (const w of icloudRuleWords(lang)) expect(RECEIPT_SUBJECT_WORDS).toContain(w);
    }
  });

  it("gives every action a unique id and every provider but Yahoo/Proton a test", () => {
    const ids = Object.values(CHAPTERS).flatMap((cs) => cs.flatMap((c) => c.actions.map((a) => a.id)));
    expect(new Set(ids.filter((id) => id !== "test")).size).toBe(ids.filter((id) => id !== "test").length);
    for (const [p, cs] of Object.entries(CHAPTERS)) {
      expect(cs.at(-1)?.kind === "test").toBe(p !== "paid");
    }
  });
});

describe("HandForward", () => {
  beforeEach(() => mockMatchMedia(false));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("walks a phone app tap by tap and switches apps", async () => {
    const user = userEvent.setup();
    render(<HandForward forwardingEmail={ADDRESS} lang="en" />);
    expect(screen.getByRole("button", { name: "Gmail app" })).toHaveAttribute("aria-pressed", "true");
    expect(currentStep()).toHaveTextContent("Open the receipt email");
    await user.click(screen.getByRole("button", { name: "Next tap" }));
    expect(currentStep()).toHaveTextContent("Tap ⋮");
    await user.click(screen.getByRole("button", { name: "iPhone Mail" }));
    expect(currentStep()).toHaveTextContent("Open the receipt email");
    await user.click(screen.getByRole("button", { name: "Next tap" }));
    expect(currentStep()).toHaveTextContent("Tap the arrow at the bottom");
    await user.click(screen.getByRole("button", { name: "Next tap" }));
    await user.click(screen.getByRole("button", { name: "Next tap" }));
    expect(currentStep()).toHaveTextContent("UnReceipt");
    expect(screen.getByRole("button", { name: "Copy forwarding address" })).toBeInTheDocument();
  });

  it("names the phone's buttons in the user's language", () => {
    render(<HandForward forwardingEmail={ADDRESS} lang="fr" />);
    expect(screen.getByRole("button", { name: /“Transférer”/ })).toBeInTheDocument();
  });
});
