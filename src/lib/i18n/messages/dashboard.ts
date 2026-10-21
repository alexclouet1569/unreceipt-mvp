import type { Namespace } from "../types";

// /app: the receipts inbox, first-run onboarding, banners and list cards.
const en = {
  expenseClaim: "Expense claim",
  title: "Your receipts",
  stats: {
    receipts: "Receipts",
    verified: "Verified",
    thisMonth: "This month",
  },
  filterReceipts: "Filter receipts",
  all: "All",
  reviewNeeded: "Review needed",
  nothingToReview: "Nothing to review — every receipt has the fields it needs.",
  groupReceipts: "Group receipts",
  byDate: "By date",
  byCategory: "By category",
  empty: {
    title: "Your inbox is empty",
    pitchSms: "Forward email receipts or text us a photo. We'll have them VAT-ready in minutes.",
    pitch: "Forward email receipts or snap a paper one. We'll have them VAT-ready in minutes.",
    forwardTo: "Forward email receipts to",
    copyForwarding: "Copy forwarding address",
    textTo: "Or text a photo to",
    copySms: "Copy concierge SMS number",
    capturePaper: "Or capture a paper receipt",
    tagline: "Paper is past.",
  },
  firstRun: {
    step: (step: number) => `Step ${step} of 3`,
    addressTitle: "Your private receipts address",
    addressBody:
      "Every email sent to this address becomes a receipt in UnReceipt: we read the shop, date, total and VAT. Forward receipts by hand, or set a rule once in your email so they arrive by themselves.",
    next: "Next",
    skipIntro: "Skip intro",
    snapTitle: "Snap your first receipt",
    snapBody:
      "Take a photo of a paper receipt or upload a PDF. We read the shop, date, total and VAT for you — you check and save.",
    takePhoto: "Take a photo",
    later: "I'll do it later",
    doneTitle: "You're all set",
    doneBody:
      "Every receipt you forward or snap shows up here. Open one to download its PDF; Settings has a monthly export for your accountant.",
    goToReceipts: "Go to my receipts",
    guideLink: "Make it automatic, step by step (3 min)",
  },
  pilotBanner:
    "You're using the UnReceipt free pilot. When we open paid access in the coming weeks, we'll send you a heads-up. Until then, every receipt you forward gets concierge processing within 24 hours.",
  dismiss: "Dismiss",
  dbWarning: {
    before: "We're having trouble verifying your account status right now. You can keep using the dashboard — if you see anything off, email ",
    after: ".",
  },
  selfHeal: {
    title: "Setting up your account…",
    body: "Just a moment while we finish your subscription.",
  },
  error: {
    title: "Something went wrong",
    body: "This page hit an unexpected error. Try again — if it keeps happening, reload the page or come back in a moment.",
    tryAgain: "Try again",
    reference: (digest: string) => `Reference: ${digest}`,
  },
  usage: {
    warn: (used: number, allowance: number, plan: string) =>
      `You've used ${used} of the ${allowance} receipts in your ${plan} plan this period. Extra receipts are `,
    each: " each.",
    over: (extra: number, plan: string, allowance: number) =>
      `You're ${extra} receipt${extra === 1 ? "" : "s"} over your ${plan} plan (${allowance} a month). Extra receipts are `,
    eachSoFar: " each — ",
    soFar: " so far, on your next invoice.",
    overUnbilled: (extra: number, plan: string, allowance: number) =>
      `You're ${extra} receipt${extra === 1 ? "" : "s"} over your ${plan} plan (${allowance} a month). Everything is still saved.`,
    seeUsage: "See usage in settings",
  },
  item: {
    unknownMerchant: "Unknown merchant",
    needsReview: "needs review",
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    daysAgo: (n: number) => `${n}d ago`,
  },
  captureReceipt: "Capture receipt",
};

