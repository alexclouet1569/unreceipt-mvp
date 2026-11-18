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
    smallBusiness: string;
    bookDemo: string;
    faq: string;
    about: string;
    signIn: string;
    ctaPilot: string;
    ctaPaid: string;
    menu: string;
    languages: string;
  };
  /**
   * The tabs at the top of the hero on the home and audience pages, and the
   * list in the mobile menu: small businesses, freelancers, accounting firms,
   * in that order.
   */
  audiences: {
    label: string;
    items: [AudienceItem, AudienceItem, AudienceItem];
  };
  footer: {
    tagline: string;
    product: string;
    faq: string;
    whoFor: string;
    smallBusiness: string;
    guides: string;
    allGuides: string;
    guideRetention: string;
    guidePaper: string | null;
    guideOutlays: string | null;
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
      smallBusiness: "For small businesses",
      bookDemo: "Book a demo",
      faq: "FAQ",
      about: "About",
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
      faq: "FAQ",
      whoFor: "Who it's for",
      smallBusiness: "Small businesses",
      guides: "Guides",
      allGuides: "All guides",
      guideRetention: "How long to keep receipts",
      guidePaper: null,
      guideOutlays: null,
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
      accountants: "Redovisningsbyråer",
      freelancers: "Enskild firma",
      smallBusiness: "Småföretag",
      bookDemo: "Boka demo",
      faq: "Vanliga frågor",
      about: "Om oss",
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
      faq: "Vanliga frågor",
      whoFor: "För vem",
      smallBusiness: "Småföretag",
      guides: "Guider",
      allGuides: "Alla guider",
      guideRetention: "Hur länge ska man spara kvitton?",
      guidePaper: "Får man slänga papperskvitton?",
      guideOutlays: "Utlägg för anställda",
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
      smallBusiness: "TPE",
      bookDemo: "Demander une démo",
      faq: "FAQ",
      about: "À propos",
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
      faq: "FAQ",
      whoFor: "Pour qui",
      smallBusiness: "TPE",
      guides: "Guides",
      allGuides: "Tous les guides",
      guideRetention: "Durée de conservation des justificatifs",
      guidePaper: "Peut-on jeter les tickets de caisse ?",
      guideOutlays: null,
      company: "Entreprise",
      about: "À propos",
      contact: "Contact",
      privacy: "Confidentialité",
      rights: "Tous droits réservés.",
      made: "Développé en Europe.",
    },
  },
};
