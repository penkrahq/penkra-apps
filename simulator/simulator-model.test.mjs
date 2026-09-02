import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canDestructivelyChange,
  chooseSelectedDevice,
  classifySimulatorError,
  createSingleFlight,
  isReadyControlAction,
  isIntentionalStartupCancellation,
  newestInstallableRuntime,
  normalizedViewportPoint,
  reduceControlErrorNotice,
  resolveNewDeviceState,
  simulatorSetupRequest,
  splitDevices,
  targetIdentifier,
} from "./simulator-model.mjs";

test("exposes the platform-standard target identifier", () => {
  assert.equal(targetIdentifier({ platform: "ios", udid: "A-UDID" }).value, "A-UDID");
  assert.equal(targetIdentifier({ platform: "android", serial: "emulator-5554" }).value, "emulator-5554");
});

test("classifies busy, setup, unsupported, and ordinary failures", () => {
  assert.equal(classifySimulatorError(new Error("Device lease is owned by another tab")).kind, "busy");
  assert.equal(classifySimulatorError("This saved device is already running.").kind, "busy");
  assert.equal(classifySimulatorError({ message: "This saved device is already running." }).kind, "busy");
  assert.equal(classifySimulatorError(new Error("Android system image is not installed")).kind, "setup");
  assert.equal(classifySimulatorError(new Error("iOS is unsupported on this computer")).kind, "unsupported");
  assert.equal(classifySimulatorError(new Error("Native session exited with code 1")).kind, "failed");
});

test("strips transport wrapper so runtime setup cancellation remains clean", () => {
  const wrapped = new Error("Error invoking 'simulator.requestSetup': Error: Runtime setup was cancelled.");
  const classified = classifySimulatorError(wrapped);
  assert.equal(classified.kind, "setup");
  assert.equal(classified.message, "Runtime setup was cancelled.");
});

test("prefers explicit inner error cause when requestSetup wraps the underlying error", () => {
  const inner = new Error("Runtime setup was cancelled");
  const wrapped = new Error("Error invoking 'simulator.requestSetup': Error: canceled by user");
  wrapped.cause = inner;
  const classified = classifySimulatorError(wrapped);
  assert.equal(classified.kind, "setup");
  assert.equal(classified.message, "Runtime setup was cancelled");
});

test("device creation is single-flight until the active request settles", async () => {
  let resolveCreation;
  let calls = 0;
  const flight = createSingleFlight(async (input) => {
    calls += 1;
    return new Promise((resolve) => { resolveCreation = () => resolve(input); });
  });

  const first = flight.run({ name: "iPhone" });
  const second = flight.run({ name: "Duplicate" });
  assert.equal(flight.pending, true);
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveCreation();
  assert.deepEqual(await first, { name: "iPhone" });
  assert.deepEqual(await second, { name: "iPhone" });
  assert.equal(flight.pending, false);
});

test("new-device entry resolves setup and unavailable states without empty forms", () => {
  const android = {
    platform: "android",
    supported: true,
    status: "setup-required",
    message: "Install Android command-line tools.",
  };
  const missingImage = {
    id: "android-16",
    platform: "android",
    name: "Android 16",
    version: "16",
    status: "missing",
    installable: true,
    message: "Android 16 image is missing.",
  };

  assert.deepEqual(
    resolveNewDeviceState({ platforms: [android], runtimes: [], deviceTypes: [] }),
    {
      kind: "unavailable",
      platform: "android",
      message: "Install Android command-line tools.",
    },
  );
  assert.deepEqual(
    resolveNewDeviceState({ platforms: [android], runtimes: [missingImage], deviceTypes: [] }),
    {
      kind: "setup",
      platform: "android",
      runtime: missingImage,
      message: "Install Android command-line tools.",
    },
  );
  assert.equal(
    resolveNewDeviceState({
      platforms: [android],
      runtimes: [{ ...missingImage, installable: false }],
      deviceTypes: [],
    }).kind,
    "unavailable",
  );
});

