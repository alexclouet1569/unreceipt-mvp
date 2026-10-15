import { describe, expect, it } from "vitest";
import { buildZip, crc32, zipSize } from "@/lib/export/zip";

const enc = new TextEncoder();

/** Reads the central directory back: name, size and CRC per entry. */
function readCentral(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const size = view.getUint32(p + 24, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true);
    out.push({
      name,
      size,
      crc: view.getUint32(p + 16, true),
      data: zip.subarray(dataStart, dataStart + size),
      flags: view.getUint16(p + 8, true),
    });
    p += 46 + nameLen;
  }
  return out;
}

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes entries that read back byte-for-byte, with UTF-8 names", () => {
    const files = [
      { name: "receipts.csv", data: enc.encode("a;b\r\n") },
      { name: "originals/2026-10-03_pressbyrån_1.jpg", data: new Uint8Array([0, 1, 2, 255]) },
    ];
    const zip = buildZip(files);

    expect(zip.length).toBe(zipSize(files.map((f) => ({ name: f.name, size: f.data.length }))));
    const entries = readCentral(zip);
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
    entries.forEach((e, i) => {
      expect(Array.from(e.data)).toEqual(Array.from(files[i].data));
      expect(e.crc).toBe(crc32(files[i].data));
      expect(e.flags & 0x0800).toBe(0x0800);
    });
  });
});
