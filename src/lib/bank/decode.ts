// Bank CSVs come as UTF-8 (with or without BOM) or, from several Swedish
// and French banks, Windows-1252: "Bokföringsdag" read as UTF-8 would lose
// its "ö" and the column would not be found. Pure; runs in the browser.

export function decodeStatement(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(view);
  } catch {
    return new TextDecoder("windows-1252").decode(view);
  }
}
