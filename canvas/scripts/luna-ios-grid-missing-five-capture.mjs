import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import {
  GRID_DEVICES,
  buildGridSources,
  compareGridPixels,
  expectedGridGeometry,
  readyReceipt,
  rootGeometryReceipt,
  sourceHashReceipt,
  stableScreenshotHashes,
} from "./luna-ios-grid-production.mjs";
import { cropPngBytes, cropRectFromRootReceipt, validateFullFrameHashes } from "./luna-ios-grid-capture-utils-20260907.mjs";

export const MISSING_FIVE_CASE_IDS = Object.freeze([
  "grid-c100-180-r60-100-normal",
  "grid-c100-180-r60-100-reversed",
  "grid-c100-180-r60-100-only-2-2",
  "grid-c100-180-r100-60-normal",
  "grid-c100-180-r100-60-reversed",
]);

export const MISSING_FIVE_DEVICE = Object.freeze({
  key: "iphone",
  id: "A3D92728-7F7B-44D1-BE51-155B891905D9",
  contentSize: "large",
  scale: 3,
});

export const MISSING_FIVE_LAUNCH_TIMEOUT_MS = 120_000;
export const MISSING_FIVE_MAX_PAIR_ATTEMPTS = 3;

export function selectMissingFiveCapturePlan() {
  return MISSING_FIVE_CASE_IDS.map((caseID) => ({
    caseID,
    deviceId: MISSING_FIVE_DEVICE.id,
    deviceKey: MISSING_FIVE_DEVICE.key,
    contentSize: MISSING_FIVE_DEVICE.contentSize,
    scale: MISSING_FIVE_DEVICE.scale,
  }));
}

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const sourceEvidence = resolve(root, "research/luna-ios-grid-production-20260907");
const defaultEvidence = join(sourceEvidence, "native-run-02-missing-five");
const evidence = resolve(process.env.CANVAS_GRID_NATIVE_EVIDENCE_ROOT ?? defaultEvidence);
const appPath = resolve(process.env.CANVAS_GRID_APP_PATH ?? JSON.parse(await readFile(join(sourceEvidence, "native-run-02", "binary-facts.json"), "utf8")).appPath);
const binaryFactsPath = join(sourceEvidence, "native-run-02", "binary-facts.json");
const bundleId = "com.penkra.canvas.qa.grid";
const commandLog = [];

