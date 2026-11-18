import type { BookkeepingOption, DemoRequestLocale, EmployeeBand, RequestKind } from "@/lib/demo-request";

/**
 * Every word on the demo request page (/book-demo, /sv/boka-demo,
 * /fr/demander-une-demo), the contact block at the end of the home and
 * audience pages, the form they share and its thank-you state. Pure data;
 * client components get one language's copy as props, never this module.
 * Honest by rule: the team feature is in pilot, there is no bookkeeping
 * integration, and nothing here quotes a customer we don't have.
 */

export type DemoRequestCopy = {
  meta: { title: string; description: string; shareTitle: string };
  breadcrumb: string;
  hero: { eyebrow: string; title: string; accent: string; lead: string };
  steps: { title: string; items: [string, string, string, string] };
  notes: {
    title: string;
    items: [{ title: string; desc: string }, { title: string; desc: string }];
    selfServe: { title: string; desc: string; signupPilot: string; signupPaid: string };
  };
  /** The contact block at the end of the home and audience pages. */
  contact: { eyebrow: string; title: string; lead: string; signupLead: string };
  form: {
    title: string;
    /** "What can we help with?" and its two answers. */
    kindLegend: string;
    kinds: Record<RequestKind, string>;
    name: string;
    company: string;
    email: string;
    phone: string;
    optional: string;
    employees: string;
    employeeOptions: Record<EmployeeBand, string>;
    bookkeeping: string;
    bookkeepingOptions: Record<BookkeepingOption, string>;
    choose: string;
    hasAccountant: string;
    yes: string;
    no: string;
    message: string;
    messagePlaceholders: Record<RequestKind, string>;
    /** After "(…)" next to a field that is optional for another request. */
    optionalForQuestion: string;
    submit: string;
    sending: string;
    privacy: string;
    privacyLink: string;
    errors: { invalid: string; rateLimited: string; failed: string };
    /** Under a field the server refused. */
    fieldErrors: Record<
      "name" | "company" | "email" | "phone" | "employees" | "bookkeeping" | "hasAccountant" | "message",
      string
    >;
  };
  sent: {
    title: string;
    /** After another request (no booking link). */
    titleQuestion: string;
    questionText: string;
    text: string;
    bookLead: string;
    book: string;
    newTab: string;
    noBooking: string;
  };
};

