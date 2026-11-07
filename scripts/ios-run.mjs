// `npm run ios:run`: builds the app and runs it in the iOS Simulator from
// Terminal, without the Xcode window. Steps:
//   1. npm run ios:sync (config, offline page, plugins);
//   2. builds the Debug app with xcodebuild into ios/DerivedData;
//   3. boots a simulator (an iPhone already running, else the newest iPhone);
//   4. installs this build over the old one (sign-in is kept) and opens it,
//      printing the app's log here until Ctrl-C.
// Always the code in this folder: no older build can be left running.
// Options: --device "iPhone 18 Pro" picks a simulator by name;
// --clean clears Xcode's package caches first (for "Missing package product");
// --iphone builds for the iPhone connected to the Mac instead, signed with
// the Apple account added in Xcode → Settings → Accounts (--team <ID> picks
// the team when there are several).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const project = join(root, "ios/App/App.xcodeproj");
const derivedData = join(root, "ios/DerivedData");
const appPath = join(derivedData, "Build/Products/Debug-iphonesimulator/App.app");

const args = process.argv.slice(2);
const deviceArg = args.includes("--device") ? args[args.indexOf("--device") + 1] : undefined;
const clean = args.includes("--clean");
const iphone = args.includes("--iphone");
const teamArg = args.includes("--team") ? args[args.indexOf("--team") + 1] : undefined;

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

if (iphone) {
  runOnIphone();
  process.exit(0);
}

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
// Xcode 27 replaced Simulator.app with Device Hub; older Xcodes still have
// Simulator.app inside Xcode.
const simulatorApp = join(read("xcode-select", ["-p"]).trim(), "Applications/Simulator.app");
const opened =
  run("open", ["-a", "DeviceHub"], { stdio: "ignore" }) ||
  run("open", ["-a", "Device Hub"], { stdio: "ignore" }) ||
  run("open", [simulatorApp], { stdio: "ignore" }) ||
  run("open", ["-a", "Simulator"], { stdio: "ignore" });
if (!opened) {
  console.log("  Couldn't open the simulator window. The app still runs: open Device Hub");
  console.log("  (Xcode → Open Developer Tool → Device Hub) and pick " + device.name + ".");
}
run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "ignore" });

step("Installing this build (replaces the old one; you stay signed in)");
run("xcrun", ["simctl", "terminate", device.udid, bundleId], { stdio: "ignore" });
if (!run("xcrun", ["simctl", "install", device.udid, appPath])) fail("Installing in the simulator failed.");

step("Opening UnReceipt. The app's log follows; press Ctrl-C here when you're done testing.");
console.log("  Lines starting with [UnReceipt] are ours. Copy them to Claude if something goes wrong.\n");
run("xcrun", ["simctl", "launch", "--console-pty", "--terminate-running-process", device.udid, bundleId]);

// ---- A real iPhone -------------------------------------------------------

function tempFile(name) {
  return join(mkdtempSync(join(tmpdir(), "unreceipt-ios-")), name);
}

/** The signing team: --team, else the teams of the accounts added in Xcode. */
function findTeams() {
  if (teamArg) return [{ id: teamArg, name: "from --team" }];
  const teams = [];
  const prefs = tempFile("xcode.plist");
  if (run("defaults", ["export", "com.apple.dt.Xcode", prefs], { stdio: "ignore" })) {
    for (const key of ["IDEProvisioningTeamByIdentifier", "IDEProvisioningTeams"]) {
      let xml = "";
      try {
        xml = read("plutil", ["-extract", key, "xml1", "-o", "-", prefs]);
      } catch {
        continue;
      }
      for (const block of xml.split("<dict>")) {
        const id = block.match(/<key>teamID<\/key>\s*<string>([A-Z0-9]{10})<\/string>/);
        if (!id || teams.some((t) => t.id === id[1])) continue;
        const name = block.match(/<key>teamName<\/key>\s*<string>([^<]*)<\/string>/);
        teams.push({
          id: id[1],
          name: name ? name[1] : id[1],
          free: /<key>isFreeProvisioningTeam<\/key>\s*<true\/>/.test(block),
        });
      }
    }
  }
  return teams;
}

