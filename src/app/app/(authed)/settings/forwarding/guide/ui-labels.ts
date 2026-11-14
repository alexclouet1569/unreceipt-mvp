// Button and menu names in Gmail, Outlook, iCloud and phone mail apps, in
// the three languages our customers' email is in. The setup guide quotes
// them in its steps and draws them in its pictures, so a Swedish or French
// user sees the words their own screen shows.
//
// Sources (read 2026-11-08, re-checked 2026-11-09):
//   Gmail   support.google.com/mail/answer/10957 (forwarding), /6579
//           (filters) and /90559 (screen-reader guide, which names the
//           buttons), hl=en|sv|fr; Swedish and French tutorials quoting the
//           real screens (pctidningen.se, manual.umu.se, windows8facile.fr,
//           posteo.de/fr, pcastuces.com); Workspace answer 9282734 (fr)
//   Outlook support.microsoft.com sv-se|fr-fr "Manage email messages by
//           using rules in Outlook" and "Use rules to automatically forward
//           messages"; Microsoft Q&A threads; letsignit.com/fr
//   iCloud  support.apple.com/guide/icloud mm6b1a3f8a and mm6b1a3960,
//           en-us|sv-se|fr-fr
//   Phones  support.apple.com iPhone guide iph3caef30a, iph742b6abb1 and
//           104971; Gmail app answer 15162918; Microsoft "switch between
//           reply all, reply, forward", sv-se|fr-fr
// Google's and Microsoft's Swedish and French pages say they may be machine
// translated, so a label counts as verified only when the help page and an
// independent page quoting the real screen agree. `verified: false` marks
// the rest: our best reading, still to check on a real screen in that
// language (the comment says which language is the doubtful one). When
// Gmail or Outlook renames something, change it here: steps and pictures
// both read from this file.

export type MailLang = "en" | "sv" | "fr";

export const MAIL_LANGS: { id: MailLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Svenska" },
  { id: "fr", label: "Français" },
];

export const LABELS_LAST_CHECKED = "2026-11-09";

export type UiLabel = { en: string; sv: string; fr: string; verified: boolean };

const l = (en: string, sv: string, fr: string, verified = true): UiLabel => ({ en, sv, fr, verified });

export const GMAIL = {
  settings: l("Settings", "Inställningar", "Paramètres"),
  seeAllSettings: l("See all settings", "Visa alla inställningar", "Voir tous les paramètres"),
  forwardingTab: l("Forwarding and POP/IMAP", "Vidarebefordran och POP/IMAP", "Transfert et POP/IMAP"),
  addForwardingAddress: l(
    "Add a forwarding address",
    "Lägg till en adress för vidarebefordran",
    "Ajouter une adresse de transfert",
  ),
  // The word is confirmed; the colon isn't.
  forwardingSection: l("Forwarding:", "Vidarebefordran:", "Transfert :", false),
  next: l("Next", "Nästa", "Suivant"),
  cancel: l("Cancel", "Avbryt", "Annuler", false),
  confirmForwarding: l("Forward mail to", "Vidarebefordra e-post till", "Transférer les e-mails à", false),
  proceed: l("Proceed", "Fortsätt", "Continuer"),
  ok: l("OK", "OK", "OK"),
  disableForwarding: l("Disable forwarding", "Inaktivera vidarebefordran", "Désactiver le transfert"),
  forwardCopy: l(
    "Forward a copy of incoming mail to",
    "Vidarebefordra en kopia av inkommande e-post till",
    "Transférer une copie des messages reçus à",
  ),
  // FR confirmed ("Valider", next to the "Code de confirmation" box); SV not.
  verify: l("Verify", "Verifiera", "Valider", false),
  // The button on Google's confirmation page (mail-settings.google.com/mail/
  // vf-…), which follows the Google account's language. Not yet checked on
  // a real screen in any language.
  confirmPage: l("Confirm", "Bekräfta", "Confirmer", false),
  filtersTab: l("Filters and Blocked Addresses", "Filter och blockerade adresser", "Filtres et adresses bloquées"),
  // SV confirmed from a screenshot; FR only from Google community experts.
  createNewFilter: l("Create a new filter", "Skapa ett nytt filter", "Créer un filtre", false),
  from: l("From", "Från", "De"),
  subject: l("Subject", "Ämne", "Objet"),
  hasTheWords: l("Has the words", "Innehåller orden", "Contient les mots"),
  createFilter: l("Create filter", "Skapa filter", "Créer un filtre"),
  search: l("Search", "Sök", "Rechercher"),
  // The filter checkbox. FR tutorials quote "Transférer à :"; no source
  // shows a "till" after the Swedish one.
  forwardIt: l("Forward it to", "Vidarebefordra", "Transférer à", false),
  skipInbox: l(
    "Skip the Inbox (Archive it)",
    "Hoppa över inkorgen (arkivera det)",
    "Ne pas afficher dans la boîte de réception (Archiver)",
  ),
  markAsRead: l("Mark as read", "Markera som läst", "Marquer comme lu"),
  // SV "Stjärnmärk den" from Google's help; one screenshot reads differently.
  starIt: l("Star it", "Stjärnmärk den", "Activer le suivi", false),
} as const;

