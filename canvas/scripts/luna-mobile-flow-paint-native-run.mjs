import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  ANDROID_BUNDLE_ID, ANDROID_STATES, CASE_IDS, EVIDENCE_PACKAGE, IOS_BUNDLE_ID, IOS_STATES,
  buildFlowPaintDocument, buildFlowPaintIR, compareFlowPaint, cropRoot, decodePng, newNonce,
  parseReadiness, prepareFlowPaintEvidence, stableHashes,
} from "./luna-mobile-flow-paint-capture.mjs";

const execFile = promisify(execFileCallback);
const evidenceRoot = resolve(process.env.CANVAS_FLOW_PAINT_EVIDENCE_ROOT ?? new URL("../research/luna-mobile-flow-paint-20260907", import.meta.url).pathname);
const platform = process.argv.includes("--android") ? "android" : "ios";
const allowNative = process.env.CANVAS_MOBILE_FLOW_PAINT_ALLOW_NATIVE === "1";
const resumed = process.env.CANVAS_MOBILE_FLOW_PAINT_RESUMED_TEXT_EVIDENCE === "1";
const adb = resolve(process.env.ADB ?? "/Users/emmanuelgyekyeatta-penkra/Library/Android/sdk/platform-tools/adb");
const emulator = resolve(process.env.EMULATOR ?? "/Users/emmanuelgyekyeatta-penkra/Library/Android/sdk/emulator/emulator");
const commandLog = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function record(command, args, options = {}) { const started = new Date().toISOString(); try { const result = await execFile(command, args, { ...options, maxBuffer: 64 * 1024 * 1024 }); commandLog.push({ command, args, started, finished: new Date().toISOString(), exitCode: 0 }); return result; } catch (error) { commandLog.push({ command, args, started, finished: new Date().toISOString(), exitCode: error.code ?? 1, stderr: error.stderr ?? String(error) }); throw error; } }
async function optional(command, args, options = {}) { try { return await record(command, args, options); } catch { return { stdout: "", stderr: "", exitCode: 1 }; } }
async function save(path, value) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, typeof value === "string" ? value : json(value)); }
function stable(hashes) { return stableHashes(hashes.map((hash) => hash.toLowerCase())); }

async function ensureAndroidDevice() {
  const listed = (await record(adb, ["devices"])).stdout ?? "";
  if (/^emulator-5554\s+device$/mu.test(listed)) return false;
  const child = spawn(emulator, ["-avd", "penkra_api36_pixel8", "-no-snapshot-save"], { detached: true, stdio: "ignore" }); child.unref();
  await record(adb, ["wait-for-device"], { timeout: 120000 });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const boot = (await optional(adb, ["-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"])).stdout?.trim();
    if (boot === "1") return true;
    await sleep(2000);
  }
  throw new Error("Android emulator did not finish booting");
}

