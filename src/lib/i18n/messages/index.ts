// Every product message, per language, by namespace (one file per area of
// the app). English is the source; French and Swedish must match its shape
// (src/lib/i18n/types.ts), so a missing translation fails the typecheck.

import type { Locale } from "../locale";
import auth from "./auth";
import capture from "./capture";
import claims from "./claims";
import common from "./common";
import dashboard from "./dashboard";
import receipt from "./receipt";
import settings from "./settings";

const namespaces = { auth, capture, claims, common, dashboard, receipt, settings };

type Namespaces = typeof namespaces;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]["en"] };

const cache = new Map<Locale, Messages>();

export function getMessages(locale: Locale): Messages {
  const hit = cache.get(locale);
  if (hit) return hit;
  const built = Object.fromEntries(
    Object.entries(namespaces).map(([name, ns]) => [name, ns[locale]]),
  ) as Messages;
  cache.set(locale, built);
  return built;
}
