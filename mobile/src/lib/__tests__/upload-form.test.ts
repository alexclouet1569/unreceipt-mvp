// The app's fetch is Expo's (expo/fetch). This runs Expo's own multipart
// encoder on the two ways to attach a scan, so the upload can't silently go
// back to React Native's `{ uri, name, type }`, which never left the phone
// and showed as "Waiting for a connection" (2026-11-13).

import { describe, expect, it } from "vitest";
import { convertFormDataAsync } from "../../../node_modules/expo/src/winter/fetch/convertFormData";

const form = (entry: unknown) => ({ entries: () => [["client_id", "abc"], ["file", entry]] }) as unknown as FormData;

describe("scan upload body (expo/fetch)", () => {
  it("refuses React Native's { uri } file object", async () => {
    await expect(
      convertFormDataAsync(form({ uri: "file:///docs/pending-scans/abc.jpg", name: "abc.jpg", type: "image/jpeg" })),
    ).rejects.toThrow("Unsupported FormDataPart implementation");
  });

  it("sends a file-system File with its bytes, name and type", async () => {
    // What an expo-file-system File gives the encoder (bytes(), name, type).
    const file = { name: "abc.jpg", type: "image/jpeg", bytes: async () => new Uint8Array([0xff, 0xd8, 0xff]) };
    const { body, boundary } = await convertFormDataAsync(form(file), "B");
    const text = new TextDecoder("latin1").decode(body);
    expect(boundary).toBe("B");
    expect(text).toContain('content-disposition: form-data; name="file"; filename="abc.jpg"');
    expect(text).toContain("content-type: image/jpeg");
    expect(Array.from(body.slice(text.indexOf("\xff\xd8\xff"), text.indexOf("\xff\xd8\xff") + 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(text).toContain('name="client_id"\r\n\r\nabc');
  });
});
