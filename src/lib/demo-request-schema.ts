import { z } from "zod";
import {
  BOOKKEEPING_OPTIONS,
  DEMO_REQUEST_LIMITS as L,
  DEMO_REQUEST_LOCALES,
  EMPLOYEE_BANDS,
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
const ONE_LINE = /^[^\p{Cc}]*$/u;

export const demoRequestSchema = z.object({
  name: z.string().trim().min(1).max(L.name).regex(ONE_LINE),
  company: z.string().trim().min(1).max(L.company).regex(ONE_LINE),
  email: z.string().trim().toLowerCase().pipe(z.email().max(L.email)),
  phone: optional(L.phone).refine((v) => v === null || /^[0-9+(). -]{6,40}$/.test(v), {
    message: "phone",
  }),
  employees: z.enum(EMPLOYEE_BANDS),
  bookkeeping: z.enum(BOOKKEEPING_OPTIONS),
  hasAccountant: z.boolean(),
  // Free text keeps line breaks and tabs; other control characters (NUL
  // can't be stored in Postgres text) are refused before any write.
  message: optional(L.message).refine(
    (v) => v === null || !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v),
    { message: "message" }
  ),
  locale: z.enum(DEMO_REQUEST_LOCALES),
  // Honeypot: a field people never see. Anything in it means a bot.
  website: z.string().max(500).optional(),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
