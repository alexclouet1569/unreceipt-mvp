import type { ContactTopic, DemoRequestLocale } from "@/lib/demo-request";

/**
 * Every word on the contact page (/contact, /sv/kontakt, /fr/contact): the
 * footer's "Contact", a short form (name, email, reason, message) that goes
 * to POST /api/demo-request as kind `contact`. Pure data; the client form
 * gets one language's copy as props, never this module.
 */

export type ContactCopy = {
  meta: { title: string; description: string; shareTitle: string };
  breadcrumb: string;
  hero: { eyebrow: string; title: string; lead: string };
  /** A line under the lead, for people who'd rather see the product. */
  demo: { lead: string; link: string };
  form: {
    title: string;
    name: string;
    email: string;
    topic: string;
    choose: string;
    topics: Record<ContactTopic, string>;
    message: string;
    messagePlaceholder: string;
    submit: string;
    sending: string;
    privacy: string;
    privacyLink: string;
    errors: { invalid: string; rateLimited: string; failed: string };
    /** Under a field the server refused. */
    fieldErrors: Record<"name" | "email" | "topic" | "message", string>;
  };
  sent: {
    title: string;
    reply: string;
    /** Only when the confirmation email went out. */
    confirmation: string;
    another: string;
  };
};

export const CONTACT_COPY: Record<DemoRequestLocale, ContactCopy> = {
  en: {
    meta: {
      title: "Contact UnReceipt",
      description:
        "Send UnReceipt a message: a question about the product, help with your account, a partnership or a press request. We reply by email within one working day.",
      shareTitle: "Contact UnReceipt",
    },
    breadcrumb: "Contact",
    hero: {
      eyebrow: "Contact",
      title: "Write to us",
      lead: "A question, a problem with your account or an idea: tell us here and we'll reply by email within one working day.",
    },
    demo: { lead: "Want to see UnReceipt first?", link: "Book a 20-minute demo" },
    form: {
      title: "Send a message",
      name: "Your name",
      email: "Email",
      topic: "Why are you contacting us?",
      choose: "Choose…",
      topics: {
        product: "A question about UnReceipt",
        support: "Help with my account",
        accountant: "I'm an accountant or accounting firm",
        partnership: "Partnership",
        press: "Press",
        other: "Something else",
      },
      message: "Message",
      messagePlaceholder: "How can we help?",
      submit: "Send message",
      sending: "Sending…",
      privacy: "We use these details only to reply to you, and delete them after 12 months.",
      privacyLink: "Privacy",
      errors: {
        invalid: "Some answers need a look: see the notes under the fields.",
        rateLimited: "Too many messages from this connection. Please try again in an hour.",
        failed: "Something went wrong and your message wasn't sent. Please try again in a moment.",
      },
      fieldErrors: {
        name: "Enter your name, on one line.",
        email: "Enter a valid email address.",
        topic: "Choose why you're contacting us.",
        message: "Write your message, under 2,000 characters.",
      },
    },
    sent: {
      title: "Thanks, we got your message",
      reply: "We'll reply by email within one working day.",
      confirmation: "You'll get a confirmation by email.",
      another: "Send another message",
    },
  },
  sv: {
    meta: {
      title: "Kontakta UnReceipt",
      description:
        "Skicka ett meddelande till UnReceipt: en fråga om tjänsten, hjälp med ditt konto, samarbete eller press. Vi svarar via e-post inom en arbetsdag.",
      shareTitle: "Kontakta UnReceipt",
    },
    breadcrumb: "Kontakt",
    hero: {
      eyebrow: "Kontakt",
      title: "Skriv till oss",
      lead: "En fråga, ett problem med ditt konto eller en idé: berätta här, så svarar vi via e-post inom en arbetsdag.",
    },
    demo: { lead: "Vill du se UnReceipt först?", link: "Boka en demo på 20 minuter" },
    form: {
      title: "Skicka ett meddelande",
      name: "Ditt namn",
      email: "E-post",
      topic: "Vad gäller det?",
      choose: "Välj…",
      topics: {
        product: "En fråga om UnReceipt",
        support: "Hjälp med mitt konto",
        accountant: "Jag är redovisningskonsult eller byrå",
        partnership: "Samarbete",
        press: "Press",
        other: "Något annat",
      },
      message: "Meddelande",
      messagePlaceholder: "Hur kan vi hjälpa till?",
      submit: "Skicka meddelande",
      sending: "Skickar…",
      privacy: "Vi använder uppgifterna bara för att svara dig och raderar dem efter 12 månader.",
      privacyLink: "Integritet",
      errors: {
        invalid: "Några svar behöver ses över: se anteckningarna under fälten.",
        rateLimited: "För många meddelanden från den här anslutningen. Försök igen om en timme.",
        failed: "Något gick fel och meddelandet skickades inte. Försök igen om en stund.",
      },
      fieldErrors: {
        name: "Skriv ditt namn, på en rad.",
        email: "Skriv en giltig e-postadress.",
        topic: "Välj vad det gäller.",
        message: "Skriv ditt meddelande, högst 2 000 tecken.",
      },
    },
    sent: {
      title: "Tack, vi har fått ditt meddelande",
      reply: "Vi svarar via e-post inom en arbetsdag.",
      confirmation: "Du får en bekräftelse via e-post.",
      another: "Skicka ett till meddelande",
    },
  },
  fr: {
    meta: {
      title: "Contacter UnReceipt",
      description:
        "Écrivez à UnReceipt : une question sur le produit, de l’aide avec votre compte, un partenariat ou une demande presse. Nous répondons par e-mail sous un jour ouvré.",
      shareTitle: "Contacter UnReceipt",
    },
    breadcrumb: "Contact",
    hero: {
      eyebrow: "Contact",
      title: "Écrivez-nous",
      lead: "Une question, un souci avec votre compte ou une idée : dites-le-nous ici, nous vous répondons par e-mail sous un jour ouvré.",
    },
    demo: { lead: "Vous voulez d’abord voir UnReceipt ?", link: "Demander une démo de 20 minutes" },
    form: {
      title: "Envoyer un message",
      name: "Votre nom",
      email: "E-mail",
      topic: "Pourquoi nous contactez-vous ?",
      choose: "Choisir…",
      topics: {
        product: "Une question sur UnReceipt",
        support: "De l’aide avec mon compte",
        accountant: "Je suis expert-comptable ou cabinet",
        partnership: "Partenariat",
        press: "Presse",
        other: "Autre chose",
      },
      message: "Message",
      messagePlaceholder: "Comment pouvons-nous vous aider ?",
      submit: "Envoyer le message",
      sending: "Envoi…",
      privacy: "Nous utilisons ces informations uniquement pour vous répondre, et les supprimons après 12 mois.",
      privacyLink: "Confidentialité",
      errors: {
        invalid: "Certaines réponses sont à revoir : voir les notes sous les champs.",
        rateLimited: "Trop de messages depuis cette connexion. Réessayez dans une heure.",
        failed: "Une erreur est survenue et votre message n’a pas été envoyé. Réessayez dans un instant.",
      },
      fieldErrors: {
        name: "Indiquez votre nom, sur une ligne.",
        email: "Indiquez une adresse e-mail valide.",
        topic: "Choisissez l’objet de votre message.",
        message: "Écrivez votre message, 2 000 caractères maximum.",
      },
    },
    sent: {
      title: "Merci, nous avons reçu votre message",
      reply: "Nous vous répondons par e-mail sous un jour ouvré.",
      confirmation: "Vous recevrez une confirmation par e-mail.",
      another: "Envoyer un autre message",
    },
  },
};