export const OUTLOOK = {
  settings: l("Settings", "Inställningar", "Paramètres"),
  mail: l("Mail", "E-post", "Courrier"),
  rules: l("Rules", "Regler", "Règles"),
  addNewRule: l("Add new rule", "Lägg till ny regel", "Ajouter une nouvelle règle"),
  // FR confirmed; SV from Microsoft's help and a Q&A answer only.
  name: l("Name your rule", "Namnge regeln", "Nommez votre règle", false),
  addCondition: l("Add a condition", "Lägg till ett villkor", "Ajouter une condition"),
  // Both best supported, neither seen on a screen: Microsoft's own pages
  // also use "Ämnet omfattar" and "La matière comprend" (machine translated).
  subjectIncludes: l("Subject includes", "Ämnet innehåller", "L'objet inclut", false),
  addAction: l("Add an action", "Lägg till en åtgärd", "Ajouter une action"),
  redirectTo: l("Redirect to", "Omdirigera till", "Rediriger vers"),
  forwardTo: l("Forward to", "Vidarebefordra till", "Transférer vers"),
  save: l("Save", "Spara", "Enregistrer"),
} as const;

export const ICLOUD = {
  settings: l("Settings", "Inställningar", "Réglages"),
  mailboxes: l("Mailboxes", "Brevlådor", "Boîtes aux lettres"),
  rules: l("Rules", "Regler", "Règles"),
  add: l("Add", "Lägg till", "Ajouter"),
  message: l("Message", "Meddelande", "Message"),
  action: l("Action", "Åtgärd", "Action"),
  // Apple's guides don't name these menu items in any language. The English
  // ones come from write-ups of the earlier iCloud.com, where the action was
  // "Forward to"; the Swedish and French ones are our translations.
  subjectContains: l("has subject containing", "har ett ämne som innehåller", "a un objet contenant", false),
  forwardTo: l("Forward to", "Vidarebefordra till", "Transférer à", false),
} as const;

// The phone apps follow the phone's language.
export const PHONE = {
  forward: l("Forward", "Vidarebefordra", "Transférer"),
  to: l("To:", "Till:", "À :"),
  reply: l("Reply", "Svara", "Répondre"),
  // French iPhone Mail names the mailbox "Réception".
  inbox: l("Inbox", "Inkorg", "Réception"),
} as const;

export function say(label: UiLabel, lang: MailLang): string {
  return label[lang];
}

/** The language a browser most likely shows its user's email in. */
export function guessMailLang(languages: readonly string[] | undefined): MailLang {
  for (const tag of languages ?? []) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "sv") return "sv";
    if (base === "fr") return "fr";
    if (base === "en") return "en";
  }
  return "en";
}
