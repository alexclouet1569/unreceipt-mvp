// The last home screen, kept on the phone so the app opens on content, never
// on a spinner, and still shows something offline. Stored in the app's own
// sandbox (iOS encrypts it while the phone is locked); deleted on sign-out.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Directory, Paths } from "expo-file-system";
import type { MobileAccount, MobileHome } from "@/lib/mobile/types";
import { deleteAllScans } from "./scans/files";

const PREFIX = "home:v1:";
const ACCOUNT_PREFIX = "account:v1:";

export async function readHome(userId: string): Promise<MobileHome | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + userId);
    return raw ? (JSON.parse(raw) as MobileHome) : null;
  } catch {
    return null;
  }
}

export async function writeHome(userId: string, home: MobileHome): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + userId, JSON.stringify(home));
  } catch {
    // A full disk only costs the next cold start its instant list.
  }
}

export async function readAccount(userId: string): Promise<MobileAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_PREFIX + userId);
    return raw ? (JSON.parse(raw) as MobileAccount) : null;
  } catch {
    return null;
  }
}

export async function writeAccount(userId: string, account: MobileAccount): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCOUNT_PREFIX + userId, JSON.stringify(account));
  } catch {
    // Only costs the next visit its instant screen.
  }
}

/**
 * On sign-out: the saved list and the receipt photos kept by the image
 * cache. A sign-out the user asked for also deletes the scans still waiting
 * to be sent (after a warning); when the server ended the session, they
 * stay, keyed by user, and are sent once the same person signs back in.
 */
export async function clearAll({ keepScans = false }: { keepScans?: boolean } = {}): Promise<void> {
  if (!keepScans) deleteAllScans();
  deleteExports();
  await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => {});
  try {
    const keys = await AsyncStorage.getAllKeys();
    // "scans:v1:" is the queue (src/lib/scans/ScanProvider.tsx).
    await AsyncStorage.multiRemove(
      keys.filter((k) => k.startsWith(PREFIX) || k.startsWith(ACCOUNT_PREFIX) || (!keepScans && k.startsWith("scans:v1:"))),
    );
  } catch {
    // Nothing more to do: the next sign-in overwrites it.
  }
}

/** Exported ZIPs (src/lib/exports.ts) are copies of every receipt: they leave with the session. */
function deleteExports(): void {
  try {
    const dir = new Directory(Paths.cache, "exports");
    if (dir.exists) dir.delete();
  } catch {
    // Best effort: iOS may also clear the cache folder by itself.
  }
}
