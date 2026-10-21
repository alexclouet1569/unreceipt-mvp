import type { Namespace } from "../types";

// Words shared by every product screen: categories, day groups, buttons.
const en = {
  categories: {
    meals: "Meals & dining",
    transport: "Transport",
    accommodation: "Accommodation",
    office_supplies: "Office supplies",
    software: "Software & SaaS",
    client_entertainment: "Client entertainment",
    travel: "Travel",
    other: "Other",
  },
  dayGroups: {
    today: "Today",
    yesterday: "Yesterday",
    thisWeek: "This week",
    earlierIn: (month: string) => `Earlier in ${month}`,
    earlier: "Earlier",
  },
  backToReceipts: "Back to receipts",
  settings: "Settings",
  close: "Close",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  tryAgain: "Try again",
  networkError: "Network error. Check your connection and try again.",
  genericError: "Something went wrong. Please try again.",
  noDate: "No date",
  language: "Language",
};

const fr = {
  categories: {
    meals: "Repas & restaurants",
    transport: "Transport",
    accommodation: "Hébergement",
    office_supplies: "Fournitures de bureau",
    software: "Logiciels & SaaS",
    client_entertainment: "Réceptions clients",
    travel: "Voyages",
    other: "Autre",
  },
  dayGroups: {
    today: "Aujourd’hui",
    yesterday: "Hier",
    thisWeek: "Cette semaine",
    earlierIn: (month: string) => `Plus tôt en ${month}`,
    earlier: "Plus tôt",
  },
  backToReceipts: "Retour aux reçus",
  settings: "Réglages",
  close: "Fermer",
  cancel: "Annuler",
  save: "Enregistrer",
  saving: "Enregistrement…",
  tryAgain: "Réessayer",
  networkError: "Erreur réseau. Vérifiez votre connexion et réessayez.",
  genericError: "Une erreur s’est produite. Veuillez réessayer.",
  noDate: "Sans date",
  language: "Langue",
};

const sv = {
  categories: {
    meals: "Mat & restaurang",
    transport: "Transport",
    accommodation: "Boende",
    office_supplies: "Kontorsmaterial",
    software: "Mjukvara & SaaS",
    client_entertainment: "Representation",
    travel: "Resor",
    other: "Övrigt",
  },
  dayGroups: {
    today: "Idag",
    yesterday: "Igår",
    thisWeek: "Den här veckan",
    earlierIn: (month: string) => `Tidigare i ${month}`,
    earlier: "Tidigare",
  },
  backToReceipts: "Tillbaka till kvitton",
  settings: "Inställningar",
  close: "Stäng",
  cancel: "Avbryt",
  save: "Spara",
  saving: "Sparar…",
  tryAgain: "Försök igen",
  networkError: "Nätverksfel. Kontrollera anslutningen och försök igen.",
  genericError: "Något gick fel. Försök igen.",
  noDate: "Inget datum",
  language: "Språk",
};

const common: Namespace<typeof en> = { en, fr, sv };
export default common;