test("setup prefers the newest compatible installable runtime regardless of catalog order", () => {
  const runtimes = [
    { id: "android-21", platform: "android", name: "Android 21", version: "21", status: "missing", installable: true },
    { id: "android-36", platform: "android", name: "Android 36", version: "36", status: "missing", installable: true },
    { id: "android-35", platform: "android", name: "Android 35", version: "35", status: "incompatible", installable: true },
    { id: "ios-26", platform: "ios", name: "iOS 26", version: "26.0", status: "missing", installable: true },
  ];

  assert.equal(newestInstallableRuntime(runtimes, "android").id, "android-36");
  assert.equal(
    resolveNewDeviceState({
      platforms: [{ platform: "android", supported: true, status: "setup-required", message: "Install an Android image." }],
      runtimes,
      deviceTypes: [],
      preferredPlatform: "android",
    }).runtime.id,
    "android-36",
  );
});

test("an explicit compatible runtime choice wins over newest-runtime fallback", () => {
  const runtimes = [
    { id: "android-36", platform: "android", version: "36", status: "missing", installable: true },
    { id: "android-21", platform: "android", version: "21", status: "missing", installable: true },
  ];
  assert.equal(
    newestInstallableRuntime(runtimes, "android", "android-21").id,
    "android-21",
  );
});

test("new-device entry selects only a runtime that can create a device", () => {
  const platforms = [
    { platform: "ios", supported: true, status: "setup-required", message: "Install Xcode components." },
    { platform: "android", supported: true, status: "available", message: null },
  ];
  const runtimes = [
    { id: "ios-missing", platform: "ios", status: "missing", installable: false, message: null },
    { id: "android-ready", platform: "android", status: "available", installable: true, message: null },
  ];
  const deviceTypes = [{ id: "pixel", platform: "android", runtimeId: "android-ready" }];

  assert.deepEqual(resolveNewDeviceState({ platforms, runtimes, deviceTypes }), {
    kind: "form",
    platform: "android",
    runtimeId: "android-ready",
  });
  assert.deepEqual(
    resolveNewDeviceState({ platforms, runtimes, deviceTypes, preferredPlatform: "ios" }),
    { kind: "unavailable", platform: "ios", message: "Install Xcode components." },
  );
});

test("setup UI only exposes Install for an installable runtime and retains recovery actions", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  assert.match(appSource, /runtimeInfo\?\.installable === true/);
  assert.match(appSource, /data-action="install-runtime"/);
  assert.match(appSource, /data-action="cancel-state">Cancel/);
  assert.match(appSource, /data-action="cancel-setup"/);
  assert.match(appSource, /"Cancel setup"/);
  assert.match(appSource, /runtime\.simulator\.cancelSetup\(\)/);
  assert.match(appSource, /installing: false,[\s\S]*error: classifySimulatorError\(cause\)\.message/);
});

test("setup requests identify both the selected platform and runtime", () => {
  assert.deepEqual(
    simulatorSetupRequest({ platform: "android", id: "android-16" }),
    { platform: "android", runtimeId: "android-16" },
  );
  assert.deepEqual(
    simulatorSetupRequest({ platform: "ios", id: "ios-26" }),
    { platform: "ios", runtimeId: "ios-26" },
  );
});

test("intentional startup cancellation suppresses only cancellation-shaped failure", () => {
  assert.equal(
    isIntentionalStartupCancellation(
      { phase: "failed", lastError: "Simulator startup was cancelled." },
      true,
    ),
    true,
  );
  assert.equal(
    isIntentionalStartupCancellation(
      { phase: "failed", lastError: "Apple session cleanup failed; process remains live." },
      true,
    ),
    false,
  );
  assert.equal(
    isIntentionalStartupCancellation(
      { phase: "failed", lastError: "Simulator startup was cancelled." },
      false,
    ),
    false,
  );
});

test("startup cancellation invalidates the pending open before closing", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  assert.match(appSource, /openAttemptGeneration \+= 1;[\s\S]*startupCancellationPending = cancellingStartup;[\s\S]*await runtime\.simulator\.close\(\)/);
  assert.match(appSource, /if \(generation !== openAttemptGeneration\) return;/);
  assert.match(appSource, /isIntentionalStartupCancellation\(next, startupCancellationPending\)/);
});

