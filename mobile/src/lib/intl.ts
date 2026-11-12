// Intl formatters, built once per language and options. On Hermes building
// a formatter costs far more than formatting with it, and a list row used
// to build three or four per render (amount, date, spoken label).

const numbers = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numbers.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    numbers.set(key, f);
  }
  return f;
}

export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dates.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dates.set(key, f);
  }
  return f;
}
