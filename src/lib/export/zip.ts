/**
 * Minimal ZIP writer (store method, no compression) for the accountant
 * export. Receipt photos and PDFs are already compressed, so deflate would
 * cost CPU for almost no gain, and a ~100-line writer avoids a dependency.
 *
 * Limits we stay well inside: < 65,535 entries and < 4 GB (no ZIP64). File
 * names are UTF-8 (general-purpose flag bit 11) so "Pressbyrån" survives.
 * Pure; safe in any runtime that has Uint8Array.
 */

export type ZipEntry = { name: string; data: Uint8Array; date?: Date };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time, as ZIP stores it (local fields; we pass UTC parts).
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time:
      (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const UTF8_FLAG = 0x0800;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;

/** Bytes a set of entries will take once zipped (store method). */
export function zipSize(entries: Array<{ name: string; size: number }>): number {
  const enc = new TextEncoder();
  let total = END_RECORD;
  for (const e of entries) {
    const n = enc.encode(e.name).length;
    total += LOCAL_HEADER + n + e.size + CENTRAL_HEADER + n;
  }
  return total;
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error("too many zip entries");
  const enc = new TextEncoder();
  const prepared = entries.map((e) => ({
    name: enc.encode(e.name),
    data: e.data,
    crc: crc32(e.data),
    ...dosDateTime(e.date ?? new Date()),
  }));

  const size = zipSize(entries.map((e) => ({ name: e.name, size: e.data.length })));
  if (size > 0xffffffff) throw new Error("zip too large");
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  const localOffsets: number[] = [];

  for (const e of prepared) {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true); // version needed
    view.setUint16(offset + 6, UTF8_FLAG, true);
    view.setUint16(offset + 8, 0, true); // method: store
    view.setUint16(offset + 10, e.time, true);
    view.setUint16(offset + 12, e.date, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.data.length, true);
    view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(e.name, offset + LOCAL_HEADER);
    out.set(e.data, offset + LOCAL_HEADER + e.name.length);
    offset += LOCAL_HEADER + e.name.length + e.data.length;
  }

  const centralStart = offset;
  prepared.forEach((e, i) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, UTF8_FLAG, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, e.time, true);
    view.setUint16(offset + 14, e.date, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.data.length, true);
    view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.name.length, true);
    // extra length, comment length, disk number, internal attrs: 0
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, localOffsets[i], true);
    out.set(e.name, offset + CENTRAL_HEADER);
    offset += CENTRAL_HEADER + e.name.length;
  });

  const centralSize = offset - centralStart;
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}
