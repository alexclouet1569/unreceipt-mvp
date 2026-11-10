// Scans on the phone: each one is shrunk to a sensible size and kept in the
// app's documents folder (which iOS doesn't clear) until the server has it.
// The server accepts up to 4 MB (src/lib/receipts/upload-limits.ts).

import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Enough for the model to read small print; a few hundred kB per scan.
const MAX_SIDE = 2200;
const MAX_BYTES = 3_800_000;

function pendingDir(): Directory {
  const dir = new Directory(Paths.document, "pending-scans");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Turn a scanned or picked image into the JPEG to send, stored under the
 * scan's id. Removes the scanner's own file when it was ours to remove.
 */
export async function prepareScan(sourceUri: string, id: string, removeSource: boolean): Promise<string> {
  const image = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const longest = Math.max(image.width, image.height);
  const sized =
    longest > MAX_SIDE
      ? await (image.width >= image.height
          ? ImageManipulator.manipulate(image).resize({ width: MAX_SIDE })
          : ImageManipulator.manipulate(image).resize({ height: MAX_SIDE })
        ).renderAsync()
      : image;

  let saved = await sized.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  if ((new File(saved.uri).size ?? 0) > MAX_BYTES) {
    saved = await sized.saveAsync({ compress: 0.45, format: SaveFormat.JPEG });
  }

  const target = new File(pendingDir(), `${id}.jpg`);
  await new File(saved.uri).move(target, { overwrite: true });
  if (removeSource) deleteFile(sourceUri);
  return target.uri;
}

export function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or never ours: nothing to do.
  }
}

/** On sign-out: no scan stays on the phone. */
export function deleteAllScans(): void {
  try {
    const dir = new Directory(Paths.document, "pending-scans");
    if (dir.exists) dir.delete();
  } catch {
    // Best effort.
  }
}
