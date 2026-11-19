// The receipt crop of a camera photo (ios/ReceiptCropModule.swift): Apple's
// Vision finds the receipt's edges on the phone and the photo is cropped
// straight to it. Anything uncertain, an older build without the module, or
// an error: the photo as taken, never a failed scan.

import { requireOptionalNativeModule } from "expo";

type ReceiptCropNative = {
  cropReceipt(uri: string): Promise<{ uri: string; cropped: boolean }>;
};

// Optional: an over-the-air update can reach a build made before the module.
const native = requireOptionalNativeModule<ReceiptCropNative>("ReceiptCrop");

export type CropResult = { uri: string; cropped: boolean };

export async function cropReceipt(uri: string): Promise<CropResult> {
  if (!native) return { uri, cropped: false };
  try {
    const result = await native.cropReceipt(uri);
    return typeof result?.uri === "string" && result.uri ? result : { uri, cropped: false };
  } catch {
    return { uri, cropped: false };
  }
}
