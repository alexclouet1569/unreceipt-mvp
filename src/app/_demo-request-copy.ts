import type { BookkeepingOption, DemoRequestLocale, EmployeeBand } from "@/lib/demo-request";

/**
 * Every word on the demo request page (/book-demo, /sv/boka-demo), its form
 * and its thank-you state. Pure data, safe to import from the client form.
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
    selfServe: { title: string; desc: string; tour: string; signupPilot: string; signupPaid: string };
  };
  form: {
    title: string;
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
    messagePlaceholder: string;
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
        title: "Rather try it yourself?",
        desc: "Click through the interactive demo, or create an account any time.",
        tour: "Open the interactive demo",
        signupPilot: "Join the pilot",
        signupPaid: "Start free",
      },
    },
    form: {
      title: "Request a demo",
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
      messagePlaceholder: "What would you most like to see?",
      submit: "Send request",
      sending: "Sending…",
      privacy: "We use these details only to reply and arrange the demo, and delete them after 12 months.",
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
        message: "Keep the message under 2,000 characters.",
      },
    },
    sent: {
      title: "Thanks, we got your request",
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
        title: "Vill du hellre testa själv?",
        desc: "Klicka dig igenom den interaktiva demon, eller skapa ett konto när du vill.",
        tour: "Öppna den interaktiva demon",
        signupPilot: "Gå med i piloten",
        signupPaid: "Kom igång gratis",
      },
    },
    form: {
      title: "Be om en demo",
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
      messagePlaceholder: "Vad vill du helst se?",
      submit: "Skicka förfrågan",
      sending: "Skickar…",
      privacy: "Vi använder uppgifterna bara för att svara och boka demon, och raderar dem efter 12 månader.",
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
        message: "Håll meddelandet under 2 000 tecken.",
      },
    },
    sent: {
      title: "Tack, vi har fått din förfrågan",
      text: "Du får en bekräftelse via e-post.",
      bookLead: "Vill du välja en tid direkt?",
      book: "Välj en tid",
      newTab: "öppnas i en ny flik",
      noBooking: "Vi mejlar dig inom en arbetsdag för att hitta en tid.",
    },
  },
};
