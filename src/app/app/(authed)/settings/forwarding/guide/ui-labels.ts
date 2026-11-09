// Button and menu names in Gmail, Outlook, iCloud and phone mail apps, in
// the three languages our customers' email is in. The setup guide quotes
// them in its steps and draws them in its pictures, so a Swedish or French
// user sees the words their own screen shows.
//
// Sources (read 2026-11-08):
//   Gmail   support.google.com/mail/answer/10957 and /6579, hl=en|sv|fr
//   Outlook support.microsoft.com "Manage email messages by using rules in
//           Outlook", en-us|sv-se|fr-fr
//   iCloud  support.apple.com/guide/icloud mm6b1a3f8a and mm6b1a3960,
//           en-us|sv-se|fr-fr
// Google's and Microsoft's Swedish and French pages say they may be machine
// translated. `verified: false` marks labels no official page states; they
// are our best reading of the product and need checking on a real screen
// in that language. When Gmail or Outlook renames something, change it
// here: steps and pictures both read from this file.

export type MailLang = "en" | "sv" | "fr";

export const MAIL_LANGS: { id: MailLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "sv", label: "Svenska" },
  { id: "fr", label: "Français" },
];

export const LABELS_LAST_CHECKED = "2026-11-08";

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
  verify: l("Verify", "Verifiera", "Valider", false),
  filtersTab: l("Filters and Blocked Addresses", "Filter och blockerade adresser", "Filtres et adresses bloquées"),
  createNewFilter: l("Create a new filter", "Skapa ett nytt filter", "Créer un filtre", false),
  from: l("From", "Från", "De", false),
  subject: l("Subject", "Ämne", "Objet", false),
  hasTheWords: l("Has the words", "Innehåller orden", "Contient les mots", false),
  createFilter: l("Create filter", "Skapa filter", "Créer un filtre"),
  search: l("Search", "Sök", "Rechercher"),
  forwardIt: l("Forward it", "Vidarebefordra", "Transférer"),
  skipInbox: l("Skip the Inbox", "Hoppa över inkorgen", "Ignorer la boîte de réception", false),
  markAsRead: l("Mark as read", "Markera som läst", "Marquer comme lu", false),
  starIt: l("Star it", "Stjärnmärk", "Activer le suivi", false),
} as const;

export const OUTLOOK = {
  settings: l("Settings", "Inställningar", "Paramètres"),
  mail: l("Mail", "E-post", "Courrier", false),
  rules: l("Rules", "Regler", "Règles", false),
  addNewRule: l("Add new rule", "Lägg till ny regel", "Ajouter une nouvelle règle"),
  name: l("Name your rule", "Ge regeln ett namn", "Nommer votre règle", false),
  addCondition: l("Add a condition", "Lägg till ett villkor", "Ajouter une condition"),
  subjectIncludes: l("Subject includes", "Ämnet innehåller", "L'objet contient", false),
  addAction: l("Add an action", "Lägg till en åtgärd", "Ajouter une action"),
  redirectTo: l("Redirect to", "Omdirigera till", "Rediriger vers", false),
  forwardTo: l("Forward to", "Vidarebefordra till", "Transférer à", false),
  save: l("Save", "Spara", "Enregistrer"),
} as const;

export const ICLOUD = {
  settings: l("Settings", "Inställningar", "Réglages"),
  mailboxes: l("Mailboxes", "Brevlådor", "Boîtes aux lettres"),
  rules: l("Rules", "Regler", "Règles"),
  add: l("Add", "Lägg till", "Ajouter"),
  message: l("Message", "Meddelande", "Message"),
  action: l("Action", "Åtgärd", "Action"),
  subjectContains: l("has a subject containing", "har ett ämne som innehåller", "a un objet contenant", false),
  forwardTo: l("Forward to an email address", "Vidarebefordra till en e-postadress", "Transférer à une adresse e-mail", false),
} as const;

// The phone apps follow the phone's language.
export const PHONE = {
  forward: l("Forward", "Vidarebefordra", "Transférer"),
  to: l("To:", "Till:", "À :", false),
  reply: l("Reply", "Svara", "Répondre", false),
  inbox: l("Inbox", "Inkorg", "Boîte de réception", false),
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
