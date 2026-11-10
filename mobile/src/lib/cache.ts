// The last home screen, kept on the phone so the app opens on content, never
// on a spinner, and still shows something offline. Stored in the app's own
// sandbox (iOS encrypts it while the phone is locked); deleted on sign-out.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import type { MobileHome } from "@/lib/mobile/types";
import { deleteAllScans } from "./scans/files";

const PREFIX = "home:v1:";

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

/**
 * On sign-out: the saved list and the receipt photos kept by the image
 * cache. A sign-out the user asked for also deletes the scans still waiting
 * to be sent (after a warning); when the server ended the session, they
 * stay, keyed by user, and are sent once the same person signs back in.
 */
export async function clearAll({ keepScans = false }: { keepScans?: boolean } = {}): Promise<void> {
  if (!keepScans) deleteAllScans();
  await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => {});
  try {
    const keys = await AsyncStorage.getAllKeys();
    // "scans:v1:" is the queue (src/lib/scans/ScanProvider.tsx).
    await AsyncStorage.multiRemove(
      keys.filter((k) => k.startsWith(PREFIX) || (!keepScans && k.startsWith("scans:v1:"))),
    );
  } catch {
    // Nothing more to do: the next sign-in overwrites it.
  }
}
