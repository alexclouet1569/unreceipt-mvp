import { Config } from "@remotion/cli/config";

// Rendered with the Chromium already installed in this environment; on a
// laptop, Remotion downloads its own headless browser when this is unset.
if (process.env.REMOTION_CHROME) {
  Config.setBrowserExecutable(process.env.REMOTION_CHROME);
}
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
