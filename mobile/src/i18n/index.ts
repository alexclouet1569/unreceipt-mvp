import { getLocales } from "expo-localization";
import { pickLocale, stringsFor } from "./core";

export { fill, joinList, type Locale } from "./core";

/** The app's language, from the phone's preferred languages. */
export const locale = pickLocale(getLocales().map((l) => l.languageCode));

/** Every string in the app's language: `s.receipts.title`. */
export const s = stringsFor(locale);
