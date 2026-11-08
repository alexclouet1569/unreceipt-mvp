import { GMAIL, ICLOUD, OUTLOOK, say, type MailLang, type UiLabel } from "./ui-labels";
import { GMAIL_SCENES } from "./scenes/gmail";
import { OUTLOOK_SCENES } from "./scenes/outlook";
import { ICLOUD_SCENES } from "./scenes/icloud";
import { testArrived } from "./scenes/phone";
import type { SceneFn } from "./types";

/**
 * The setup guide as data: for each email provider, chapters (one screen
 * each) made of single actions. Each action is one click or one paste, with
 * a picture of that part of the screen. Button names come from
 * ui-labels.ts in the language of the user's email.
 */

export type Provider = "gmail" | "outlook" | "icloud" | "paid" | "other";

// Things an action shows next to its sentence, rendered by the wizard.
export type Extra =
  | "open-gmail-forwarding"
  | "open-gmail-filters"
  | "copy-address"
  | "copy-filter"
  | "outlook-links"
  | "outlook-words"
  | "icloud-open"
  | "icloud-words"
  | "other-words"
  | "paid-check"
  | "code"
  | "test";

export type TextContext = { lang: MailLang; autoConfirmed: boolean; firstWord: string };

export type GuideAction = {
  id: string;
  scene: SceneFn | null;
  text: (c: TextContext) => React.ReactNode;
  extra?: Extra;
  hint?: (c: TextContext) => React.ReactNode;
};

export type Chapter = {
  title: string;
  // "code": waits for Gmail's confirmation email; "test": waits for the test email.
  kind?: "code" | "test";
  actions: GuideAction[];
};

/** A button or menu name, quoted and in the user's email language. */
export function Q({ label, lang }: { label: UiLabel; lang: MailLang }) {
  return <strong style={{ fontWeight: 600 }}>“{say(label, lang)}”</strong>;
}

const TEST: Chapter = {
  title: "Check that it works",
  kind: "test",
  actions: [
    {
      id: "test",
      scene: testArrived,
      text: () => "Send a test email and watch it arrive here",
      extra: "test",
    },
  ],
};

