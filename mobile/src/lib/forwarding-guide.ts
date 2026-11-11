// The forwarding setup guide's steps, per mail provider: the same steps as
// the website's wizard (src/app/app/(authed)/settings/forwarding/guide/
// actions.tsx), one per screen. Sentences are in the app's language
// (s.forwarding.steps); the button names they quote come from the server
// (GET /api/mobile/forwarding, the website's ui-labels.ts) in the language
// the user's mail shows. Pure, so it's tested.

import type { MobileForwarding, MobileMailLabel } from "@/lib/mobile/types";
import type { Locale } from "../i18n/core";
import type { Strings } from "../i18n/en";

export type GuideProvider = "gmail" | "outlook" | "icloud" | "paid" | "other";
type LabelGroup = keyof MobileForwarding["labels"];

export type Extra =
  | "copyAddress"
  | "copyFilter"
  | "outlookWords"
  | "icloudRest"
  | "otherWords"
  | "code"
  | "test"
  | "paid"
  | { open: keyof MobileForwarding["links"] }
  | { openEither: [keyof MobileForwarding["links"], keyof MobileForwarding["links"]] };

type StepKey = keyof Strings["forwarding"]["steps"];
type HintKey = keyof Strings["forwarding"]["hints"];
type ChapterKey = keyof Strings["forwarding"]["chapters"];

export type GuideStep = {
  id: string;
  chapter: ChapterKey;
  text: StepKey;
  /** {placeholder} in the sentence → a button name in the user's mail language. */
  labels?: Record<string, [LabelGroup, string]>;
  hint?: HintKey;
  hintLabels?: Record<string, [LabelGroup, string]>;
  extra?: Extra;
};

const TEST: GuideStep = { id: "test", chapter: "test", text: "test", extra: "test", hint: "test" };

