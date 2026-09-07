import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { cropPngBytes, cropRectFromRootReceipt, validateFullFrameHashes } from "./luna-ios-grid-capture-utils-20260907.mjs";
import {
  ANDROID_BUNDLE_ID, ANDROID_STATES, DEFAULT_EVIDENCE_ROOT, IOS_BUNDLE_ID, IOS_DEVICES, TEXT_CASES,
  buildFixedTextDocument, buildFixedTextIR, classifyFixedTextCase, compareFixedTextPixels, prepareFixedTextEvidence, sourceHashReceipt,
} from "./luna-mobile-fixed-text-capture.mjs";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const evidenceRoot = resolve(process.env.CANVAS_FIXED_TEXT_EVIDENCE_ROOT ?? DEFAULT_EVIDENCE_ROOT);
const allowNative = process.env.CANVAS_FIXED_TEXT_ALLOW_NATIVE === "1";
const platform = process.argv.includes("--android") ? "android" : "ios";
const adb = resolve(process.env.ADB ?? "/Users/emmanuelgyekyeatta-penkra/Library/Android/sdk/platform-tools/adb");
const emulator = resolve(process.env.EMULATOR ?? "/Users/emmanuelgyekyeatta/Library/Android/sdk/emulator/emulator");
const commandLog = [];

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sleep(ms) { return new Promise((done) => setTimeout(done, ms)); }
async function record(command, args, options = {}) {
  const started = new Date().toISOString();
  try {
    const result = await execFile(command, args, { ...options, maxBuffer: 64 * 1024 * 1024 });
    commandLog.push({ command, args, started, finished: new Date().toISOString(), exitCode: 0, stdout: result.stdout, stderr: result.stderr });
    return result;
  } catch (error) {
    commandLog.push({ command, args, started, finished: new Date().toISOString(), exitCode: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) });
    throw error;
  }
}
async function optional(command, args, options = {}) { try { return { ...(await record(command, args, options)), exitCode: 0 }; } catch (error) { return { exitCode: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) }; } }
async function save(path, value) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, typeof value === "string" ? value : json(value)); }
async function decode(bytes) { const kit = await getCanvasKit(); const image = kit.MakeImageFromEncoded(bytes); assert.ok(image); try { const width = image.width(); const height = image.height(); return { width, height, pixels: new Uint8Array(image.readPixels(0, 0, { width, height, colorType: kit.ColorType.RGBA_8888, alphaType: kit.AlphaType.Unpremul, colorSpace: kit.ColorSpace.SRGB })) }; } finally { image.delete(); } }
async function crop(bytes, rect) { return cropPngBytes(bytes, rect, await getCanvasKit()); }

