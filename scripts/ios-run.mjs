// `npm run ios:run`: builds the app and runs it in the iOS Simulator from
// Terminal, without the Xcode window. Steps:
//   1. npm run ios:sync (config, offline page, plugins);
//   2. builds the Debug app with xcodebuild into ios/DerivedData;
//   3. boots a simulator (an iPhone already running, else the newest iPhone);
//   4. installs this build over the old one (sign-in is kept) and opens it,
//      printing the app's log here until Ctrl-C.
// Always the code in this folder: no older build can be left running.
// Options: --device "iPhone 18 Pro" picks a simulator by name;
// --clean clears Xcode's package caches first (for "Missing package product").
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const project = join(root, "ios/App/App.xcodeproj");
const derivedData = join(root, "ios/DerivedData");
const appPath = join(derivedData, "Build/Products/Debug-iphonesimulator/App.app");

const args = process.argv.slice(2);
const deviceArg = args.includes("--device") ? args[args.indexOf("--device") + 1] : undefined;
const clean = args.includes("--clean");

function step(text) {
  console.log(`\n▶ ${text}`);
}

function fail(text) {
  console.error(`\n✖ ${text}\n`);
  process.exit(1);
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, ...options });
  return result.status === 0;
}

function read(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8" });
}

if (process.platform !== "darwin") fail("This needs a Mac with Xcode.");
if (!existsSync(join(root, "node_modules/@capacitor/ios"))) fail("Run npm ci first.");

if (clean) {
  step("Clearing Xcode's package caches and build folders for this project (no source file is touched)");
  for (const dir of [
    join(homedir(), "Library/Caches/org.swift.swiftpm"),
    derivedData,
    join(root, "ios/App/CapApp-SPM/.build"),
  ]) {
    rmSync(dir, { recursive: true, force: true });
  }
  // Xcode's own build folders (App-<hash>) whose project is this one; every
  // Capacitor app is called App, so the recorded project path decides.
  const xcodeDerived = join(homedir(), "Library/Developer/Xcode/DerivedData");
  if (existsSync(xcodeDerived)) {
    for (const name of readdirSync(xcodeDerived)) {
      if (!name.startsWith("App-")) continue;
      const info = join(xcodeDerived, name, "info.plist");
      if (!existsSync(info)) continue;
      let workspace = "";
      try {
        workspace = read("/usr/libexec/PlistBuddy", ["-c", "Print :WorkspacePath", info]).trim();
      } catch {
        continue;
      }
      if (workspace.startsWith(project)) rmSync(join(xcodeDerived, name), { recursive: true, force: true });
    }
  }
}

step("Copying the config and plugins into ios/ (npm run ios:sync)");
if (!run("node", ["scripts/ios-sync.mjs"])) fail("ios:sync failed. Send the lines above to Claude.");

step("Choosing a simulator");
const listed = JSON.parse(read("xcrun", ["simctl", "list", "devices", "available", "--json"]));
const iphones = [];
for (const [runtime, devices] of Object.entries(listed.devices)) {
  if (!runtime.includes("iOS")) continue;
  const version = (runtime.match(/iOS-(\d+)-(\d+)/) || []).slice(1).map(Number);
  for (const d of devices) {
    if (d.isAvailable && d.name.startsWith("iPhone")) iphones.push({ ...d, version });
  }
}
if (iphones.length === 0) {
  fail("No iPhone simulator found. Xcode → Settings → Components: install an iOS simulator.");
}
const newestFirst = (a, b) => (b.version[0] - a.version[0]) || (b.version[1] - a.version[1]);
const device =
  (deviceArg && iphones.filter((d) => d.name === deviceArg).sort(newestFirst)[0]) ||
  (!deviceArg && iphones.find((d) => d.state === "Booted")) ||
  (!deviceArg && iphones.filter((d) => d.name.includes("Pro") && !d.name.includes("Max")).sort(newestFirst)[0]) ||
  (!deviceArg && iphones.sort(newestFirst)[0]);
if (!device) fail(`No simulator named "${deviceArg}". Available: ${[...new Set(iphones.map((d) => d.name))].join(", ")}`);
console.log(`  ${device.name} (iOS ${device.version.join(".")})`);

step("Building the app (3 to 8 minutes the first time, faster after)");
const built = run("xcodebuild", [
  "-project", project,
  "-scheme", "App",
  "-configuration", "Debug",
  "-destination", `id=${device.udid}`,
  "-derivedDataPath", derivedData,
  "-quiet",
  "build",
]);
if (!built || !existsSync(appPath)) {
  fail("The build failed. Send Claude the lines that contain \"error:\" above.\n  If one says \"Missing package product\", run: npm run ios:run -- --clean");
}
const bundleId = read("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", join(appPath, "Info.plist")]).trim();
console.log("  Build succeeded.");

step("Starting the simulator");
if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);
run("open", ["-a", "Simulator"]);
run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "ignore" });

step("Installing this build (replaces the old one; you stay signed in)");
run("xcrun", ["simctl", "terminate", device.udid, bundleId], { stdio: "ignore" });
if (!run("xcrun", ["simctl", "install", device.udid, appPath])) fail("Installing in the simulator failed.");

step("Opening UnReceipt. The app's log follows; press Ctrl-C here when you're done testing.");
console.log("  Lines starting with [UnReceipt] are ours. Copy them to Claude if something goes wrong.\n");
run("xcrun", ["simctl", "launch", "--console-pty", "--terminate-running-process", device.udid, bundleId]);
