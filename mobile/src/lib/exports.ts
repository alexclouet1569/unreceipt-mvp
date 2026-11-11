// An export on the phone: the server builds the ZIP (POST /api/export, the
// website's own route) and answers with 15-minute download links; the app
// downloads each part into its cache and hands it to the iOS share sheet
// (Mail, Files, AirDrop...). Old exports are removed first: they are copies
// of the user's receipts and shouldn't pile up on the phone.

import { Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import type { MobileExport } from "@/lib/mobile/types";
import { exportReceipts } from "./api";

export type ExportOutcome =
  | { kind: "ready"; files: { uri: string; filename: string }[]; receiptCount: number; missing: number }
  | { kind: "empty" }
  | { kind: "tooMany" | "rateLimited" | "failed" | "downloadFailed" };

function exportsDir(): Directory {
  const dir = new Directory(Paths.cache, "exports");
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
}

// A file name we write ourselves: never a path from elsewhere.
function safeName(name: string, i: number): string {
  const clean = name.replace(/[^A-Za-z0-9._-]/g, "");
  return clean.endsWith(".zip") && clean.length > 4 ? clean : `unreceipt-export-${i + 1}.zip`;
}

/** Builds and downloads an export. Throws ApiError when offline or signed out. */
export async function prepareExport(period: string): Promise<ExportOutcome> {
  const res = await exportReceipts(period);
  if (!res.ok) {
    if (res.status === 413) return { kind: "tooMany" };
    if (res.status === 429) return { kind: "rateLimited" };
    return { kind: "failed" };
  }
  const data: MobileExport = res.data;
  if (!data.parts || data.parts.length === 0) return { kind: "empty" };
  try {
    const dir = exportsDir();
    const files = [];
    for (const [i, part] of data.parts.entries()) {
      const target = new File(dir, safeName(part.filename, i));
      const file = await File.downloadFileAsync(part.url, target, { idempotent: true });
      files.push({ uri: file.uri, filename: target.name });
    }
    return { kind: "ready", files, receiptCount: data.receiptCount, missing: data.missing };
  } catch {
    return { kind: "downloadFailed" };
  }
}

/** iOS's share sheet with the file. Resolves when it closes. */
export async function shareFile(uri: string): Promise<void> {
  await Share.share({ url: uri });
}
