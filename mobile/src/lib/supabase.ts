// Supabase, for sign-in only: the 6-digit email code and keeping the session.
// Receipts are read and written through app.unreceipt.com (src/lib/api.ts).
//
// The session lives in the iPhone Keychain, readable after the first unlock
// (so a refresh can run in the background) and never copied to another
// device by a backup.

import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";

const KEYCHAIN: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const keychainStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, KEYCHAIN),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, KEYCHAIN),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: keychainStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Refresh the token only while the app is on screen (Supabase's guidance
// for React Native): a timer in the background would be killed anyway.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
