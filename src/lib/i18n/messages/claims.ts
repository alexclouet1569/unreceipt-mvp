import type { Namespace } from "../types";

// /app/claims and the claim PDF.
const en = {
  title: "Expense claim",
  monthNav: "Month",
  previousMonth: (month: string) => `Previous month, ${month}`,
  nextMonth: (month: string) => `Next month, ${month}`,
  empty: (month: string) => `No receipts in ${month}.`,
  intro:
    "Check each line, then copy it into your employer’s expense form. Print the PDF and staple each original receipt next to its number.",
  confirm: (n: number) => `Confirm ${n} suggested line${n === 1 ? "" : "s"}`,
  pending: (n: number) =>
    n === 1
      ? "1 receipt needs review before it goes on the claim."
      : `${n} receipts need review before they go on the claim.`,
  openReceipts: "Open your receipts",
  totals: "Totals",
  total: "Total",
  downloadPdf: "Download claim PDF",
  preparingPdf: "Preparing the PDF…",
  pdfHint:
    "A summary page, then a copy of every receipt with its number. Keep the paper originals: your employer may still ask for them.",
  pdfRateLimited: "You’ve made a lot of claim PDFs. Try again in an hour.",
  pdfFailed: "Couldn’t create the claim PDF. Please try again.",
  saveFailed: "Couldn’t save. Try again.",
  loadFailed: "Couldn’t load this month’s receipts. Reload the page to try again.",
  tooMany: "This month has too many receipts to show as one claim.",
  line: (n: number, merchant: string) => `Line ${n}, ${merchant}`,
  receipt: "Receipt",
  needsReview: "needs review",
  type: "Type",
  place: "Place",
  purpose: "Purpose",
  placePlaceholder: "Town of the trip",
  purposePlaceholder: "Meeting, visit, training…",
  suggested: "Suggested",
  types: {
    lunch: "Lunch",
    dinner: "Dinner",
    overnight: "Overnight stay",
    train: "Train",
    parking: "Parking",
    toll: "Tolls",
    fuel: "Fuel",
    taxi: "Taxi",
    other: "Other",
  },
  pdf: {
    label: "Expense claim",
    no: "No.",
    date: "Date",
    time: "Time",
    place: "Place",
    purpose: "Purpose",
    type: "Type",
    amount: "Amount",
    total: "Total",
    attached: (n: number) =>
      n === 1
        ? "The original receipt is attached, numbered 1 as on this page. A copy follows on the next page."
        : `The ${n} original receipts are attached, numbered 1 to ${n} as on this page. Copies follow on the next pages.`,
    none: "No receipts this month.",
    pending: (n: number) =>
      n === 1
        ? "1 receipt is still waiting for review in UnReceipt and is not on this claim."
        : `${n} receipts are still waiting for review in UnReceipt and are not on this claim.`,
    made: (date: string) => `Made with UnReceipt on ${date}`,
    noPhoto: "No photo of this receipt.",
    emailOriginal:
      "This receipt arrived by email. The original is kept in UnReceipt; print it from there if it must be attached.",
    notEmbeddable: "This receipt is a PDF or WebP file, which can’t be placed here. It is kept in UnReceipt.",
    photoFailed: "The photo couldn’t be loaded.",
    tooManyPhotos: "Too many photos for one file. This one is kept in UnReceipt.",
    tooManyReceipts: (max: number) => `This month has more than ${max} receipts, too many for one claim.`,
  },
};

const fr = {
  title: "Note de frais",
  monthNav: "Mois",
  previousMonth: (month: string) => `Mois précédent, ${month}`,
  nextMonth: (month: string) => `Mois suivant, ${month}`,
  empty: (month: string) => `Aucun reçu en ${month}.`,
  intro:
    "Vérifiez chaque ligne, puis recopiez-la dans le formulaire de frais de votre employeur. Imprimez le PDF et agrafez chaque ticket original à côté de son numéro.",
  confirm: (n: number) => (n === 1 ? "Valider 1 ligne suggérée" : `Valider ${n} lignes suggérées`),
  pending: (n: number) =>
    n === 1
      ? "1 reçu doit être vérifié avant d’entrer dans la note de frais."
      : `${n} reçus doivent être vérifiés avant d’entrer dans la note de frais.`,
  openReceipts: "Ouvrir vos reçus",
  totals: "Totaux",
  total: "Total",
  downloadPdf: "Télécharger la note de frais (PDF)",
  preparingPdf: "Préparation du PDF…",
  pdfHint:
    "Une page récapitulative, puis une copie de chaque reçu avec son numéro. Gardez les tickets papier : votre employeur peut encore les demander.",
  pdfRateLimited: "Vous avez créé beaucoup de PDF. Réessayez dans une heure.",
  pdfFailed: "Impossible de créer le PDF. Veuillez réessayer.",
  saveFailed: "Enregistrement impossible. Réessayez.",
  loadFailed: "Impossible de charger les reçus de ce mois. Rechargez la page pour réessayer.",
  tooMany: "Ce mois compte trop de reçus pour une seule note de frais.",
  line: (n: number, merchant: string) => `Ligne ${n}, ${merchant}`,
  receipt: "Reçu",
  needsReview: "à vérifier",
  type: "Type",
  place: "Lieu",
  purpose: "Motif",
  placePlaceholder: "Ville du déplacement",
  purposePlaceholder: "Réunion, visite, formation…",
  suggested: "Suggéré",
  types: {
    lunch: "Déjeuner",
    dinner: "Dîner",
    overnight: "Nuitée",
    train: "Train",
    parking: "Parking",
    toll: "Péage",
    fuel: "Carburant",
    taxi: "Taxi",
    other: "Autre",
  },
  pdf: {
    label: "Note de frais",
    no: "N°",
    date: "Date",
    time: "Heure",
    place: "Lieu",
    purpose: "Motif",
    type: "Type",
    amount: "Montant",
    total: "Total",
    attached: (n: number) =>
      n === 1
        ? "Le ticket original est joint, numéroté 1 comme sur cette page. Sa copie suit en page suivante."
        : `Les ${n} tickets originaux sont joints, numérotés de 1 à ${n} comme sur cette page. Leurs copies suivent.`,
    none: "Aucun reçu ce mois-ci.",
    pending: (n: number) =>
      n === 1
        ? "1 reçu attend encore d’être vérifié dans UnReceipt et ne figure pas sur cette note."
        : `${n} reçus attendent encore d’être vérifiés dans UnReceipt et ne figurent pas sur cette note.`,
    made: (date: string) => `Créé avec UnReceipt le ${date}`,
    noPhoto: "Pas de photo de ce reçu.",
    emailOriginal:
      "Ce reçu est arrivé par e-mail. L’original est conservé dans UnReceipt ; imprimez-le depuis l’application s’il doit être joint.",
    notEmbeddable: "Ce reçu est un fichier PDF ou WebP, qui ne peut pas être inséré ici. Il est conservé dans UnReceipt.",
    photoFailed: "La photo n’a pas pu être chargée.",
    tooManyPhotos: "Trop de photos pour un seul fichier. Celle-ci est conservée dans UnReceipt.",
    tooManyReceipts: (max: number) => `Ce mois compte plus de ${max} reçus, trop pour une seule note de frais.`,
  },
};