const fr = {
  expenseClaim: "Note de frais",
  title: "Vos reçus",
  stats: {
    receipts: "Reçus",
    verified: "Vérifiés",
    thisMonth: "Ce mois-ci",
  },
  filterReceipts: "Filtrer les reçus",
  all: "Tous",
  reviewNeeded: "À vérifier",
  nothingToReview: "Rien à vérifier : chaque reçu a tous ses champs.",
  groupReceipts: "Regrouper les reçus",
  byDate: "Par date",
  byCategory: "Par catégorie",
  empty: {
    title: "Votre boîte est vide",
    pitchSms: "Transférez vos reçus par e-mail ou envoyez-nous une photo par SMS. Ils seront prêts pour la TVA en quelques minutes.",
    pitch: "Transférez vos reçus par e-mail ou photographiez un ticket papier. Ils seront prêts pour la TVA en quelques minutes.",
    forwardTo: "Transférez vos reçus à",
    copyForwarding: "Copier l’adresse de transfert",
    textTo: "Ou envoyez une photo par SMS au",
    copySms: "Copier le numéro SMS",
    capturePaper: "Ou photographiez un ticket papier",
    tagline: "Le papier, c’est fini.",
  },
  firstRun: {
    step: (step: number) => `Étape ${step} sur 3`,
    addressTitle: "Votre adresse privée pour les reçus",
    addressBody:
      "Chaque e-mail envoyé à cette adresse devient un reçu dans UnReceipt : nous lisons le commerçant, la date, le total et la TVA. Transférez vos reçus à la main, ou créez une règle une fois pour toutes dans votre messagerie.",
    next: "Suivant",
    skipIntro: "Passer l’introduction",
    snapTitle: "Photographiez votre premier reçu",
    snapBody:
      "Prenez en photo un ticket papier ou importez un PDF. Nous lisons le commerçant, la date, le total et la TVA ; vous vérifiez et enregistrez.",
    takePhoto: "Prendre une photo",
    later: "Plus tard",
    doneTitle: "Tout est prêt",
    doneBody:
      "Chaque reçu transféré ou photographié apparaît ici. Ouvrez-en un pour télécharger son PDF ; les Réglages proposent un export mensuel pour votre comptable.",
    goToReceipts: "Voir mes reçus",
    guideLink: "L’automatiser, étape par étape (3 min)",
  },
  pilotBanner:
    "Vous utilisez le pilote gratuit d’UnReceipt. Nous vous préviendrons avant l’ouverture de l’accès payant dans les semaines à venir. D’ici là, chaque reçu transféré est traité par notre équipe sous 24 heures.",
  dismiss: "Fermer",
  dbWarning: {
    before: "Nous n’arrivons pas à vérifier l’état de votre compte pour le moment. Vous pouvez continuer à utiliser l’application ; si quelque chose vous semble anormal, écrivez à ",
    after: ".",
  },
  selfHeal: {
    title: "Configuration de votre compte…",
    body: "Un instant, nous finalisons votre abonnement.",
  },
  error: {
    title: "Une erreur s’est produite",
    body: "Cette page a rencontré une erreur inattendue. Réessayez ; si le problème persiste, rechargez la page ou revenez dans un instant.",
    tryAgain: "Réessayer",
    reference: (digest: string) => `Référence : ${digest}`,
  },
  usage: {
    warn: (used: number, allowance: number, plan: string) =>
      `Vous avez utilisé ${used} des ${allowance} reçus de votre formule ${plan} sur cette période. Les reçus supplémentaires coûtent `,
    each: " l’unité.",
    over: (extra: number, plan: string, allowance: number) =>
      `Vous dépassez votre formule ${plan} (${allowance} par mois) de ${extra} reçu${extra === 1 ? "" : "s"}. Les reçus supplémentaires coûtent `,
    eachSoFar: " l’unité, soit ",
    soFar: " pour l’instant, sur votre prochaine facture.",
    overUnbilled: (extra: number, plan: string, allowance: number) =>
      `Vous dépassez votre formule ${plan} (${allowance} par mois) de ${extra} reçu${extra === 1 ? "" : "s"}. Tout reste enregistré.`,
    seeUsage: "Voir l’utilisation dans les réglages",
  },
  item: {
    unknownMerchant: "Commerçant inconnu",
    needsReview: "à vérifier",
    minutesAgo: (n: number) => `il y a ${n} min`,
    hoursAgo: (n: number) => `il y a ${n} h`,
    daysAgo: (n: number) => `il y a ${n} j`,
  },
  captureReceipt: "Ajouter un reçu",
};

