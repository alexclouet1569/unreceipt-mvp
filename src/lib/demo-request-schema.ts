import { z } from "zod";
import {
  BOOKKEEPING_OPTIONS,
  DEMO_REQUEST_LIMITS as L,
  DEMO_REQUEST_LOCALES,
  EMPLOYEE_BANDS,
  REQUEST_KINDS,
} from "./demo-request";

// What POST /api/demo-request accepts. Every string is trimmed and capped
// (the table's CHECKs say the same); optional fields arrive as "" from the
// form and are stored as null.

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

// One line of text: no control characters (line breaks would fake extra
// "Email:" lines in the founder's plain-text email).
const ONE_LINE = /^[^\p{Cc}\p{Cs}]*$/u;
// A lone UTF-16 surrogate can't be stored (Postgres refuses it), so free
// text with one is refused here, before it costs a 500 and a Sentry event.
const WELL_FORMED = (v: string | null) => v === null || !/\p{Cs}/u.test(v);

export const demoRequestSchema = z
  .object({
    // Older clients send no kind: they only asked for demos.
    kind: z.enum(REQUEST_KINDS).default("demo"),
    name: z.string().trim().min(1).max(L.name).regex(ONE_LINE),
    company: z.string().trim().min(1).max(L.company).regex(ONE_LINE),
    email: z.string().trim().toLowerCase().pipe(z.email().max(L.email)),
    phone: optional(L.phone).refine((v) => v === null || /^[0-9+(). -]{6,40}$/.test(v), {
      message: "phone",
    }),
    // Required for a demo (they qualify the call), optional for another
    // request: "" or a missing value is stored as null.
    employees: z.preprocess((v) => (v === "" ? undefined : v), z.enum(EMPLOYEE_BANDS).optional()),
    bookkeeping: z.preprocess((v) => (v === "" ? undefined : v), z.enum(BOOKKEEPING_OPTIONS).optional()),
    hasAccountant: z.boolean().nullable().optional(),
    // Free text keeps line breaks and tabs; other control characters (NUL
    // can't be stored in Postgres text) are refused before any write.
    message: optional(L.message).refine(
      (v) => v === null || !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v),
      { message: "message" }
    ).refine(WELL_FORMED, { message: "message" }),
    locale: z.enum(DEMO_REQUEST_LOCALES),
    // Honeypot: a field people never see. Anything in it means a bot.
    website: z.string().max(500).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.kind === "demo") {
      if (!r.employees) ctx.addIssue({ code: "custom", path: ["employees"], message: "employees" });
      if (!r.bookkeeping) ctx.addIssue({ code: "custom", path: ["bookkeeping"], message: "bookkeeping" });
      if (typeof r.hasAccountant !== "boolean") {
        ctx.addIssue({ code: "custom", path: ["hasAccountant"], message: "hasAccountant" });
      }
    } else if (!r.message) {
      // Another request is its message.
      ctx.addIssue({ code: "custom", path: ["message"], message: "message" });
    }
  })
  .transform((r) => ({
    ...r,
    employees: r.employees ?? null,
    bookkeeping: r.bookkeeping ?? null,
    hasAccountant: typeof r.hasAccountant === "boolean" ? r.hasAccountant : null,
  }));

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
