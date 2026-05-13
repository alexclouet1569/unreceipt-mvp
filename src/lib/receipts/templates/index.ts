import { stripeTemplate } from "./stripe";
import { uberTemplate } from "./uber";
import { swedishBankSmsTemplate } from "./sms-swedish";
import type { EmailTemplate, SmsTemplate } from "./types";

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  uberTemplate,
  stripeTemplate,
];

export const SMS_TEMPLATES: readonly SmsTemplate[] = [
  swedishBankSmsTemplate,
];