const sv = {
  expenseClaim: "Utläggsredovisning",
  title: "Dina kvitton",
  stats: {
    receipts: "Kvitton",
    verified: "Verifierade",
    thisMonth: "Den här månaden",
  },
  filterReceipts: "Filtrera kvitton",
  all: "Alla",
  reviewNeeded: "Behöver granskas",
  nothingToReview: "Inget att granska – alla kvitton har de uppgifter som behövs.",
  groupReceipts: "Gruppera kvitton",
  byDate: "Efter datum",
  byCategory: "Efter kategori",
  empty: {
    title: "Din inkorg är tom",
    pitchSms: "Vidarebefordra e-postkvitton eller sms:a oss ett foto. Vi gör dem momsklara på några minuter.",
    pitch: "Vidarebefordra e-postkvitton eller fota ett papperskvitto. Vi gör dem momsklara på några minuter.",
    forwardTo: "Vidarebefordra e-postkvitton till",
    copyForwarding: "Kopiera vidarebefordringsadressen",
    textTo: "Eller sms:a ett foto till",
    copySms: "Kopiera sms-numret",
    capturePaper: "Eller fota ett papperskvitto",
    tagline: "Papper är förbi.",
  },
  firstRun: {
    step: (step: number) => `Steg ${step} av 3`,
    addressTitle: "Din privata kvittoadress",
    addressBody:
      "Varje mejl som skickas till den här adressen blir ett kvitto i UnReceipt: vi läser butik, datum, summa och moms. Vidarebefordra kvitton för hand, eller skapa en regel i din e-post en gång så kommer de av sig själva.",
    next: "Nästa",
    skipIntro: "Hoppa över introduktionen",
    snapTitle: "Fota ditt första kvitto",
    snapBody:
      "Ta ett foto av ett papperskvitto eller ladda upp en PDF. Vi läser butik, datum, summa och moms åt dig – du kontrollerar och sparar.",
    takePhoto: "Ta ett foto",
    later: "Jag gör det senare",
    doneTitle: "Allt är klart",
    doneBody:
      "Alla kvitton du vidarebefordrar eller fotar hamnar här. Öppna ett för att ladda ner dess PDF; under Inställningar finns en månadsexport till din redovisningskonsult.",
    goToReceipts: "Till mina kvitton",
    guideLink: "Gör det automatiskt, steg för steg (3 min)",
  },
  pilotBanner:
    "Du använder UnReceipts gratis pilot. När vi öppnar betald tillgång de kommande veckorna säger vi till i förväg. Fram till dess hanteras varje kvitto du vidarebefordrar av oss inom 24 timmar.",
  dismiss: "Stäng",
  dbWarning: {
    before: "Vi har problem att kontrollera din kontostatus just nu. Du kan fortsätta använda appen – om något ser konstigt ut, mejla ",
    after: ".",
  },
  selfHeal: {
    title: "Vi gör i ordning ditt konto…",
    body: "Ett ögonblick medan vi slutför ditt abonnemang.",
  },
  error: {
    title: "Något gick fel",
    body: "Sidan stötte på ett oväntat fel. Försök igen – om det fortsätter, ladda om sidan eller kom tillbaka om en stund.",
    tryAgain: "Försök igen",
    reference: (digest: string) => `Referens: ${digest}`,
  },
  usage: {
    warn: (used: number, allowance: number, plan: string) =>
      `Du har använt ${used} av de ${allowance} kvittona i ditt ${plan}-abonnemang den här perioden. Extra kvitton kostar `,
    each: " styck.",
    over: (extra: number, plan: string, allowance: number) =>
      `Du ligger ${extra} ${extra === 1 ? "kvitto" : "kvitton"} över ditt ${plan}-abonnemang (${allowance} i månaden). Extra kvitton kostar `,
    eachSoFar: " styck – ",
    soFar: " hittills, på nästa faktura.",
    overUnbilled: (extra: number, plan: string, allowance: number) =>
      `Du ligger ${extra} ${extra === 1 ? "kvitto" : "kvitton"} över ditt ${plan}-abonnemang (${allowance} i månaden). Allt sparas ändå.`,
    seeUsage: "Se användningen i inställningarna",
  },
  item: {
    unknownMerchant: "Okänd butik",
    needsReview: "behöver granskas",
    minutesAgo: (n: number) => `${n} min sedan`,
    hoursAgo: (n: number) => `${n} tim sedan`,
    daysAgo: (n: number) => `${n} d sedan`,
  },
  captureReceipt: "Lägg till kvitto",
};

const dashboard: Namespace<typeof en> = { en, fr, sv };
export default dashboard;