function parseIosRoot(caseID, nonce, log) {
  const n = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
  const match = String(log).match(new RegExp(`LUNA_FIXED_TEXT_ROOT case=${caseID.replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\\\$&")} nonce=${nonce.replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\\\$&")} frame=${n},${n} ${n}x${n} scale=${n}`, "u"));
  if (!match) return null;
  const values = match.slice(1).map(Number); if (values.some((value) => !Number.isFinite(value))) return null;
  return { root: { x: values[0], y: values[1], width: values[2], height: values[3] }, scale: values[4] };
}
function parseAndroidRoot(caseID, nonce, log) {
  const escaped = (value) => String(value).replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\\\$&");
  const match = String(log).match(new RegExp(`LUNA_FIXED_TEXT_ROOT case=${escaped(caseID)} nonce=${escaped(nonce)} x=(-?\\d+(?:\\.\\d+)?) y=(-?\\d+(?:\\.\\d+)?) width=(\\d+(?:\\.\\d+)?) height=(\\d+(?:\\.\\d+)?) scale=(\\d+(?:\\.\\d+)?)`, "u"));
  if (!match) return null;
  const values = match.slice(1).map(Number); if (values.some((value) => !Number.isFinite(value))) return null;
  return { root: { x: values[0], y: values[1], width: values[2], height: values[3] }, scale: values[4] };
}
function receipt(log, caseID, nonce, isAndroid) { const escaped = String(caseID).replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\\\$&"); const n = String(nonce).replace(/[.*+?^${}()|[\\]\\\\]/gu, "\\\\$&"); return new RegExp(`LUNA_FIXED_TEXT_READY case=${escaped} nonce=${n}(?:\\n|$)`, "u").test(log) && (isAndroid ? parseAndroidRoot(caseID, nonce, log) : parseIosRoot(caseID, nonce, log)); }
function stable(hashes) { return hashes.length === 2 && hashes.every((hash) => /^[0-9a-f]{64}$/u.test(hash)) && hashes[0] === hashes[1]; }

async function iosLog(device, since) { const result = await optional("xcrun", ["simctl", "spawn", device.id, "log", "show", "--style", "compact", "--start", `@${Math.floor(since / 1000)}`, "--predicate", "eventMessage CONTAINS[c] \\\"LUNA_FIXED_TEXT_READY\\\" OR eventMessage CONTAINS[c] \\\"LUNA_FIXED_TEXT_ROOT\\\""]); return `${result.stdout ?? ""}\n${result.stderr ?? ""}`; }
async function androidLog() { const result = await optional(adb, ["-s", "emulator-5554", "logcat", "-d", "-v", "brief", "-t", "400"]); return `${result.stdout ?? ""}\n${result.stderr ?? ""}`; }

async function runIos() {
  const buildRoot = await mkdtemp(join(tmpdir(), "canvas-fixed-text-ios-build-"));
  const derived = join(buildRoot, "DerivedData");
  const binaryRoot = join(derived, "Build/Products/Debug-iphonesimulator/CanvasFixedTextEvidence.app");
  const native = join(evidenceRoot, "native-ios-run-01"); await mkdir(native, { recursive: true });
  await record("xcodegen", ["generate", "--spec", "project.yml"], { cwd: evidenceRoot });
  try {
    await record("xcodebuild", ["-project", "CanvasFixedTextEvidence.xcodeproj", "-scheme", "CanvasFixedTextEvidence", "-sdk", "iphonesimulator", "-configuration", "Debug", "-derivedDataPath", derived, "-jobs", "2"], { cwd: evidenceRoot, timeout: 240000 });
    await save(join(native, "build-result.json"), { exitCode: 0, command: commandLog.at(-1) });
    const executable = join(binaryRoot, "CanvasFixedTextEvidence");
    const binary = await readFile(executable); await save(join(native, "binary-facts.json"), { appPath: binaryRoot, executable: "CanvasFixedTextEvidence", executableSha256: sha256(binary), executableBytes: binary.length });
    const listed = JSON.parse((await record("xcrun", ["simctl", "list", "devices", "-j"])).stdout);
    const setups = {}; const entries = [];
    for (const declared of IOS_DEVICES) {
      const found = Object.values(listed.devices ?? {}).flat().find(({ udid }) => udid === declared.id); assert.ok(found, `missing iOS device ${declared.id}`);
      const sizeResult = await record("xcrun", ["simctl", "ui", declared.id, "content_size"]); const initialSize = sizeResult.stdout.trim();
      const bootedByRunner = found.state === "Shutdown"; if (bootedByRunner) await record("xcrun", ["simctl", "boot", declared.id]); await record("xcrun", ["simctl", "bootstatus", declared.id, "-b"], { timeout: 60000 }); await record("xcrun", ["simctl", "install", declared.id, binaryRoot], { timeout: 60000 });
      setups[declared.key] = { initialState: found.state, initialContentSize: initialSize, bootedByRunner };
      try {
        for (const contentSize of declared.contentSizes) {
          await record("xcrun", ["simctl", "ui", declared.id, "content_size", contentSize]);
          for (const item of TEXT_CASES) {
            const nonce = `fixed-text-${declared.key}-${contentSize}-${item.id}-${randomUUID()}`; const start = Date.now();
            await record("xcrun", ["simctl", "launch", "--terminate-running-process", declared.id, IOS_BUNDLE_ID, "--canvas-case", item.id, "--canvas-nonce", nonce]);
            let log = ""; let ready = null; for (let attempt = 1; attempt <= 20; attempt += 1) { await sleep(500); log = await iosLog(declared, start); ready = receipt(log, item.id, nonce, false); if (ready) break; }
            const entryDir = join(native, "captures", declared.key, contentSize, item.id); await mkdir(entryDir, { recursive: true }); await save(join(entryDir, "ready.log"), log);
            if (!ready) { entries.push({ platform: "ios", device: declared.key, contentSize, caseId: item.id, classification: classifyFixedTextCase(item.id), status: "unmeasured", reason: "exact readiness/root receipt missing" }); continue; }
            const full = []; for (const label of ["a", "b"]) { const path = join(entryDir, `full-${label}.png`); await record("xcrun", ["simctl", "io", declared.id, "screenshot", "--type=png", path]); const bytes = await readFile(path); full.push({ path, bytes, hash: sha256(bytes) }); await sleep(500); }
            const stability = { hashes: full.map(({ hash }) => hash), stable: stable(full.map(({ hash }) => hash)) }; await save(join(entryDir, "stability.json"), stability);
            if (!stability.stable) { entries.push({ platform: "ios", device: declared.key, contentSize, caseId: item.id, classification: classifyFixedTextCase(item.id), status: "unmeasured", reason: "consecutive full-frame hashes differ", stability }); continue; }
            const image = await decode(full[1].bytes); const rect = cropRectFromRootReceipt(ready, image, { width: 340, height: 180 }); const cropped = await crop(full[1].bytes, rect); const capturePath = join(entryDir, "crop.png"); await writeFile(capturePath, cropped.bytes); const reference = await decode(await readFile(join(evidenceRoot, "references/ios", `${declared.key}-${contentSize}`, `${item.id}.png`))); const comparison = compareFixedTextPixels(reference, cropped); const row = { platform: "ios", device: declared.key, contentSize, caseId: item.id, classification: classifyFixedTextCase(item.id), status: comparison.status, measurementStatus: "measured", nonce, readiness: ready, stability, capturePath, comparison }; await save(join(entryDir, "measurement.json"), row); entries.push(row);
          }
        }
      } finally { await optional("xcrun", ["simctl", "ui", declared.id, "content_size", initialSize]); if (bootedByRunner) await optional("xcrun", ["simctl", "shutdown", declared.id]); }
    }
    await save(join(native, "measurements.json"), { platform: "ios", entries, counts: counts(entries), sourceHashes: JSON.parse(await readFile(join(evidenceRoot, "source-hashes.json"), "utf8")) });
  } finally { await optional("rm", ["-f", join(evidenceRoot, "CanvasFixedTextEvidence.xcodeproj", "project.pbxproj")]); await rm(buildRoot, { recursive: true, force: true }); }
}

function counts(entries) { return { entries: entries.length, measured: entries.filter(({ measurementStatus }) => measurementStatus === "measured").length, pass: entries.filter(({ status }) => status === "pass").length, fail: entries.filter(({ status }) => status === "fail").length, unmeasured: entries.filter(({ status }) => status === "unmeasured").length, byClassification: Object.fromEntries([...new Set(TEXT_CASES.map(({ classification }) => classification))].map((classification) => [classification, entries.filter((entry) => entry.classification === classification).reduce((acc, entry) => ({ ...acc, [entry.status]: (acc[entry.status] ?? 0) + 1 }), {})])) }; }

async function runAndroid() {
  const native = join(evidenceRoot, "native-android-run-01"); await mkdir(native, { recursive: true }); const fixture = await mkdtemp(join(tmpdir(), "canvas-fixed-text-compose-")); const sourceDir = join(fixture, "app/src/main/java/generated/canvas"); const packageDir = join(fixture, "app/src/main/java/com/penkra/canvas/fixture");
  await cp(resolve(root, "compatibility/mobile-fixtures/compose"), fixture, { recursive: true });
  for (const file of await (await import("node:fs/promises")).readdir(join(evidenceRoot, "compose/generated"))) await cp(join(evidenceRoot, "compose/generated", file), join(sourceDir, file));
  await cp(join(evidenceRoot, "compose/generated/MainActivity.kt"), join(packageDir, "MainActivity.kt"));
  const adbDevices = await record(adb, ["devices"]); let startedProcess = null; if (!/emulator-5554\s+device/u.test(adbDevices.stdout)) { startedProcess = spawn(emulator, ["-avd", "penkra_api36_pixel8"], { detached: true, stdio: "ignore" }); startedProcess.unref(); await record(adb, ["wait-for-device"], { timeout: 120000 }); for (let i = 0; i < 60; i += 1) { if ((await optional(adb, ["-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"])).stdout?.trim() === "1") break; await sleep(1000); } }
  const densityText = (await record(adb, ["-s", "emulator-5554", "shell", "wm", "density"])).stdout; const initialDensity = densityText.match(/Override density:\s*(\d+)/u)?.[1] ?? null; const physicalDensity = densityText.match(/Physical density:\s*(\d+)/u)?.[1] ?? null; const initialFontScale = (await record(adb, ["-s", "emulator-5554", "shell", "settings", "get", "system", "font_scale"])).stdout.trim();
  try {
    const build = await record("./gradlew", ["--no-daemon", "--max-workers", "2", ":app:assembleDebug"], { cwd: fixture, timeout: 240000 }); await save(join(native, "build-result.json"), { exitCode: 0, command: commandLog.at(-1) }); const apk = join(fixture, "app/build/outputs/apk/debug/app-debug.apk"); const apkBytes = await readFile(apk); await save(join(native, "binary-facts.json"), { apkPath: apk, apkSha256: sha256(apkBytes), apkBytes: apkBytes.length }); await record(adb, ["-s", "emulator-5554", "install", "-r", apk], { timeout: 60000 });
    const entries = []; for (const state of ANDROID_STATES) { await record(adb, ["-s", "emulator-5554", "shell", "wm", "density", String(state.density)]); await record(adb, ["-s", "emulator-5554", "shell", "settings", "put", "system", "font_scale", String(state.fontScale)]); for (const item of TEXT_CASES) { const nonce = `fixed-text-android-${state.density}-${state.fontScale}-${item.id}-${randomUUID()}`; const dir = join(native, "captures", `density-${state.density}-font-${state.fontScale}`, item.id); await mkdir(dir, { recursive: true }); await record(adb, ["-s", "emulator-5554", "shell", "logcat", "-c"]); await record(adb, ["-s", "emulator-5554", "shell", "am", "force-stop", ANDROID_BUNDLE_ID]); await record(adb, ["-s", "emulator-5554", "shell", "am", "start", "-n", `${ANDROID_BUNDLE_ID}/.MainActivity`, "--es", "canvasCase", item.id, "--es", "canvasNonce", nonce]); await sleep(5000); const log = await androidLog(); await save(join(dir, "ready.log"), log); const ready = receipt(log, item.id, nonce, true); if (!ready) { entries.push({ platform: "android", density: state.density, fontScale: state.fontScale, caseId: item.id, classification: classifyFixedTextCase(item.id), status: "unmeasured", reason: "exact readiness/root receipt missing" }); continue; } const full = []; for (const label of ["a", "b"]) { const bytes = Buffer.from((await record(adb, ["-s", "emulator-5554", "exec-out", "screencap", "-p"], { encoding: "buffer" })).stdout); const path = join(dir, `full-${label}.png`); await writeFile(path, bytes); full.push({ path, bytes, hash: sha256(bytes) }); await sleep(500); } const stability = { hashes: full.map(({ hash }) => hash), stable: stable(full.map(({ hash }) => hash)) }; await save(join(dir, "stability.json"), stability); if (!stability.stable) { entries.push({ platform: "android", density: state.density, fontScale: state.fontScale, caseId: item.id, classification: classifyFixedTextCase(item.id), status: "unmeasured", reason: "consecutive full-frame hashes differ", stability }); continue; } const image = await decode(full[1].bytes); const x = Math.round(ready.root.x * ready.scale); const y = Math.round(ready.root.y * ready.scale); const width = Math.round(ready.root.width * ready.scale); const height = Math.round(ready.root.height * ready.scale); const cropped = await crop(full[1].bytes, { x, y, width, height }); const capturePath = join(dir, "crop.png"); await writeFile(capturePath, cropped.bytes); const reference = await decode(await readFile(join(evidenceRoot, "references/android", `density-${state.density}-font-${state.fontScale}`, `${item.id}.png`))); const comparison = compareFixedTextPixels(reference, cropped); const row = { platform: "android", density: state.density, fontScale: state.fontScale, caseId: item.id, classification: classifyFixedTextCase(item.id), status: comparison.status, measurementStatus: "measured", nonce, readiness: ready, stability, capturePath, comparison, fullDimensions: { width: image.width, height: image.height } }; await save(join(dir, "measurement.json"), row); entries.push(row); } }
    await save(join(native, "measurements.json"), { platform: "android", entries, counts: counts(entries), sourceHashes: JSON.parse(await readFile(join(evidenceRoot, "source-hashes.json"), "utf8")) });
  } finally { await optional(adb, ["-s", "emulator-5554", "shell", initialDensity ? "wm" : "wm", ...(initialDensity ? ["density", initialDensity] : ["density", "reset"])]); await optional(adb, ["-s", "emulator-5554", "shell", "settings", "put", "system", "font_scale", initialFontScale]); await save(join(native, "device-restoration.json"), { initialDensity, physicalDensity, initialFontScale, startedByRunner: Boolean(startedProcess), finalDensity: (await optional(adb, ["-s", "emulator-5554", "shell", "wm", "density"])).stdout, finalFontScale: (await optional(adb, ["-s", "emulator-5554", "shell", "settings", "get", "system", "font_scale"])).stdout.trim() }); if (startedProcess) await optional(adb, ["-s", "emulator-5554", "emu", "kill"]); await rm(fixture, { recursive: true, force: true }); }
}

assert.ok(allowNative, "native run requires CANVAS_FIXED_TEXT_ALLOW_NATIVE=1");
await prepareFixedTextEvidence(evidenceRoot);
if (platform === "ios") await runIos(); else await runAndroid();
await save(join(evidenceRoot, `native-${platform}-run-01`, "commands.json"), commandLog.map(({ stdout, stderr, ...entry }) => entry));