export const CHAPTERS: Record<Provider, Chapter[]> = {
  gmail: [
    {
      title: "Add your UnReceipt address in Gmail",
      actions: [
        {
          id: "gmail-open",
          scene: GMAIL_SCENES["gmail-tab"],
          text: ({ lang }) => (
            <>
              Open Gmail on the <Q label={GMAIL.forwardingTab} lang={lang} /> page
            </>
          ),
          extra: "open-gmail-forwarding",
          hint: () => "Gmail may ask you to sign in again. That's normal. Wrong Gmail account? Switch at the top right of Gmail.",
        },
        {
          id: "gmail-add",
          scene: GMAIL_SCENES["gmail-add"],
          text: ({ lang }) => (
            <>
              Click <Q label={GMAIL.addForwardingAddress} lang={lang} />
            </>
          ),
        },
        {
          id: "gmail-paste",
          scene: GMAIL_SCENES["gmail-paste"],
          text: ({ lang }) => (
            <>
              Paste your UnReceipt address, then click <Q label={GMAIL.next} lang={lang} />
            </>
          ),
          extra: "copy-address",
        },
        {
          id: "gmail-proceed",
          scene: GMAIL_SCENES["gmail-proceed"],
          text: ({ lang }) => (
            <>
              A small window opens: click <Q label={GMAIL.proceed} lang={lang} />
            </>
          ),
          hint: () => "No window? Your browser blocked it. Allow pop-ups for mail.google.com and click Next again.",
        },
        {
          id: "gmail-ok",
          scene: GMAIL_SCENES["gmail-ok"],
          text: ({ lang }) => (
            <>
              Click <Q label={GMAIL.ok} lang={lang} />
            </>
          ),
        },
      ],
    },
    {
      title: "Confirm your UnReceipt address",
      kind: "code",
      actions: [
        {
          id: "gmail-code",
          scene: GMAIL_SCENES["gmail-verify"],
          text: ({ lang, autoConfirmed }) =>
            autoConfirmed ? (
              "Nothing to type: we confirmed it for you"
            ) : (
              <>
                Paste Gmail&apos;s code next to your address, then click <Q label={GMAIL.verify} lang={lang} />
              </>
            ),
          extra: "code",
        },
        {
          id: "gmail-leave",
          scene: GMAIL_SCENES["gmail-leave"],
          text: ({ lang }) => (
            <>
              Leave <Q label={GMAIL.disableForwarding} lang={lang} /> selected
            </>
          ),
          hint: ({ lang }) => (
            <>
              <Q label={GMAIL.forwardCopy} lang={lang} /> would send all your mail. The next step forwards receipts
              only.
            </>
          ),
        },
      ],
    },
    {
      title: "Forward only receipts",
      actions: [
        {
          id: "gmail-filters",
          scene: GMAIL_SCENES["gmail-filters-tab"],
          text: ({ lang }) => (
            <>
              Open Gmail on the <Q label={GMAIL.filtersTab} lang={lang} /> page
            </>
          ),
          extra: "open-gmail-filters",
        },
        {
          id: "gmail-new-filter",
          scene: GMAIL_SCENES["gmail-new-filter"],
          text: ({ lang }) => (
            <>
              Click <Q label={GMAIL.createNewFilter} lang={lang} />
            </>
          ),
        },
        {
          id: "gmail-has-words",
          scene: GMAIL_SCENES["gmail-has-words"],
          text: ({ lang }) => (
            <>
              Paste this into <Q label={GMAIL.hasTheWords} lang={lang} />
            </>
          ),
          extra: "copy-filter",
        },
        {
          id: "gmail-create-1",
          scene: GMAIL_SCENES["gmail-create-1"],
          text: ({ lang }) => (
            <>
              Click <Q label={GMAIL.createFilter} lang={lang} />, next to <Q label={GMAIL.search} lang={lang} />
            </>
          ),
        },
        {
          id: "gmail-forward-it",
          scene: GMAIL_SCENES["gmail-forward-it"],
          text: ({ lang }) => (
            <>
              Tick <Q label={GMAIL.forwardIt} lang={lang} /> and pick your UnReceipt address
            </>
          ),
          hint: () => "Your address isn't in the list? It isn't confirmed yet: go back one step.",
        },
        {
          id: "gmail-create-2",
          scene: GMAIL_SCENES["gmail-create-2"],
          text: ({ lang }) => (
            <>
              Click <Q label={GMAIL.createFilter} lang={lang} /> again
            </>
          ),
        },
      ],
    },
    TEST,
  ],
  outlook: [
    {
      title: "Open Outlook's rules",
      actions: [
        {
          id: "outlook-open",
          scene: OUTLOOK_SCENES["outlook-rules"],
          text: ({ lang }) => (
            <>
              Open Outlook in your browser on <Q label={OUTLOOK.rules} lang={lang} />
            </>
          ),
          extra: "outlook-links",
          hint: () => "The Outlook app can't make forwarding rules; use Outlook in a browser.",
        },
        {
          id: "outlook-add",
          scene: OUTLOOK_SCENES["outlook-add-rule"],
          text: ({ lang }) => (
            <>
              Click <Q label={OUTLOOK.addNewRule} lang={lang} />
            </>
          ),
        },
      ],
    },
    {
      title: "Choose which emails",
      actions: [
        {
          id: "outlook-name",
          scene: OUTLOOK_SCENES["outlook-name"],
          text: () => (
            <>
              Name the rule <strong style={{ fontWeight: 600 }}>UnReceipt</strong>
            </>
          ),
        },
        {
          id: "outlook-condition",
          scene: OUTLOOK_SCENES["outlook-condition"],
          text: ({ lang }) => (
            <>
              Under <Q label={OUTLOOK.addCondition} lang={lang} />, choose <Q label={OUTLOOK.subjectIncludes} lang={lang} />
            </>
          ),
        },
        {
          id: "outlook-words",
          scene: OUTLOOK_SCENES["outlook-words"],
          text: () => "Add these words one at a time, pressing Enter after each",
          extra: "outlook-words",
        },
      ],
    },
    {
      title: "Send them to UnReceipt",
      actions: [
        {
          id: "outlook-action",
          scene: OUTLOOK_SCENES["outlook-action"],
          text: ({ lang }) => (
            <>
              Under <Q label={OUTLOOK.addAction} lang={lang} />, choose <Q label={OUTLOOK.redirectTo} lang={lang} />
            </>
          ),
          hint: ({ lang }) => (
            <>
              Not <Q label={OUTLOOK.forwardTo} lang={lang} />: a redirect keeps the original sender, so we can verify the
              receipt.
            </>
          ),
        },
        {
          id: "outlook-address",
          scene: OUTLOOK_SCENES["outlook-address"],
          text: () => "Paste your UnReceipt address",
          extra: "copy-address",
        },
        {
          id: "outlook-save",
          scene: OUTLOOK_SCENES["outlook-save"],
          text: ({ lang }) => (
            <>
              Click <Q label={OUTLOOK.save} lang={lang} />
            </>
          ),
          hint: () =>
            "Work account? Microsoft 365 blocks forwarding outside the company by default. If you get a bounce email, ask your IT admin to allow it.",
        },
      ],
    },
    TEST,
  ],
  icloud: [
    {
      title: "Open iCloud Mail's rules",
      actions: [
        {
          id: "icloud-open",
          scene: ICLOUD_SCENES["icloud-gear"],
          text: ({ lang }) => (
            <>
              Open iCloud Mail, click the settings button at the top of <Q label={ICLOUD.mailboxes} lang={lang} />, then{" "}
              <Q label={ICLOUD.settings} lang={lang} />
            </>
          ),
          extra: "icloud-open",
          hint: () => "Rules can only be made on iCloud.com in a browser, not in the Mail app.",
        },
        {
          id: "icloud-rules",
          scene: ICLOUD_SCENES["icloud-rules"],
          text: ({ lang }) => (
            <>
              Click <Q label={ICLOUD.rules} lang={lang} />
            </>
          ),
        },
        {
          id: "icloud-add",
          scene: ICLOUD_SCENES["icloud-add"],
          text: ({ lang }) => (
            <>
              Click <Q label={ICLOUD.add} lang={lang} /> (+) at the top right
            </>
          ),
        },
      ],
    },
    {
      title: "Make the first rule",
      actions: [
        {
          id: "icloud-message",
          scene: ICLOUD_SCENES["icloud-message"],
          text: ({ lang, firstWord }) => (
            <>
              Under <Q label={ICLOUD.message} lang={lang} />, choose <Q label={ICLOUD.subjectContains} lang={lang} /> and
              type <strong style={{ fontWeight: 600 }}>{firstWord}</strong>
            </>
          ),
        },
        {
          id: "icloud-action",
          scene: ICLOUD_SCENES["icloud-action"],
          text: ({ lang }) => (
            <>
              Under <Q label={ICLOUD.action} lang={lang} />, choose <Q label={ICLOUD.forwardTo} lang={lang} /> and paste
              your address
            </>
          ),
          extra: "copy-address",
          hint: () => "iCloud forwards rather than redirects, so these receipts wait under Review needed for a quick check.",
        },
        {
          id: "icloud-save",
          scene: ICLOUD_SCENES["icloud-save"],
          text: ({ lang }) => (
            <>
              Click <Q label={ICLOUD.add} lang={lang} />
            </>
          ),
        },
      ],
    },
    {
      title: "Repeat for the other words",
      actions: [
        {
          id: "icloud-repeat",
          scene: ICLOUD_SCENES["icloud-repeat"],
          text: () => "Make one more rule, the same way, for each of these words",
          extra: "icloud-words",
          hint: () => "iCloud takes one word per rule, so a few receipts may slip through. Forward those by hand.",
        },
      ],
    },
    TEST,
  ],
  paid: [
    {
      title: "Check your plan first",
      actions: [
        {
          id: "paid-check",
          scene: null,
          text: () => "Which one do you use?",
          extra: "paid-check",
        },
      ],
    },
  ],
  other: [
    {
      title: "Find rules or filters",
      actions: [
        {
          id: "other-find",
          scene: null,
          text: () => "Open your email in a browser and look in Settings for “Rules” or “Filters”",
          hint: () =>
            "Most providers only offer rules in the browser, not in the app. Some free plans can't forward automatically at all: then forward receipts by hand.",
        },
      ],
    },
    {
      title: "Make the rule",
      actions: [
        {
          id: "other-rule",
          scene: null,
          text: () => "New rule: when the subject contains one of these words, forward or redirect it to your address",
          extra: "other-words",
          hint: () =>
            "If your provider sends a confirmation email to the address, it shows up in UnReceipt under Review needed: open it and tap Original to read it.",
        },
      ],
    },
    TEST,
  ],
};

/** The chapter and action a saved position points at, kept in range. */
export function clampPosition(provider: Provider, step: number, action: number) {
  const chapters = CHAPTERS[provider];
  const s = Math.min(Math.max(0, step), chapters.length - 1);
  const a = Math.min(Math.max(0, action), chapters[s].actions.length - 1);
  return { step: s, action: a };
}
