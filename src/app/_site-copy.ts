import type { Locale } from "@/lib/locale";

/**
 * Words for the site-wide header and footer of the marketing pages
 * (audience pages and guides; the landing page uses the same footer).
 * Pure data, safe to import from client components.
 */

type AudienceItem = { title: string; sub: string };

export type SiteCopy = {
  nav: {
    home: string;
    how: string;
    pricing: string;
    accountants: string;
    freelancers: string;
    faq: string;
    about: string;
    demo: string;
    signIn: string;
    ctaPilot: string;
    ctaPaid: string;
    menu: string;
    languages: string;
  };
  /**
   * The pill under the header on the home and audience pages: small
   * businesses (the home page), freelancers, accounting firms, in that order.
   */
  audiences: {
    label: string;
    items: [AudienceItem, AudienceItem, AudienceItem];
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
    about: string;
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
      faq: "FAQ",
      about: "About",
      demo: "See the demo",
      signIn: "Sign in",
      ctaPilot: "Get started free",
      ctaPaid: "Start free",
      menu: "Menu",
      languages: "Language",
    },
    audiences: {
      label: "Who it's for",
      items: [
        { title: "Small businesses", sub: "Owners and their teams" },
        { title: "Freelancers", sub: "Sole traders and consultants" },
        { title: "Accounting firms", sub: "Every client's receipts" },
      ],
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
      about: "About UnReceipt",
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
      faq: "Vanliga frågor",
      about: "Om oss",
      demo: "Se demon",
      signIn: "Logga in",
      ctaPilot: "Kom igång gratis",
      ctaPaid: "Kom igång gratis",
      menu: "Meny",
      languages: "Språk",
    },
    audiences: {
      label: "För vem",
      items: [
        { title: "Småföretag", sub: "Ägare och anställda" },
        { title: "Enskild firma", sub: "Frilansare och konsulter" },
        { title: "Redovisningsbyråer", sub: "Alla kunders kvitton" },
      ],
    },
    footer: {
      tagline:
        "Kvitton med momsen klar för småföretag, enskilda firmor och deras redovisningsbyråer. Paper is Past.",
      product: "Produkt",
      demo: "Demo",
      faq: "Vanliga frågor",
      whoFor: "För vem",
      smallBusiness: "Småföretag",
      guides: "Guider",
      guideRetention: "Hur länge ska man spara kvitton?",
      guidePaper: "Får man slänga papperskvitton?",
      company: "Om oss",
      about: "Om UnReceipt",
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
      faq: "FAQ",
      about: "À propos",
      demo: "Voir la démo",
      signIn: "Se connecter",
      ctaPilot: "Commencer",
      ctaPaid: "Essai gratuit",
      menu: "Menu",
      languages: "Langue",
    },
    audiences: {
      label: "Pour qui",
      items: [
        { title: "TPE", sub: "Dirigeants et équipes" },
        { title: "Indépendants", sub: "Freelances et consultants" },
        { title: "Experts-comptables", sub: "Les reçus de chaque client" },
      ],
    },
    footer: {
      tagline:
        "Des justificatifs avec la TVA relevée pour les TPE, les indépendants et leurs experts-comptables. Le papier, c’est du passé.",
      product: "Produit",
      demo: "Démo",
      faq: "FAQ",
      whoFor: "Pour qui",
      smallBusiness: "TPE",
      guides: "Guides",
      guideRetention: "Durée de conservation des justificatifs",
      guidePaper: "Peut-on jeter les tickets de caisse ?",
      company: "Entreprise",
      about: "À propos",
      contact: "Contact",
      privacy: "Confidentialité",
      rights: "Tous droits réservés.",
      made: "Développé en Europe.",
    },
  },
};
