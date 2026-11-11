import { describe, expect, it } from "vitest";
// The website's own label file: the server sends exactly these to the app.
import { GMAIL, ICLOUD, OUTLOOK, PHONE } from "@/app/app/(authed)/settings/forwarding/guide/ui-labels";
import type { MobileForwarding } from "@/lib/mobile/types";
import { en } from "../../i18n/en";
import { fr } from "../../i18n/fr";
import { sv } from "../../i18n/sv";
import { GUIDE, stepPieces } from "../forwarding-guide";
import { exportPeriods } from "../export-periods";

const strip = (m: Record<string, { en: string; sv: string; fr: string }>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { en: v.en, sv: v.sv, fr: v.fr }]));
const data: Pick<MobileForwarding, "labels"> = {
  labels: { gmail: strip(GMAIL), outlook: strip(OUTLOOK), icloud: strip(ICLOUD), phone: strip(PHONE) },
};

describe("forwarding guide", () => {
  it("fills every placeholder of every step, in every language", () => {
    for (const strings of [en, sv, fr]) {
      for (const steps of Object.values(GUIDE)) {
        for (const step of steps) {
          const pieces = stepPieces(strings.forwarding.steps[step.text], step.labels, data, "en", { word: "kvitto" });
          expect(pieces.map((p) => p.text).join(""), step.id).not.toMatch(/\{\w+\}/);
          if (step.hint) {
            const hint = stepPieces(strings.forwarding.hints[step.hint], step.hintLabels, data, "en");
            expect(hint.map((p) => p.text).join(""), `${step.id} hint`).not.toMatch(/\{\w+\}/);
          }
        }
      }
    }
  });

  it("quotes button names in the mail's language and sets them strong", () => {
    const pieces = stepPieces("Click {button}", { button: ["gmail", "next"] }, data, "sv");
    expect(pieces).toEqual([
      { text: "Click ", strong: false },
      { text: "”Nästa”", strong: true },
    ]);
    expect(stepPieces("{button}", { button: ["gmail", "next"] }, data, "fr")[0].text).toBe("« Suivant »");
  });

  it("ends every automatic setup with the test step", () => {
    for (const p of ["gmail", "outlook", "icloud", "other"] as const) {
      expect(GUIDE[p][GUIDE[p].length - 1].extra).toBe("test");
    }
  });
});

describe("export periods", () => {
  const now = new Date(2026, 10, 11);

  it("offers at least a year of months, newest first, and the years they span", () => {
    const { months, years } = exportPeriods(null, "en", now);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ key: "2026-11", label: "November" });
    expect(months[11]).toEqual({ key: "2025-12", label: "December 2025" });
    expect(years.map((y) => y.key)).toEqual(["2026", "2025"]);
  });

  it("reaches back to the first receipt, at most ten years", () => {
    expect(exportPeriods("2024-03", "en", now).months).toHaveLength(33);
    expect(exportPeriods("1990-01", "en", now).months).toHaveLength(120);
  });
});
