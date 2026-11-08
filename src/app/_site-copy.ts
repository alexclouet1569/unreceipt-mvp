import type { Locale } from "@/lib/locale";

/**
 * Words for the site-wide header and footer of the marketing pages
 * (audience pages and guides; the landing page uses the same footer).
 * Pure data, safe to import from client components.
 */

export type SiteCopy = {
  nav: {
    home: string;
    how: string;
    pricing: string;
    accountants: string;
    freelancers: string;
    signIn: string;
    ctaPilot: string;
    ctaPaid: string;
    menu: string;
    languages: string;
  };
  footer: {
    tagline: string;
    product: string;
    demo: string;
    faq: string;
    whoFor: string;
    smallBusiness: string;
    guides: string;
    guideRetention: string;
    guidePaper: string | null;
    company: string;
    contact: string;
    privacy: string;
    rights: string;
    made: string;
  };
};

export const SITE_COPY: Record<Locale, SiteCopy> = {
  en: {
    nav: {
      home: "Home",
      how: "How it works",
      pricing: "Pricing",
      accountants: "For accountants",
      freelancers: "For freelancers",
      signIn: "Sign in",
      ctaPilot: "Join the pilot",
      ctaPaid: "Start free",
      menu: "Menu",
      languages: "Language",
    },
    footer: {
      tagline:
        "VAT-ready receipts for small businesses, freelancers and their accountants. Paper is Past.",
      product: "Product",
      demo: "Live demo",
      faq: "FAQ",
      whoFor: "Who it's for",
      smallBusiness: "Small businesses",
      guides: "Guides",
      guideRetention: "How long to keep receipts",
      guidePaper: null,
      company: "Company",
      contact: "Contact",
      privacy: "Privacy",
      rights: "All rights reserved.",
      made: "Made with precision in Europe.",
    },
  },
  sv: {
    nav: {
      home: "Start",
      how: "Så funkar det",
      pricing: "Priser",
      accountants: "För redovisningsbyråer",
      freelancers: "För enskild firma",
      signIn: "Logga in",
      ctaPilot: "Gå med i piloten",
      ctaPaid: "Kom igång gratis",
      menu: "Meny",
      languages: "Språk",
    },
    footer: {
      tagline:
        "Kontrollerade kvitton för småföretag, enskilda firmor och deras redovisningsbyråer. Paper is Past.",
      product: "Produkt",
      demo: "Demo",
      faq: "Vanliga frågor",
      whoFor: "För vem",
      smallBusiness: "Småföretag",
      guides: "Guider",
      guideRetention: "Hur länge ska man spara kvitton?",
      guidePaper: "Får man slänga papperskvitton?",
      company: "Om oss",
      contact: "Kontakt",
      privacy: "Integritet",
      rights: "Alla rättigheter förbehållna.",
      made: "Utvecklat i Europa.",
    },
  },
  fr: {
    nav: {
      home: "Accueil",
      how: "Comment ça marche",
      pricing: "Tarifs",
      accountants: "Experts-comptables",
      freelancers: "Indépendants",
      signIn: "Se connecter",
      ctaPilot: "Je participe",
      ctaPaid: "Essai gratuit",
      menu: "Menu",
      languages: "Langue",
    },
    footer: {
      tagline:
        "Des justificatifs vérifiés pour les TPE, les indépendants et leurs experts-comptables. Le papier, c’est du passé.",
      product: "Produit",
      demo: "Démo",
      faq: "FAQ",
      whoFor: "Pour qui",
      smallBusiness: "TPE et PME",
      guides: "Guides",
      guideRetention: "Durée de conservation des justificatifs",
      guidePaper: "Peut-on jeter les tickets de caisse ?",
      company: "Entreprise",
      contact: "Contact",
      privacy: "Confidentialité",
      rights: "Tous droits réservés.",
      made: "Développé en Europe.",
    },
  },
};