test("responsive live controls preserve every action with unique form IDs", async () => {
  const [appSource, styles] = await Promise.all([
    readFile(new URL("./app.js", import.meta.url), "utf8"),
    readFile(new URL("./styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /responsive-controls-sheet/);
  assert.match(styles, /@media \(max-width: 850px\)[\s\S]*\.responsive-controls \{ display: block; \}/);
  for (const action of ["home", "power", "back", "app-switcher", "volume-up", "volume-down", "rotate", "capture", "copy-target"]) {
    assert.match(appSource, new RegExp(`iconButton\\(\\"${action}\\"|data-action=\\"${action}\\"`));
  }
  assert.match(appSource, /data-type-form/);
  assert.match(appSource, /type-form-\$\{surface\}/);
  assert.match(appSource, /type-input-\$\{surface\}/);
});

test("viewport input is normalized and clamped for the simulator contract", () => {
  const bounds = { left: 100, top: 50, width: 400, height: 800 };
  assert.deepEqual(normalizedViewportPoint({ x: 300, y: 450 }, bounds), { x: 0.5, y: 0.5 });
  assert.deepEqual(normalizedViewportPoint({ x: 20, y: 1000 }, bounds), { x: 0, y: 1 });
});

test("destructive changes are blocked while a device has this tab's lease", () => {
  const device = { id: "phone", state: "ready" };
  const session = { open: true, phase: "ready", device };
  assert.equal(canDestructivelyChange(device, session), false);
  assert.equal(canDestructivelyChange({ ...device, state: "stopped" }, { open: false, phase: "closed", device: null }), true);
});

test("selection and platform grouping remain stable across refreshes", () => {
  const devices = [
    { id: "iphone", platform: "ios" },
    { id: "pixel", platform: "android" },
  ];
  assert.equal(chooseSelectedDevice(devices, "pixel").id, "pixel");
  assert.equal(chooseSelectedDevice(devices, "missing").id, "iphone");
  assert.deepEqual(splitDevices(devices), { apple: [devices[0]], android: [devices[1]] });
});

test("a later action clears a recoverable control error without failing the ready session", () => {
  const readySession = { open: true, phase: "ready" };
  assert.equal(isReadyControlAction("rotate", readySession), true);
  assert.equal(isReadyControlAction("stop-device", readySession), false);

  const failed = reduceControlErrorNotice(null, { type: "failed", message: "Unable To Rotate Device" });
  assert.equal(failed, "Unable To Rotate Device");
  assert.equal(reduceControlErrorNotice(failed, { type: "action-started" }), null);
  assert.deepEqual(readySession, { open: true, phase: "ready" });
});

test("successful live input keeps the mounted device frame", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const typeHandler = appSource.slice(
    appSource.indexOf("void runtime.simulator.type(value).then("),
    appSource.indexOf("const viewport = document.querySelector", appSource.indexOf("void runtime.simulator.type(value).then(")),
  );
  const pointerHandler = appSource.slice(
    appSource.indexOf('viewport?.addEventListener("pointerdown"'),
    appSource.indexOf("function clearStaleNotices"),
  );
  assert.doesNotMatch(typeHandler, /render\(\)/);
  assert.doesNotMatch(pointerHandler, /render\(\)/);
  assert.match(typeHandler, /input\.value = ""/);
  assert.match(appSource, /syncLiveOrientation\(\);\s*return;/);
  assert.match(appSource, /shell\.classList\.add\(session\.orientation\)/);
});

test("ready-state renders preserve the mounted viewport and frame loop", async () => {
  const appSource = await readFile(new URL("./app.js", import.meta.url), "utf8");
  assert.match(appSource, /const mountedViewport = root\.querySelector\("#simulator-viewport"\)/);
  assert.match(appSource, /if \(preserveViewport\) mountedViewport\.remove\(\)/);
  assert.match(appSource, /viewportPlaceholder\.replaceWith\(mountedViewport\)/);
  assert.match(appSource, /if \(!preserveViewport\) syncViewport\(\)/);
  assert.match(appSource, /viewport\.dataset\.inputBound === "true"/);
  assert.match(appSource, /status\?\.remove\(\)/);
  assert.match(appSource, /if \(!status\.isConnected\) viewport\.append\(status\)/);
});

test("device shells size against the App panel rather than the host window", async () => {
  const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.device-shell\.phone\.landscape \{ width: 650px; height: 310px; max-width: 100%; max-height: 100%/);
  assert.match(styles, /\.device-shell\.tablet\.landscape \{ width: 760px; height: 540px; max-width: 100%; max-height: 100%/);
  assert.doesNotMatch(styles, /\.device-shell[^\n]*100vw/);
});