export const DEMO_REQUEST_COPY: Record<DemoRequestLocale, DemoRequestCopy> = {
  en: {
    meta: {
      title: "Book a demo | UnReceipt receipts and outlays for small teams",
      description:
        "Book a 20-minute demo of UnReceipt: see how your team's receipts and outlays go from the phone to approval and on to your accountant. We reply within one working day.",
      shareTitle: "Book a 20-minute UnReceipt demo",
    },
    breadcrumb: "Book a demo",
    hero: {
      eyebrow: "20-minute demo",
      title: "See UnReceipt with",
      accent: "your own receipts",
      lead: "Tell us a little about your company. We'll show you how receipts and employee outlays get from the phone to your accountant. No preparation needed.",
    },
    steps: {
      title: "What happens next",
      items: [
        "You send the form. It takes a minute.",
        "We email you within one working day to find a time.",
        "We show you UnReceipt on a 20-minute video call, around your questions and your bookkeeping.",
        "You decide whether it fits. No commitment.",
      ],
    },
    notes: {
      title: "Good to know before the call",
      items: [
        {
          title: "Teams and approvals are new",
          desc: "Employees send their receipts for approval, and the owner or an approver decides. It's in pilot: there's no payroll or payout file yet.",
        },
        {
          title: "No direct Fortnox, Visma or Bokio integration",
          desc: "The export is a CSV file, PDFs and the original receipts. Your accountant books from there.",
        },
      ],
      selfServe: {
        title: "Rather start on your own?",
        desc: "Create an account any time: it takes two minutes.",
        signupPilot: "Get started free",
        signupPaid: "Start free",
      },
    },
    contact: {
      eyebrow: "Talk to us",
      title: "Book a demo or send us a question",
      lead: "Tell us a little about your company. We reply within one working day, and a demo takes 20 minutes on a video call.",
      signupLead: "Rather start on your own?",
    },
    form: {
      title: "Contact us",
      kindLegend: "What can we help with?",
      kinds: { demo: "Book a demo", question: "Another request" },
      name: "Your name",
      company: "Company",
      email: "Work email",
      phone: "Phone",
      optional: "optional",
      employees: "Number of employees",
      employeeOptions: { "1": "1 (just me)", "2-5": "2–5", "6-15": "6–15", "16-50": "16–50", "50+": "More than 50" },
      bookkeeping: "Bookkeeping software",
      bookkeepingOptions: { fortnox: "Fortnox", visma: "Visma", bokio: "Bokio", other: "Other", none: "None" },
      choose: "Choose…",
      hasAccountant: "Do you work with an accountant or accounting firm?",
      yes: "Yes",
      no: "No",
      message: "Message",
      messagePlaceholders: {
        demo: "What would you most like to see?",
        question: "Your question, or what you need from us",
      },
      optionalForQuestion: "optional for another request",
      submit: "Send",
      sending: "Sending…",
      privacy: "We use these details only to reply to you, and delete them after 12 months.",
      privacyLink: "Privacy",
      errors: {
        invalid: "Some answers need a look: see the notes under the fields.",
        rateLimited: "Too many requests from this connection. Try again in an hour, or email support@unreceipt.com.",
        failed: "Something went wrong and your request wasn't sent. Please try again, or email support@unreceipt.com.",
      },
      fieldErrors: {
        name: "Enter your name, on one line.",
        company: "Enter your company's name, on one line.",
        email: "Enter a valid email address.",
        phone: "Use digits, spaces and + ( ) . - only, at least 6.",
        employees: "Choose the number of employees.",
        bookkeeping: "Choose your bookkeeping software.",
        hasAccountant: "Choose yes or no.",
        message: "Write your message, under 2,000 characters.",
      },
    },
    sent: {
      title: "Thanks, we got your request",
      titleQuestion: "Thanks, we got your message",
      questionText: "We'll reply by email within one working day.",
      text: "You'll get a confirmation by email.",
      bookLead: "Want to pick a time right away?",
      book: "Choose a time",
      newTab: "opens in a new tab",
      noBooking: "We'll email you within one working day to find a time.",
    },
  },
  sv: {
    meta: {
      title: "Boka demo | UnReceipt kvitton och utlägg för småföretag",
      description:
        "Boka en demo på 20 minuter: se hur anställdas kvitton och utlägg går från mobilen till attest och vidare till redovisningsbyrån. Vi svarar inom en arbetsdag.",
      shareTitle: "Boka en demo av UnReceipt på 20 minuter",
    },
    breadcrumb: "Boka demo",
    hero: {
      eyebrow: "Demo på 20 minuter",
      title: "Se UnReceipt med",
      accent: "era egna kvitton",
      lead: "Berätta lite om företaget. Vi visar hur kvitton och anställdas utlägg går från mobilen till er redovisningsbyrå. Inga förberedelser behövs.",
    },
    steps: {
      title: "Så går det till",
      items: [
        "Du skickar formuläret. Det tar en minut.",
        "Vi mejlar dig inom en arbetsdag för att hitta en tid.",
        "Vi visar UnReceipt i ett videomöte på 20 minuter, utifrån era frågor och er bokföring.",
        "Du bestämmer om det passar. Inga åtaganden.",
      ],
    },
    notes: {
      title: "Bra att veta före mötet",
      items: [
        {
          title: "Team och attest är nytt",
          desc: "Anställda skickar sina kvitton för attest, och ägaren eller en attestant beslutar. Det är i pilot: det finns ännu ingen löne- eller utbetalningsfil.",
        },
        {
          title: "Ingen direktkoppling till Fortnox, Visma eller Bokio",
          desc: "Exporten är en CSV-fil, PDF:er och originalkvittona. Er redovisningsbyrå bokför därifrån.",
        },
      ],
      selfServe: {
        title: "Vill du hellre komma igång själv?",
        desc: "Skapa ett konto när du vill: det tar två minuter.",
        signupPilot: "Kom igång gratis",
        signupPaid: "Kom igång gratis",
      },
    },
    contact: {
      eyebrow: "Kontakta oss",
      title: "Boka en demo eller skicka en fråga",
      lead: "Berätta lite om företaget. Vi svarar inom en arbetsdag, och en demo tar 20 minuter i ett videomöte.",
      signupLead: "Vill du hellre komma igång själv?",
    },
    form: {
      title: "Kontakta oss",
      kindLegend: "Vad kan vi hjälpa till med?",
      kinds: { demo: "Boka en demo", question: "Något annat" },
      name: "Ditt namn",
      company: "Företag",
      email: "E-post (jobbet)",
      phone: "Telefon",
      optional: "valfritt",
      employees: "Antal anställda",
      employeeOptions: { "1": "1 (bara jag)", "2-5": "2–5", "6-15": "6–15", "16-50": "16–50", "50+": "Fler än 50" },
      bookkeeping: "Bokföringsprogram",
      bookkeepingOptions: { fortnox: "Fortnox", visma: "Visma", bokio: "Bokio", other: "Annat", none: "Inget" },
      choose: "Välj…",
      hasAccountant: "Har ni en redovisningsbyrå eller redovisningskonsult?",
      yes: "Ja",
      no: "Nej",
      message: "Meddelande",
      messagePlaceholders: {
        demo: "Vad vill du helst se?",
        question: "Din fråga, eller vad du behöver av oss",
      },
      optionalForQuestion: "valfritt för andra frågor",
      submit: "Skicka",
      sending: "Skickar…",
      privacy: "Vi använder uppgifterna bara för att svara dig, och raderar dem efter 12 månader.",
      privacyLink: "Integritet",
      errors: {
        invalid: "Några svar behöver ses över: se texten under fälten.",
        rateLimited: "För många förfrågningar från den här anslutningen. Försök igen om en timme eller mejla support@unreceipt.com.",
        failed: "Något gick fel och förfrågan skickades inte. Försök igen eller mejla support@unreceipt.com.",
      },
      fieldErrors: {
        name: "Skriv ditt namn, på en rad.",
        company: "Skriv företagets namn, på en rad.",
        email: "Skriv en giltig e-postadress.",
        phone: "Använd bara siffror, mellanslag och + ( ) . -, minst 6.",
        employees: "Välj antal anställda.",
        bookkeeping: "Välj bokföringsprogram.",
        hasAccountant: "Välj ja eller nej.",
        message: "Skriv ditt meddelande, under 2 000 tecken.",
      },
    },
    sent: {
      title: "Tack, vi har fått din förfrågan",
      titleQuestion: "Tack, vi har fått ditt meddelande",
      questionText: "Vi svarar via e-post inom en arbetsdag.",
      text: "Du får en bekräftelse via e-post.",
      bookLead: "Vill du välja en tid direkt?",
      book: "Välj en tid",
      newTab: "öppnas i en ny flik",
      noBooking: "Vi mejlar dig inom en arbetsdag för att hitta en tid.",
    },
  },
  fr: {
    meta: {
      title: "Demander une démo | UnReceipt, justificatifs des petites équipes",
      description:
        "Demandez une démo de 20 minutes d’UnReceipt : les reçus et notes de frais de vos salariés, du téléphone à la validation puis à votre expert-comptable. Réponse sous un jour ouvré.",
      shareTitle: "Demander une démo d’UnReceipt de 20 minutes",
    },
    breadcrumb: "Demander une démo",
    hero: {
      eyebrow: "Démo de 20 minutes",
      title: "Découvrez UnReceipt avec",
      accent: "vos propres justificatifs",
      lead: "Parlez-nous un peu de votre entreprise. Nous vous montrons comment les reçus et les notes de frais des salariés vont du téléphone à votre expert-comptable. Aucune préparation nécessaire.",
    },
    steps: {
      title: "Comment ça se passe",
      items: [
        "Vous envoyez le formulaire. Cela prend une minute.",
        "Nous vous écrivons sous un jour ouvré pour fixer un créneau.",
        "Nous vous montrons UnReceipt en visioconférence pendant 20 minutes, en partant de vos questions et de votre comptabilité. La démo se fait en anglais ou en suédois.",
        "Vous décidez si cela vous convient. Sans engagement.",
      ],
    },
    notes: {
      title: "Bon à savoir avant l’appel",
      items: [
        {
          title: "Les équipes et la validation sont nouvelles",
          desc: "Les salariés envoient leurs reçus pour validation, et le dirigeant ou un valideur décide. C’est en phase pilote : il n’y a pas encore de fichier de paie ni de virement.",
        },
        {
          title: "Pas de connexion directe à un logiciel comptable",
          desc: "L’export comprend un fichier CSV, des PDF et les justificatifs d’origine. Votre expert-comptable saisit à partir de là. L’application est en anglais.",
        },
      ],
      selfServe: {
        title: "Vous préférez commencer seul ?",
        desc: "Créez un compte quand vous voulez : cela prend deux minutes.",
        signupPilot: "Commencer gratuitement",
        signupPaid: "Essai gratuit",
      },
    },
    contact: {
      eyebrow: "Nous contacter",
      title: "Demander une démo ou nous poser une question",
      lead: "Parlez-nous un peu de votre entreprise. Nous répondons sous un jour ouvré, et une démo dure 20 minutes en visioconférence.",
      signupLead: "Vous préférez commencer seul ?",
    },
    form: {
      title: "Nous contacter",
      kindLegend: "Comment pouvons-nous vous aider ?",
      kinds: { demo: "Demander une démo", question: "Autre demande" },
      name: "Votre nom",
      company: "Entreprise",
      email: "E-mail professionnel",
      phone: "Téléphone",
      optional: "facultatif",
      employees: "Nombre de salariés",
      employeeOptions: { "1": "1 (moi seul)", "2-5": "2 à 5", "6-15": "6 à 15", "16-50": "16 à 50", "50+": "Plus de 50" },
      bookkeeping: "Logiciel comptable",
      bookkeepingOptions: { fortnox: "Fortnox", visma: "Visma", bokio: "Bokio", other: "Autre", none: "Aucun" },
      choose: "Choisir…",
      hasAccountant: "Travaillez-vous avec un expert-comptable ?",
      yes: "Oui",
      no: "Non",
      message: "Message",
      messagePlaceholders: {
        demo: "Que souhaitez-vous voir en priorité ?",
        question: "Votre question, ou ce dont vous avez besoin",
      },
      optionalForQuestion: "facultatif pour une autre demande",
      submit: "Envoyer",
      sending: "Envoi…",
      privacy: "Nous utilisons ces informations uniquement pour vous répondre, et les supprimons après 12 mois.",
      privacyLink: "Confidentialité",
      errors: {
        invalid: "Certaines réponses sont à revoir : voir les indications sous les champs.",
        rateLimited: "Trop de demandes depuis cette connexion. Réessayez dans une heure, ou écrivez à support@unreceipt.com.",
        failed: "Une erreur s’est produite et votre demande n’a pas été envoyée. Réessayez, ou écrivez à support@unreceipt.com.",
      },
      fieldErrors: {
        name: "Indiquez votre nom, sur une ligne.",
        company: "Indiquez le nom de l’entreprise, sur une ligne.",
        email: "Indiquez une adresse e-mail valide.",
        phone: "Utilisez uniquement des chiffres, espaces et + ( ) . -, au moins 6.",
        employees: "Choisissez le nombre de salariés.",
        bookkeeping: "Choisissez votre logiciel comptable.",
        hasAccountant: "Choisissez oui ou non.",
        message: "Écrivez votre message, en moins de 2 000 caractères.",
      },
    },
    sent: {
      title: "Merci, nous avons reçu votre demande",
      titleQuestion: "Merci, nous avons reçu votre message",
      questionText: "Nous vous répondons par e-mail sous un jour ouvré.",
      text: "Vous recevrez une confirmation par e-mail.",
      bookLead: "Vous voulez choisir un créneau tout de suite ?",
      book: "Choisir un créneau",
      newTab: "s’ouvre dans un nouvel onglet",
      noBooking: "Nous vous écrivons sous un jour ouvré pour fixer un créneau.",
    },
  },
};
