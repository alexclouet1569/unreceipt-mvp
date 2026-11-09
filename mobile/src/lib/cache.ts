// The last home screen, kept on the phone so the app opens on content, never
// on a spinner, and still shows something offline. Stored in the app's own
// sandbox (iOS encrypts it while the phone is locked); deleted on sign-out.

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileHome } from "@/lib/mobile/types";

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

export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch {
    // Nothing more to do: the next sign-in overwrites it.
  }
}
