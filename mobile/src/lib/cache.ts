// The last home screen, kept on the phone so the app opens on content, never
// on a spinner, and still shows something offline. Stored in the app's own
// sandbox (iOS encrypts it while the phone is locked); deleted on sign-out.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { Directory, Paths } from "expo-file-system";
import type { MobileAccount, MobileAnalytics, MobileHome } from "@/lib/mobile/types";
import { deleteAllScans } from "./scans/files";

const PREFIX = "home:v1:";
const ACCOUNT_PREFIX = "account:v1:";
const INSIGHTS_PREFIX = "insights:v1:";

/** The last Insights answer for a period ("month:2026-11"), for an instant screen. */
export async function readInsights(userId: string, key: string): Promise<MobileAnalytics | null> {
  try {
    const raw = await AsyncStorage.getItem(`${INSIGHTS_PREFIX}${userId}:${key}`);
    return raw ? (JSON.parse(raw) as MobileAnalytics) : null;
  } catch {
    return null;
  }
}

export async function writeInsights(userId: string, key: string, data: MobileAnalytics): Promise<void> {
  try {
    await AsyncStorage.setItem(`${INSIGHTS_PREFIX}${userId}:${key}`, JSON.stringify(data));
  } catch {
    // Only costs the next visit its instant screen.
  }
}

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

// "The first run was finished or skipped on this phone", per user: the
// server's answer can lag (its POST is best effort), and a finished first
// run must never come back. A flag, not data, so it outlives a sign-out.
const ONBOARDED_PREFIX = "onboarded:v1:";

export async function readOnboarded(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_PREFIX + userId)) === "1";
  } catch {
    return false;
  }
}

export async function writeOnboarded(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_PREFIX + userId, "1");
  } catch {
    // The server's stamp still stops it once it lands.
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
// In-memory copies of receipts kept by other modules (signed photo links,
// digital receipts), forgotten with everything else.
const memoryClears = new Set<() => void>();
export function onSignOutClear(clear: () => void): void {
  memoryClears.add(clear);
}

export async function clearAll({ keepScans = false }: { keepScans?: boolean } = {}): Promise<void> {
  for (const clear of memoryClears) clear();
  if (!keepScans) deleteAllScans();
  deleteExports();
  await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => {});
  try {
    const keys = await AsyncStorage.getAllKeys();
    // "scans:v1:" is the queue (src/lib/scans/ScanProvider.tsx).
    await AsyncStorage.multiRemove(
      keys.filter(
        (k) =>
          k.startsWith(PREFIX) ||
          k.startsWith(ACCOUNT_PREFIX) ||
          k.startsWith(INSIGHTS_PREFIX) ||
          (!keepScans && k.startsWith("scans:v1:")),
      ),
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