export const GUIDE: Record<GuideProvider, GuideStep[]> = {
  gmail: [
    {
      id: "gmail-open",
      chapter: "gmailAdd",
      text: "gmailOpen",
      labels: { page: ["gmail", "forwardingTab"] },
      hint: "gmailOpen",
      extra: { open: "gmailForwarding" },
    },
    { id: "gmail-add", chapter: "gmailAdd", text: "click", labels: { button: ["gmail", "addForwardingAddress"] } },
    { id: "gmail-paste", chapter: "gmailAdd", text: "pasteThenClick", labels: { button: ["gmail", "next"] }, extra: "copyAddress" },
    { id: "gmail-proceed", chapter: "gmailAdd", text: "gmailProceed", labels: { button: ["gmail", "proceed"] }, hint: "gmailProceed" },
    { id: "gmail-ok", chapter: "gmailAdd", text: "click", labels: { button: ["gmail", "ok"] } },
    { id: "gmail-code", chapter: "gmailConfirm", text: "gmailCode", labels: { button: ["gmail", "verify"] }, extra: "code" },
    {
      id: "gmail-leave",
      chapter: "gmailConfirm",
      text: "gmailLeave",
      labels: { option: ["gmail", "disableForwarding"] },
      hint: "gmailLeave",
      hintLabels: { option: ["gmail", "forwardCopy"] },
    },
    {
      id: "gmail-filters",
      chapter: "gmailFilter",
      text: "gmailFilters",
      labels: { page: ["gmail", "filtersTab"] },
      extra: { open: "gmailFilters" },
    },
    { id: "gmail-new-filter", chapter: "gmailFilter", text: "click", labels: { button: ["gmail", "createNewFilter"] } },
    { id: "gmail-has-words", chapter: "gmailFilter", text: "pasteInto", labels: { field: ["gmail", "hasTheWords"] }, extra: "copyFilter" },
    {
      id: "gmail-create-1",
      chapter: "gmailFilter",
      text: "gmailCreate",
      labels: { button: ["gmail", "createFilter"], next: ["gmail", "search"] },
    },
    {
      id: "gmail-forward-it",
      chapter: "gmailFilter",
      text: "gmailForwardIt",
      labels: { option: ["gmail", "forwardIt"] },
      hint: "gmailForwardIt",
    },
    { id: "gmail-create-2", chapter: "gmailFilter", text: "clickAgain", labels: { button: ["gmail", "createFilter"] } },
    TEST,
  ],
  outlook: [
    {
      id: "outlook-open",
      chapter: "outlookOpen",
      text: "outlookOpen",
      labels: { page: ["outlook", "rules"] },
      hint: "outlookOpen",
      extra: { openEither: ["outlookPersonal", "outlookWork"] },
    },
    { id: "outlook-add", chapter: "outlookOpen", text: "click", labels: { button: ["outlook", "addNewRule"] } },
    { id: "outlook-name", chapter: "outlookWhich", text: "outlookName" },
    {
      id: "outlook-condition",
      chapter: "outlookWhich",
      text: "underChoose",
      labels: { menu: ["outlook", "addCondition"], option: ["outlook", "subjectIncludes"] },
    },
    { id: "outlook-words", chapter: "outlookWhich", text: "outlookWords", extra: "outlookWords" },
    {
      id: "outlook-action",
      chapter: "outlookSend",
      text: "underChoose",
      labels: { menu: ["outlook", "addAction"], option: ["outlook", "redirectTo"] },
      hint: "outlookAction",
      hintLabels: { option: ["outlook", "forwardTo"] },
    },
    { id: "outlook-address", chapter: "outlookSend", text: "pasteAddress", extra: "copyAddress" },
    { id: "outlook-save", chapter: "outlookSend", text: "click", labels: { button: ["outlook", "save"] }, hint: "outlookSave" },
    TEST,
  ],
  icloud: [
    {
      id: "icloud-open",
      chapter: "icloudOpen",
      text: "icloudOpen",
      labels: { area: ["icloud", "mailboxes"], button: ["icloud", "settings"] },
      hint: "icloudOpen",
      extra: { open: "icloud" },
    },
    { id: "icloud-rules", chapter: "icloudOpen", text: "click", labels: { button: ["icloud", "rules"] } },
    { id: "icloud-add", chapter: "icloudOpen", text: "icloudAdd", labels: { button: ["icloud", "add"] } },
    {
      id: "icloud-message",
      chapter: "icloudFirst",
      text: "icloudMessage",
      labels: { menu: ["icloud", "message"], option: ["icloud", "subjectContains"] },
    },
    {
      id: "icloud-action",
      chapter: "icloudFirst",
      text: "icloudAction",
      labels: { menu: ["icloud", "action"], option: ["icloud", "forwardTo"] },
      hint: "icloudAction",
      extra: "copyAddress",
    },
    { id: "icloud-save", chapter: "icloudFirst", text: "click", labels: { button: ["icloud", "add"] } },
    { id: "icloud-repeat", chapter: "icloudRepeat", text: "icloudRepeat", hint: "icloudRepeat", extra: "icloudRest" },
    TEST,
  ],
  paid: [{ id: "paid-check", chapter: "paid", text: "paidCheck", extra: "paid" }],
  other: [
    { id: "other-find", chapter: "otherFind", text: "otherFind", hint: "otherFind" },
    { id: "other-rule", chapter: "otherRule", text: "otherRule", hint: "otherRule", extra: "otherWords" },
    TEST,
  ],
};

/** Gmail, Outlook and iCloud show their buttons in the user's language; the guide can follow another. */
export const HAS_MAIL_LANGUAGE: Record<GuideProvider, boolean> = {
  gmail: true,
  outlook: true,
  icloud: true,
  paid: false,
  other: false,
};

export type Piece = { text: string; strong: boolean };

const QUOTES: Record<Locale, [string, string]> = {
  en: ["“", "”"],
  sv: ["”", "”"],
  fr: ["« ", " »"],
};

/**
 * A step's sentence cut into plain and strong pieces: each {placeholder}
 * becomes the quoted button name in the mail's language (strong), or a
 * strong word given in `words` (iCloud's first word).
 */
export function stepPieces(
  template: string,
  labels: Record<string, [LabelGroup, string]> | undefined,
  data: Pick<MobileForwarding, "labels">,
  mailLang: Locale,
  words: Record<string, string> = {},
): Piece[] {
  const [open, close] = QUOTES[mailLang];
  const pieces: Piece[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const index = m.index ?? 0;
    if (index > last) pieces.push({ text: template.slice(last, index), strong: false });
    const name = m[1];
    const ref = labels?.[name];
    const label: MobileMailLabel | undefined = ref ? data.labels[ref[0]]?.[ref[1]] : undefined;
    if (label) pieces.push({ text: `${open}${label[mailLang]}${close}`, strong: true });
    else if (name in words) pieces.push({ text: words[name], strong: true });
    else pieces.push({ text: m[0], strong: false });
    last = index + m[0].length;
  }
  if (last < template.length) pieces.push({ text: template.slice(last), strong: false });
  return pieces;
}
