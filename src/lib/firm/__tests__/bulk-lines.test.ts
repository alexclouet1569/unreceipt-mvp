import { describe, expect, it } from "vitest";
import { parseInviteLines } from "../bulk-lines";

describe("parseInviteLines", () => {
  it("reads the shapes people paste", () => {
    const { invites, unreadable } = parseInviteLines(
      [
        "anna@hallonbygg.se",
        "Nordljus Design AB, Maja@Nordljus.se",
        "Café Olé; hej@cafe-ole.se",
        "Bageri Ett\tinfo@bageri1.se",
        "Erik Svensson <erik@svensson.se>",
        "",
        "   ",
        "no address here",
      ].join("\n"),
    );
    expect(invites).toEqual([
      { email: "anna@hallonbygg.se" },
      { client_name: "Nordljus Design AB", email: "maja@nordljus.se" },
      { client_name: "Café Olé", email: "hej@cafe-ole.se" },
      { client_name: "Bageri Ett", email: "info@bageri1.se" },
      { client_name: "Erik Svensson", email: "erik@svensson.se" },
    ]);
    expect(unreadable).toEqual(["no address here"]);
  });
});