/** iPhones connected to this Mac, from devicectl (Xcode 15 and newer). */
function findPhones() {
  const out = tempFile("devices.json");
  if (!run("xcrun", ["devicectl", "list", "devices", "--json-output", out], { stdio: "ignore" })) return [];
  let devices = [];
  try {
    devices = JSON.parse(readFileSync(out, "utf8"))?.result?.devices ?? [];
  } catch {
    return [];
  }
  return devices
    .filter((d) => d?.hardwareProperties?.platform === "iOS" && d?.hardwareProperties?.reality !== "simulated")
    .map((d) => ({
      id: d.identifier,
      udid: d.hardwareProperties.udid,
      name: d.deviceProperties?.name ?? "iPhone",
      paired: d.connectionProperties?.pairingState === "paired",
      connected: d.connectionProperties?.tunnelState === "connected" || d.connectionProperties?.transportType === "wired",
      developerMode: d.deviceProperties?.developerModeStatus,
    }));
}

function runOnIphone() {
  step("Finding your iPhone");
  const phones = findPhones();
  const phone = phones.find((p) => p.connected && p.paired) || phones.find((p) => p.connected) || phones[0];
  if (!phone) {
    fail(
      "No iPhone found. Connect it with a cable, unlock it, tap Trust on the phone,\n" +
        "  then run this again. It should also appear in Device Hub (Xcode → Open Developer Tool → Device Hub).",
    );
  }
  console.log(`  ${phone.name}${phone.connected ? "" : " (not connected right now)"}`);
  if (!phone.udid) fail("Couldn't read the iPhone's ID. Send Claude the lines above.");
  if (phone.developerMode && phone.developerMode !== "enabled") {
    fail(
      "Developer Mode is off on the iPhone. On the phone: Settings → Privacy & Security →\n" +
        "  Developer Mode → on. The phone restarts; unlock it, confirm, then run this again.",
    );
  }

  step("Finding your Apple account in Xcode");
  const teams = findTeams();
  if (teams.length === 0) {
    fail(
      "No Apple account in Xcode. Open Xcode → Settings → Accounts → + → Apple Account,\n" +
        "  sign in, close Settings, then run this again.",
    );
  }
  if (teams.length > 1 && !teamArg) {
    fail(
      "Several teams in Xcode. Run again with the one to use, e.g. npm run ios:run -- --iphone --team " +
        teams[0].id +
        "\n" +
        teams.map((t) => `  ${t.id}  ${t.name}${t.free ? " (Personal Team)" : ""}`).join("\n"),
    );
  }
  const team = teams[0];
  console.log(`  ${team.name} (${team.id})`);

  step("Building the app for the iPhone (3 to 8 minutes the first time)");
  const phoneAppPath = join(derivedData, "Build/Products/Debug-iphoneos/App.app");
  const built = run("xcodebuild", [
    "-project", project,
    "-scheme", "App",
    "-configuration", "Debug",
    "-destination", `id=${phone.udid}`,
    "-derivedDataPath", derivedData,
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    "-quiet",
    `DEVELOPMENT_TEAM=${team.id}`,
    "CODE_SIGN_STYLE=Automatic",
    "build",
  ]);
  if (!built || !existsSync(phoneAppPath)) {
    fail(
      "The build failed. Send Claude the lines that contain \"error:\" above.\n" +
        "  If one mentions signing or a provisioning profile, check Xcode → Settings → Accounts.",
    );
  }
  const bundleId = read("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", join(phoneAppPath, "Info.plist")]).trim();
  console.log("  Build succeeded.");

  step("Installing on the iPhone (keep it unlocked)");
  if (!run("xcrun", ["devicectl", "device", "install", "app", "--device", phone.id, phoneAppPath])) {
    fail(
      "Installing failed. Check that the iPhone is unlocked and connected, and that\n" +
        "  Settings → Privacy & Security → Developer Mode is on. Then run this again.",
    );
  }

  step("Opening UnReceipt on the iPhone. The app's log follows; press Ctrl-C here when you're done.");
  console.log("  Lines starting with [UnReceipt] are ours. Copy them to Claude if something goes wrong.\n");
  const launch = ["devicectl", "device", "process", "launch", "--device", phone.id, "--terminate-existing"];
  if (run("xcrun", [...launch, "--console", bundleId])) return;
  if (run("xcrun", [...launch, bundleId])) {
    console.log("  Opened (this Xcode can't stream the app's log here).");
    return;
  }
  fail(
    "The app is installed but iOS didn't open it. The first time, iOS doesn't trust a\n" +
      "  free developer account: on the iPhone, Settings → General → VPN & Device Management →\n" +
      "  your Apple ID → Trust. Then tap the UnReceipt icon, or run this again.",
  );
}