function relativeEvidence(path) { return relative(evidence, path).split(sep).join("/"); }
function sleep(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function command(commandName, args, options = {}) {
  const started = new Date().toISOString();
  const commandText = [commandName, ...args].join(" ");
  const timeoutMs = options.timeout ?? null;
  try {
    const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
    const record = {
      command: commandText, args, exitCode: 0, started, finished: new Date().toISOString(),
      signal: null, killed: false, timedOut: false, timeoutMs,
      stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: null,
    };
    commandLog.push(record);
    return { ...result, record };
  } catch (error) {
    const record = {
      command: commandText, args, exitCode: error.code ?? 1, started, finished: new Date().toISOString(),
      signal: error.signal ?? null, killed: error.killed ?? false,
      timedOut: error.code === "ETIMEDOUT" || error.signal === options.killSignal,
      timeoutMs, stdout: error.stdout ?? "", stderr: error.stderr ?? "",
      error: String(error),
    };
    commandLog.push(record);
    throw Object.assign(error, { exitCode: record.exitCode, record });
  }
}

async function allowFailure(commandName, args, options = {}) {
  try { return { ...(await command(commandName, args, options)), code: 0 }; }
  catch (error) { return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", code: error.exitCode ?? 1, record: error.record }; }
}

async function writeEvidence(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

async function requireFreshEvidenceRoot() {
  try {
    await stat(evidence);
    throw new Error(`Evidence root already exists; refusing to overwrite: ${evidence}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(evidence, { recursive: true });
}

async function queryDevice(device) {
  const listed = JSON.parse((await command("xcrun", ["simctl", "list", "devices", "-j"])).stdout);
  const found = Object.values(listed.devices).flat().find(({ udid }) => udid === device.id);
  const ui = await allowFailure("xcrun", ["simctl", "ui", device.id, "content_size"]);
  return { id: device.id, key: device.key, state: found?.state ?? "unknown", contentSize: ui.code === 0 ? ui.stdout.trim() || null : null, contentSizeQuery: ui.record ?? null };
}

async function decodePng(path) {
  const canvasKit = await getCanvasKit();
  const image = canvasKit.MakeImageFromEncoded(await readFile(path));
  assert.ok(image, `CanvasKit could not decode ${path}`);
  try {
    const width = image.width();
    const height = image.height();
    const pixels = image.readPixels(0, 0, { width, height, colorType: canvasKit.ColorType.RGBA_8888, alphaType: canvasKit.AlphaType.Unpremul, colorSpace: canvasKit.ColorSpace.SRGB });
    assert.ok(pixels, `CanvasKit could not read pixels from ${path}`);
    return { width, height, pixels };
  } finally { image.delete(); }
}

async function screenshot(device, path) {
  await mkdir(dirname(path), { recursive: true });
  await command("xcrun", ["simctl", "io", device.id, "screenshot", "--type=png", path]);
  return { path, sha256: sha256(await readFile(path)), image: await decodePng(path) };
}

async function waitForReceipt(device, caseID, nonce, launchDir) {
  const logPath = join(launchDir, "ready-log.txt");
  let combined = "";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = await allowFailure("xcrun", ["simctl", "spawn", device.id, "log", "show", "--style", "compact", "--last", "5s", "--predicate", "eventMessage CONTAINS[c] \"LUNA_GRID_READY\" OR eventMessage CONTAINS[c] \"LUNA_GRID_ROOT\""], { timeout: 10_000, killSignal: "SIGTERM" });
    combined += `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    await writeEvidence(logPath, combined);
    const rootGeometry = rootGeometryReceipt(caseID, nonce, combined);
    if (result.code === 0 && readyReceipt(caseID, nonce, combined) && rootGeometry) return { status: "ready", attempt, logPath: relativeEvidence(logPath), rootGeometry };
    await sleep(500);
  }
  return { status: "unmeasured", reason: "exact case/nonce readiness receipt was not observed within bounded wait", logPath: relativeEvidence(logPath), pattern: `LUNA_GRID_READY case=${caseID} nonce=${nonce}` };
}

async function capturePairAttempt(device, caseID, expected, referencePath, stateDir, nonce, attemptNumber) {
  const attemptId = randomUUID();
  const attemptDir = join(stateDir, "attempts", caseID, `${attemptNumber}-${attemptId}`);
  await mkdir(attemptDir, { recursive: false });
  const launchDir = join(attemptDir, "launch");
  const readiness = await waitForReceipt(device, caseID, nonce, launchDir);
  if (readiness.status !== "ready") return { caseID, deviceId: device.id, contentSize: MISSING_FIVE_DEVICE.contentSize, scale: device.scale, nonce, attemptId, attemptNumber, status: "unmeasured", reason: readiness.reason, readiness, referencePath: relativeEvidence(referencePath) };
  await sleep(2500);
  const fullDir = join(attemptDir, "full");
  const fullA = join(fullDir, `${caseID}-a.png`);
  const fullB = join(fullDir, `${caseID}-b.png`);
  const first = await screenshot(device, fullA);
  await sleep(500);
  const second = await screenshot(device, fullB);
  const hashes = [first.sha256, second.sha256];
  const stability = { hashes, stable: stableScreenshotHashes(hashes), delayMs: 500, paths: [relativeEvidence(fullA), relativeEvidence(fullB)] };
  await writeEvidence(join(launchDir, "stability.json"), stability);
  if (!stability.stable) return { caseID, deviceId: device.id, contentSize: MISSING_FIVE_DEVICE.contentSize, scale: device.scale, nonce, attemptId, attemptNumber, status: "unmeasured", reason: "consecutive screenshot SHA-256 hashes were not identical valid hashes", readiness, stability, referencePath: relativeEvidence(referencePath) };
  const capturedHashes = { a: first.sha256, b: second.sha256 };
  const fullBeforeCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  let crop;
  let cropBytes;
  try {
    crop = cropRectFromRootReceipt(readiness.rootGeometry, second.image, { width: 340, height: 400 });
    cropBytes = await cropPngBytes(await readFile(fullB), crop);
  } catch (error) {
    return { caseID, deviceId: device.id, contentSize: MISSING_FIVE_DEVICE.contentSize, scale: device.scale, nonce, attemptId, attemptNumber, status: "unmeasured", reason: `root receipt crop rejected: ${error.message}`, readiness, stability, fullCapturePaths: stability.paths, referencePath: relativeEvidence(referencePath) };
  }
  const capturePath = join(attemptDir, "crop.png");
  await writeFile(capturePath, cropBytes.bytes, { flag: "wx" });
  const fullAfterCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  let fullFrameHashStability;
  try { fullFrameHashStability = validateFullFrameHashes({ captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop }); }
  catch (error) { fullFrameHashStability = { captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop, stable: false, reason: error.message }; }
  await writeEvidence(join(launchDir, "full-frame-hash-stability.json"), fullFrameHashStability);
  if (!fullFrameHashStability.stable) return { caseID, deviceId: device.id, contentSize: MISSING_FIVE_DEVICE.contentSize, scale: device.scale, nonce, attemptId, attemptNumber, status: "unmeasured", reason: "full screenshot bytes changed between pre-crop and post-crop rehash", readiness, stability, fullFrameHashStability, fullCapturePaths: stability.paths, crop, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath) };
  const native = await decodePng(capturePath);
  const comparison = compareGridPixels(expected, native, device.scale);
  return { caseID, deviceId: device.id, contentSize: MISSING_FIVE_DEVICE.contentSize, scale: device.scale, nonce, attemptId, attemptNumber, status: comparison.status === "pass" ? "pass" : "fail", measurementStatus: "measured", readiness, stability, fullFrameHashStability, fullCapturePaths: stability.paths, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath), crop, comparison };
}

async function captureCase(device, caseID, expected, referencePath, stateDir, sequence, nonce) {
  const attempts = [];
  for (let attemptNumber = 1; attemptNumber <= MISSING_FIVE_MAX_PAIR_ATTEMPTS; attemptNumber += 1) {
    const result = await capturePairAttempt(device, caseID, expected, referencePath, stateDir, nonce, attemptNumber);
    attempts.push(result);
    if (result.measurementStatus === "measured") return { ...result, attempts };
  }
  return { ...attempts.at(-1), attempts };
}

async function verifyInstalledBundle(device, expectedBinary) {
  let container;
  try {
    container = await command("xcrun", ["simctl", "get_app_container", device.id, bundleId, "app"], { timeout: 30_000, killSignal: "SIGTERM" });
    const appContainer = container.stdout.trim();
    const installedExecutablePath = join(appContainer, "CanvasGridEvidence");
    const installedSha256 = sha256(await readFile(installedExecutablePath));
    const result = { bundleId, appContainer, installedExecutablePath, installedSha256, expectedSha256: expectedBinary.sha256, matches: installedSha256 === expectedBinary.sha256, command: container.record };
    if (!result.matches) throw new Error(`installed executable SHA-256 mismatch: expected ${expectedBinary.sha256}, got ${installedSha256}`);
    return result;
  } catch (error) {
    return { bundleId, matches: false, failure: { message: String(error), exitCode: error.exitCode ?? null, signal: error.signal ?? null, killed: error.killed ?? false, stdout: error.record?.stdout ?? error.stdout ?? "", stderr: error.record?.stderr ?? error.stderr ?? "", command: error.record ?? null }, command: container?.record ?? null };
  }
}

async function setupDevice(device, expectedBinary, initial) {
  const setup = { deviceId: device.id, deviceKey: device.key, initialState: initial, bootedByRunner: false, installed: false, installAttempted: false };
  if (initial.state === "Shutdown") {
    try { await command("xcrun", ["simctl", "boot", device.id]); setup.bootedByRunner = true; }
    catch (error) { return { ...setup, failure: { phase: "boot", exitCode: error.exitCode, stdout: error.record?.stdout ?? "", stderr: error.record?.stderr ?? String(error), signal: error.signal ?? null, killed: error.killed ?? false } }; }
  }
  const bootstatus = await allowFailure("xcrun", ["simctl", "bootstatus", device.id, "-b"], { timeout: 60_000, killSignal: "SIGTERM" });
  if (bootstatus.code !== 0) return { ...setup, failure: { phase: "bootstatus", exitCode: bootstatus.code, stdout: bootstatus.stdout, stderr: bootstatus.stderr, command: bootstatus.record } };
  const observed = await queryDevice(device);
  setup.observedContentSize = observed.contentSize;
  if (!observed.contentSize) return { ...setup, failure: { phase: "content_size", exitCode: observed.contentSizeQuery?.exitCode ?? 1, stdout: observed.contentSizeQuery?.stdout ?? "", stderr: observed.contentSizeQuery?.stderr ?? "" } };
  setup.installedBundle = await verifyInstalledBundle(device, expectedBinary);
  if (!setup.installedBundle.matches) return { ...setup, failure: { phase: "installed_bundle_verification", ...setup.installedBundle.failure } };
  setup.installed = true;
  return setup;
}

async function restoreDevice(device, setup) {
  const actions = [];
  if (!setup) return actions;
  if (setup.observedContentSize) actions.push(await allowFailure("xcrun", ["simctl", "ui", device.id, "content_size", setup.observedContentSize]));
  if (setup.bootedByRunner) actions.push(await allowFailure("xcrun", ["simctl", "shutdown", device.id]));
  return actions.map(({ code, stdout, stderr, record }) => ({ code, stdout, stderr, command: record ?? null }));
}

async function main() {
  await requireFreshEvidenceRoot();
  const expectedBinary = JSON.parse(await readFile(binaryFactsPath, "utf8"));
  const currentSourceReceipt = sourceHashReceipt(buildGridSources().sources);
  const hostExecutablePath = join(appPath, expectedBinary.executable);
  const hostSha256 = sha256(await readFile(hostExecutablePath));
  const preflight = {
    appPath, hostExecutablePath, hostSha256, expectedSha256: expectedBinary.sha256,
    sourceSha256: currentSourceReceipt.sourceSha256, expectedSourceSha256: expectedBinary.sourceSha256,
    hostMatches: hostSha256 === expectedBinary.sha256, sourceMatches: currentSourceReceipt.sourceSha256 === expectedBinary.sourceSha256,
  };
  await writeEvidence(join(evidence, "preflight-binary.json"), preflight);
  if (!preflight.hostMatches || !preflight.sourceMatches) throw new Error(`run02 binary/source verification failed before device mutation: ${JSON.stringify(preflight)}`);
  await writeEvidence(join(evidence, "source-hashes.json"), currentSourceReceipt);
  await writeEvidence(join(evidence, "capture-plan.json"), { cases: MISSING_FIVE_CASE_IDS, device: MISSING_FIVE_DEVICE, launchTimeoutMs: MISSING_FIVE_LAUNCH_TIMEOUT_MS, maxPairAttempts: MISSING_FIVE_MAX_PAIR_ATTEMPTS, oneLaunchPerCase: true, install: "not authorized; installed bundle hash is verified only" });
  const expected = Object.fromEntries(expectedGridGeometry(JSON.parse(await readFile(join(sourceEvidence, "ir.json"), "utf8"))).map((entry) => [entry.caseId, entry]));
  const initial = await queryDevice(MISSING_FIVE_DEVICE);
  const setups = {};
  const entries = [];
  try {
    setups[MISSING_FIVE_DEVICE.key] = await setupDevice(MISSING_FIVE_DEVICE, expectedBinary, initial);
    const setup = setups[MISSING_FIVE_DEVICE.key];
    if (setup.installed) {
      const stateSet = await allowFailure("xcrun", ["simctl", "ui", MISSING_FIVE_DEVICE.id, "content_size", "large"]);
      if (stateSet.code === 0) {
        for (const [sequence, caseID] of MISSING_FIVE_CASE_IDS.entries()) {
          const stateDir = join(evidence, "captures", MISSING_FIVE_DEVICE.key, "large");
          const referencePath = join(sourceEvidence, "references", "iphone-large", `${caseID}.png`);
          const nonce = `grid-run-02-missing-five-${caseID}-${sequence + 1}-${randomUUID()}`;
          const attemptRoot = join(stateDir, "attempts", caseID, `launch-${nonce}`);
          await mkdir(attemptRoot, { recursive: true });
          const launchDir = join(attemptRoot, "launch");
          const launchArgs = ["simctl", "launch", "--terminate-running-process", MISSING_FIVE_DEVICE.id, bundleId, "--grid-case", caseID, "--grid-nonce", nonce];
          let launch;
          try {
            launch = await command("xcrun", launchArgs, { timeout: MISSING_FIVE_LAUNCH_TIMEOUT_MS, killSignal: "SIGTERM" });
          } catch (error) {
            const failure = { caseID, deviceId: MISSING_FIVE_DEVICE.id, contentSize: "large", scale: MISSING_FIVE_DEVICE.scale, nonce, status: "unmeasured", reason: "simctl launch failed", launch: error.record, launchFailurePath: relativeEvidence(join(launchDir, "launch-failure.log")), referencePath: relativeEvidence(referencePath) };
            await writeEvidence(join(launchDir, "launch-failure.log"), JSON.stringify(error.record, null, 2) + "\n");
            await writeEvidence(join(launchDir, "launch.json"), error.record);
            entries.push({ ...failure, attempts: [] });
            continue;
          }
          const pid = launch.stdout.match(/(\d+)\s*$/mu)?.[1] ?? null;
          await writeEvidence(join(launchDir, "launch.json"), { ...launch.record, pid, args: launchArgs });
          if (!pid) {
            entries.push({ caseID, deviceId: MISSING_FIVE_DEVICE.id, contentSize: "large", scale: MISSING_FIVE_DEVICE.scale, nonce, status: "unmeasured", reason: "simctl launch returned no PID", launch: launch.record, referencePath: relativeEvidence(referencePath), attempts: [] });
            continue;
          }
          entries.push(await captureCase(MISSING_FIVE_DEVICE, caseID, expected[caseID], referencePath, stateDir, sequence + 1, nonce));
        }
      } else {
        for (const caseID of MISSING_FIVE_CASE_IDS) entries.push({ caseID, deviceId: MISSING_FIVE_DEVICE.id, contentSize: "large", scale: MISSING_FIVE_DEVICE.scale, status: "unmeasured", reason: "content-size mutation failed", setupFailure: { phase: "content_size_set", exitCode: stateSet.code, stdout: stateSet.stdout, stderr: stateSet.stderr, command: stateSet.record }, attempts: [] });
      }
    } else {
      for (const caseID of MISSING_FIVE_CASE_IDS) entries.push({ caseID, deviceId: MISSING_FIVE_DEVICE.id, contentSize: "large", scale: MISSING_FIVE_DEVICE.scale, status: "unmeasured", reason: "installed bundle verification did not complete", setupFailure: setup.failure ?? null, attempts: [] });
    }
  } finally {
    const restoration = { [MISSING_FIVE_DEVICE.key]: await restoreDevice(MISSING_FIVE_DEVICE, setups[MISSING_FIVE_DEVICE.key]) };
    await writeEvidence(join(evidence, "restoration.json"), { initialStates: { iphone: initial }, setups, restoration });
  }
  const finalState = await queryDevice(MISSING_FIVE_DEVICE);
  await writeEvidence(join(evidence, "device-state.json"), { initialStates: { iphone: initial }, finalStates: { iphone: finalState }, setups });
  const measured = entries.filter(({ measurementStatus }) => measurementStatus === "measured");
  await writeEvidence(join(evidence, "measurements.json"), {
    package: "luna-ios-grid-production-20260907-missing-five", sourceSha256: currentSourceReceipt.sourceSha256,
    expectedIdentities: MISSING_FIVE_CASE_IDS.map((caseID) => `${caseID}|${MISSING_FIVE_DEVICE.id}|large`), entries,
    counts: { entries: entries.length, measured: measured.length, pass: entries.filter(({ status }) => status === "pass").length, fail: entries.filter(({ status }) => status === "fail").length, unmeasured: entries.filter(({ status }) => status === "unmeasured").length },
  });
  await writeEvidence(join(evidence, "commands.json"), commandLog);
  console.log(JSON.stringify({ evidence, entries: entries.length, counts: { measured: measured.length, pass: entries.filter(({ status }) => status === "pass").length, fail: entries.filter(({ status }) => status === "fail").length, unmeasured: entries.filter(({ status }) => status === "unmeasured").length }, finalState }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