async function runIos() {
  const buildRoot = await mkdtemp(join(tmpdir(), "canvas-flow-paint-ios-build-")); const derived = join(buildRoot, "DerivedData"); const binaryRoot = join(derived, "Build/Products/Debug-iphonesimulator/CanvasFlowPaintEvidence.app"); const runRoot = join(evidenceRoot, "native-ios-run-01"); await mkdir(runRoot, { recursive: true });
  const configuredBinaryRoot = resolve(process.env.CANVAS_FLOW_PAINT_IOS_APP_PATH ?? binaryRoot); if (process.env.CANVAS_MOBILE_FLOW_PAINT_SKIP_IOS_BUILD !== "1") { await record("xcodegen", ["generate", "--spec", "project.yml"], { cwd: evidenceRoot }); await record("xcodebuild", ["-project", "CanvasFlowPaintEvidence.xcodeproj", "-scheme", "CanvasFlowPaintEvidence", "-sdk", "iphonesimulator", "-configuration", "Debug", "-derivedDataPath", derived, "-jobs", "2"], { cwd: evidenceRoot, timeout: 300000 }); }
  const executable = join(configuredBinaryRoot, "CanvasFlowPaintEvidence"); const binary = await readFile(executable); await save(join(runRoot, "build-result.json"), { command: process.env.CANVAS_MOBILE_FLOW_PAINT_SKIP_IOS_BUILD === "1" ? "reused-prior-swift-build" : commandLog.at(-1), exitCode: 0 }); await save(join(runRoot, "binary-facts.json"), { appPath: configuredBinaryRoot, executable, executableBytes: binary.length, executableSha256: sha256(binary) });
  const listed = JSON.parse((await record("xcrun", ["simctl", "list", "devices", "-j"])).stdout); const entries = [];
  for (const state of IOS_STATES) {
    const found = Object.values(listed.devices ?? {}).flat().find(({ udid }) => udid === state.id); assert.ok(found, `missing iOS device ${state.id}`);
    const initialSize = (await record("xcrun", ["simctl", "ui", state.id, "content_size"])).stdout.trim();
    const initialAppearanceText = (await optional("xcrun", ["simctl", "ui", state.id, "appearance"])).stdout ?? "";
    const initialAppearance = /dark/iu.test(initialAppearanceText) ? "dark" : /light/iu.test(initialAppearanceText) ? "light" : null;
    const booted = found.state === "Shutdown"; if (booted) await record("xcrun", ["simctl", "boot", state.id]); await record("xcrun", ["simctl", "bootstatus", state.id, "-b"], { timeout: 90000 }); await record("xcrun", ["simctl", "install", state.id, configuredBinaryRoot], { timeout: 90000 });
    try {
      await record("xcrun", ["simctl", "ui", state.id, "content_size", state.contentSize]);
      for (const appearance of ["light", "dark"]) {
        await record("xcrun", ["simctl", "ui", state.id, "appearance", appearance]);
        for (const caseId of CASE_IDS) {
          const nonce = newNonce("ios", `${state.key}-${appearance}`, caseId); const started = Date.now(); const dir = join(runRoot, "captures", state.key, appearance, caseId); await mkdir(dir, { recursive: true });
          await record("xcrun", ["simctl", "launch", "--terminate-running-process", state.id, IOS_BUNDLE_ID, `--canvas-case=${caseId}`, `--canvas-nonce=${nonce}`]); let log = ""; let ready = null;
          for (let attempt = 0; attempt < 30; attempt += 1) { await sleep(500); const result = await optional("xcrun", ["simctl", "spawn", state.id, "log", "show", "--style", "compact", "--start", `@${Math.floor(started / 1000)}`, "--predicate", 'eventMessage CONTAINS[c] "LUNA_FLOW_PAINT_READY" OR eventMessage CONTAINS[c] "LUNA_FLOW_PAINT_ROOT"']); log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`; ready = parseReadiness(log, caseId, nonce, "ios"); if (ready) break; }
          await save(join(dir, "ready.log"), log); if (!ready) { entries.push({ platform, device: state.key, appearance, caseId, status: "unmeasured", reason: "exact readiness/root receipt missing" }); continue; }
          const full = []; for (const label of ["a", "b"]) { const path = join(dir, `full-${label}.png`); await record("xcrun", ["simctl", "io", state.id, "screenshot", "--type=png", path]); const bytes = await readFile(path); full.push({ path, bytes, hash: sha256(bytes) }); await sleep(500); } const stability = { hashes: full.map(({ hash }) => hash), stable: stable(full.map(({ hash }) => hash)) }; await save(join(dir, "stability.json"), stability); if (!stability.stable) { entries.push({ platform, device: state.key, appearance, caseId, status: "unmeasured", reason: "consecutive full-frame hashes differ", stability }); continue; }
          const cropped = await cropRoot(full[1].bytes, ready); await writeFile(join(dir, "crop.png"), cropped.bytes); const actual = await decodePng(cropped.bytes); const reference = await decodePng(await readFile(join(evidenceRoot, "references", "ios", state.key, appearance, `${caseId}.png`))); const viewport = state.key === "ipad-large" ? "wide" : "phone"; const comparison = compareFlowPaint(reference, actual, buildFlowPaintIR("ios", buildFlowPaintDocument("ios"), { appearance, viewport }), caseId, state.scale); const row = { platform, device: state.key, appearance, viewport, caseId, status: comparison.status, measurementStatus: "measured", nonce, readiness: ready, stability, cropDimensions: { width: actual.width, height: actual.height }, comparison, paths: { crop: `native-ios-run-01/captures/${state.key}/${appearance}/${caseId}/crop.png`, reference: `references/ios/${state.key}/${appearance}/${caseId}.png` } }; await save(join(dir, "measurement.json"), row); entries.push(row);
        }
      }
    } finally { await optional("xcrun", ["simctl", "ui", state.id, "content_size", initialSize]); if (initialAppearance) await optional("xcrun", ["simctl", "ui", state.id, "appearance", initialAppearance]); if (booted) await optional("xcrun", ["simctl", "shutdown", state.id]); }
  }
  await save(join(runRoot, "measurements.json"), { package: EVIDENCE_PACKAGE, platform, entries, counts: { entries: entries.length, pass: entries.filter((entry) => entry.status === "pass").length, fail: entries.filter((entry) => entry.status === "fail").length, unmeasured: entries.filter((entry) => entry.status === "unmeasured").length } }); await save(join(runRoot, "commands.json"), commandLog); await rm(buildRoot, { recursive: true, force: true });
}

async function runAndroid() {
  const fixture = await mkdtemp(join(tmpdir(), "canvas-flow-paint-compose-")); const generated = join(fixture, "app/src/main/java/generated/canvas"); const host = join(fixture, "app/src/main/java/com/penkra/canvas/fixture"); await cp(resolve(evidenceRoot, "../..", "compatibility/mobile-fixtures/compose"), fixture, { recursive: true }); await mkdir(generated, { recursive: true }); await mkdir(host, { recursive: true });
  const generatedRoot = join(evidenceRoot, "compose/generated"); for (const file of (await (await import("node:fs/promises")).readdir(generatedRoot))) if (file.endsWith(".kt") && file !== "MainActivity.kt") await cp(join(generatedRoot, file), join(generated, file)); await writeFile(join(host, "MainActivity.kt"), (await readFile(join(generatedRoot, "MainActivity.kt"), "utf8")).replaceAll("package com.penkra.canvas.flowpaint", "package com.penkra.canvas.fixture"));
  const runRoot = join(evidenceRoot, "native-android-run-01"); await mkdir(runRoot, { recursive: true }); const startedEmulator = await ensureAndroidDevice(); const densityBefore = (await record(adb, ["-s", "emulator-5554", "shell", "wm", "density"])).stdout; const initialDensity = densityBefore.match(/Override density:\s*(\d+)/u)?.[1] ?? null; const initialFontScale = (await record(adb, ["-s", "emulator-5554", "shell", "settings", "get", "system", "font_scale"])).stdout.trim(); const initialNightMode = (await record(adb, ["-s", "emulator-5554", "shell", "settings", "get", "secure", "ui_night_mode"])).stdout.trim();
  try {
    await record("./gradlew", ["--no-daemon", "--max-workers", "2", ":app:assembleDebug"], { cwd: fixture, timeout: 300000 }); const apk = join(fixture, "app/build/outputs/apk/debug/app-debug.apk"); const apkBytes = await readFile(apk); await save(join(runRoot, "build-result.json"), { command: commandLog.at(-1), exitCode: 0 }); await save(join(runRoot, "binary-facts.json"), { apkPath: apk, apkBytes: apkBytes.length, apkSha256: sha256(apkBytes) }); await record(adb, ["-s", "emulator-5554", "install", "-r", apk], { timeout: 90000 });
    const entries = []; for (const state of ANDROID_STATES) { await record(adb, ["-s", "emulator-5554", "shell", "wm", "density", String(state.density)]); await record(adb, ["-s", "emulator-5554", "shell", "settings", "put", "system", "font_scale", String(state.fontScale)]); for (const appearance of ["light", "dark"]) { await record(adb, ["-s", "emulator-5554", "shell", "cmd", "uimode", "night", appearance === "dark" ? "yes" : "no"]); for (const caseId of CASE_IDS) { const nonce = newNonce("android", `${state.key}-${appearance}`, caseId); const dir = join(runRoot, "captures", state.key, appearance, caseId); await mkdir(dir, { recursive: true }); await record(adb, ["-s", "emulator-5554", "shell", "logcat", "-c"]); await record(adb, ["-s", "emulator-5554", "shell", "am", "force-stop", ANDROID_BUNDLE_ID]); await record(adb, ["-s", "emulator-5554", "shell", "am", "start", "-n", `${ANDROID_BUNDLE_ID}/.MainActivity`, "--es", "canvasCase", caseId, "--es", "canvasNonce", nonce]); await sleep(5000); const log = (await optional(adb, ["-s", "emulator-5554", "logcat", "-d", "-v", "brief", "-t", "400"])).stdout ?? ""; await save(join(dir, "ready.log"), log); const ready = parseReadiness(log, caseId, nonce, "android"); if (!ready) { entries.push({ platform, density: state.density, fontScale: state.fontScale, appearance, caseId, status: "unmeasured", reason: "exact readiness/root receipt missing" }); continue; }
          const full = []; for (const label of ["a", "b"]) { const path = join(dir, `full-${label}.png`); const screenshot = await record(adb, ["-s", "emulator-5554", "exec-out", "screencap", "-p"], { encoding: "buffer" }); const bytes = Buffer.from(screenshot.stdout); await writeFile(path, bytes); full.push({ path, bytes, hash: sha256(bytes) }); await sleep(500); } const stability = { hashes: full.map(({ hash }) => hash), stable: stable(full.map(({ hash }) => hash)) }; await save(join(dir, "stability.json"), stability); if (!stability.stable) { entries.push({ platform, density: state.density, fontScale: state.fontScale, appearance, caseId, status: "unmeasured", reason: "consecutive full-frame hashes differ", stability }); continue; } const cropped = await cropRoot(full[1].bytes, ready); await writeFile(join(dir, "crop.png"), cropped.bytes); const actual = await decodePng(cropped.bytes); const reference = await decodePng(await readFile(join(evidenceRoot, "references", "android", state.key, appearance, `${caseId}.png`))); const viewport = state.density === 320 ? "wide" : "phone"; const comparison = compareFlowPaint(reference, actual, buildFlowPaintIR("android", buildFlowPaintDocument("android"), { appearance, viewport }), caseId, state.scale); const row = { platform, density: state.density, fontScale: state.fontScale, appearance, viewport, caseId, status: comparison.status, measurementStatus: "measured", nonce, readiness: ready, stability, cropDimensions: { width: actual.width, height: actual.height }, comparison, paths: { crop: `native-android-run-01/captures/${state.key}/${appearance}/${caseId}/crop.png`, reference: `references/android/${state.key}/${appearance}/${caseId}.png` } }; await save(join(dir, "measurement.json"), row); entries.push(row); } } }
    await save(join(runRoot, "measurements.json"), { package: EVIDENCE_PACKAGE, platform, entries, counts: { entries: entries.length, pass: entries.filter((entry) => entry.status === "pass").length, fail: entries.filter((entry) => entry.status === "fail").length, unmeasured: entries.filter((entry) => entry.status === "unmeasured").length } });
  } finally {
    await optional(adb, ["-s", "emulator-5554", "shell", "wm", ...(initialDensity ? ["density", initialDensity] : ["density", "reset"])]); await optional(adb, ["-s", "emulator-5554", "shell", "settings", "put", "system", "font_scale", initialFontScale]); if (/^[0-9]+$/u.test(initialNightMode)) await optional(adb, ["-s", "emulator-5554", "shell", "settings", "put", "secure", "ui_night_mode", initialNightMode]); if (startedEmulator) await optional(adb, ["-s", "emulator-5554", "emu", "kill"]); await save(join(runRoot, "device-restoration.json"), { initialDensity, initialFontScale, initialNightMode, startedEmulator, finalDensity: (await optional(adb, ["-s", "emulator-5554", "shell", "wm", "density"])).stdout ?? "", finalFontScale: (await optional(adb, ["-s", "emulator-5554", "shell", "settings", "get", "system", "font_scale"])).stdout?.trim() ?? "", finalNightMode: (await optional(adb, ["-s", "emulator-5554", "shell", "settings", "get", "secure", "ui_night_mode"])).stdout?.trim() ?? "" }); await rm(fixture, { recursive: true, force: true }); await save(join(runRoot, "commands.json"), commandLog);
  }
}

assert.ok(allowNative, "native run requires CANVAS_MOBILE_FLOW_PAINT_ALLOW_NATIVE=1"); assert.ok(resumed, "native run waits for explicit resume_text_evidence completion and device/compiler release"); await prepareFlowPaintEvidence(evidenceRoot); if (platform === "ios") await runIos(); else await runAndroid(); console.log(JSON.stringify({ package: EVIDENCE_PACKAGE, platform, evidenceRoot }, null, 2));
