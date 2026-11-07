import { describe, expect, it } from "vitest";
import { nativeUserAgentToken, parseNativeApp } from "../native-app";

const IOS_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";

describe("parseNativeApp", () => {
  it("reads the token the shell appends on iOS and Android", () => {
    expect(parseNativeApp(`${IOS_WEBVIEW} UnReceiptApp/1.0.0 (ios)`)).toEqual({
      platform: "ios",
      version: "1.0.0",
    });
    expect(parseNativeApp(`${ANDROID_WEBVIEW} UnReceiptApp/2.3 (android)`)).toEqual({
      platform: "android",
      version: "2.3",
    });
  });

  it("round-trips the token builder", () => {
    expect(parseNativeApp(`${IOS_WEBVIEW} ${nativeUserAgentToken("ios", "1.4.2")}`)).toEqual({
      platform: "ios",
      version: "1.4.2",
    });
  });

  it("is null for browsers, empty values and look-alikes", () => {
    expect(parseNativeApp(IOS_WEBVIEW)).toBeNull();
    expect(parseNativeApp(ANDROID_WEBVIEW)).toBeNull();
    expect(parseNativeApp(null)).toBeNull();
    expect(parseNativeApp("")).toBeNull();
    expect(parseNativeApp(`${IOS_WEBVIEW} UnReceiptApp/1.0.0 (windows)`)).toBeNull();
    expect(parseNativeApp(`${IOS_WEBVIEW} NotUnReceiptApp/1.0.0 (ios)`)).toBeNull();
    expect(parseNativeApp(`${IOS_WEBVIEW} UnReceiptApp/abc (ios)`)).toBeNull();
  });
});