const sv = {
  title: "Utläggsredovisning",
  monthNav: "Månad",
  previousMonth: (month: string) => `Föregående månad, ${month}`,
  nextMonth: (month: string) => `Nästa månad, ${month}`,
  empty: (month: string) => `Inga kvitton i ${month}.`,
  intro:
    "Kontrollera varje rad och för sedan över den till arbetsgivarens utläggsformulär. Skriv ut PDF:en och häfta fast varje originalkvitto vid sitt nummer.",
  confirm: (n: number) => (n === 1 ? "Bekräfta 1 föreslagen rad" : `Bekräfta ${n} föreslagna rader`),
  pending: (n: number) =>
    n === 1
      ? "1 kvitto behöver granskas innan det kommer med i redovisningen."
      : `${n} kvitton behöver granskas innan de kommer med i redovisningen.`,
  openReceipts: "Öppna dina kvitton",
  totals: "Summor",
  total: "Totalt",
  downloadPdf: "Ladda ner redovisningen (PDF)",
  preparingPdf: "Förbereder PDF:en…",
  pdfHint:
    "En sammanställning och sedan en kopia av varje kvitto med sitt nummer. Spara papperskvittona: arbetsgivaren kan fortfarande be om dem.",
  pdfRateLimited: "Du har skapat många PDF:er. Försök igen om en timme.",
  pdfFailed: "Det gick inte att skapa PDF:en. Försök igen.",
  saveFailed: "Det gick inte att spara. Försök igen.",
  loadFailed: "Det gick inte att läsa in månadens kvitton. Ladda om sidan för att försöka igen.",
  tooMany: "Den här månaden har för många kvitton för en redovisning.",
  line: (n: number, merchant: string) => `Rad ${n}, ${merchant}`,
  receipt: "Kvitto",
  needsReview: "behöver granskas",
  type: "Typ",
  place: "Ort",
  purpose: "Syfte",
  placePlaceholder: "Resans ort",
  purposePlaceholder: "Möte, besök, utbildning…",
  suggested: "Förslag",
  types: {
    lunch: "Lunch",
    dinner: "Middag",
    overnight: "Övernattning",
    train: "Tåg",
    parking: "Parkering",
    toll: "Vägavgift",
    fuel: "Drivmedel",
    taxi: "Taxi",
    other: "Övrigt",
  },
  pdf: {
    label: "Utläggsredovisning",
    no: "Nr",
    date: "Datum",
    time: "Tid",
    place: "Ort",
    purpose: "Syfte",
    type: "Typ",
    amount: "Belopp",
    total: "Totalt",
    attached: (n: number) =>
      n === 1
        ? "Originalkvittot bifogas, numrerat 1 som på den här sidan. En kopia följer på nästa sida."
        : `De ${n} originalkvittona bifogas, numrerade 1 till ${n} som på den här sidan. Kopior följer på nästa sidor.`,
    none: "Inga kvitton den här månaden.",
    pending: (n: number) =>
      n === 1
        ? "1 kvitto väntar fortfarande på granskning i UnReceipt och finns inte med här."
        : `${n} kvitton väntar fortfarande på granskning i UnReceipt och finns inte med här.`,
    made: (date: string) => `Skapad med UnReceipt ${date}`,
    noPhoto: "Inget foto av det här kvittot.",
    emailOriginal:
      "Kvittot kom via e-post. Originalet finns i UnReceipt; skriv ut det därifrån om det måste bifogas.",
    notEmbeddable: "Kvittot är en PDF- eller WebP-fil som inte kan placeras här. Det finns kvar i UnReceipt.",
    photoFailed: "Fotot kunde inte läsas in.",
    tooManyPhotos: "För många foton för en fil. Det här finns kvar i UnReceipt.",
    tooManyReceipts: (max: number) => `Den här månaden har fler än ${max} kvitton, för många för en redovisning.`,
  },
};

const claims: Namespace<typeof en> = { en, fr, sv };
export default claims;
