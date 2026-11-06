// SERVER-ONLY: reads the request's user agent. See native-app.ts for what
// this may and may not be used for (display only, never access).

import { headers } from "next/headers";
import { parseNativeApp, type NativeApp } from "./native-app";

/** The store app making this request, or null for a browser. */
export async function getNativeApp(): Promise<NativeApp | null> {
  const h = await headers();
  return parseNativeApp(h.get("user-agent"));
}
