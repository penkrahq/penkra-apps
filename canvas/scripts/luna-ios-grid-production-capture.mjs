import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import {
  GRID_CASE_IDS,
  GRID_DEVICES,
  GRID_MATRIX_CASE_IDS,
  buildGridSources,
  compareGridPixels,
  expectedGridGeometry,
  readyReceipt,
  rootGeometryReceipt,
  sourceHashReceipt,
  stableScreenshotHashes,
} from "./luna-ios-grid-production.mjs";
import { cropPngBytes, cropRectFromRootReceipt, validateFullFrameHashes } from "./luna-ios-grid-capture-utils-20260907.mjs";

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const sourceEvidence = resolve(root, "research/luna-ios-grid-production-20260907");
const evidence = resolve(process.env.CANVAS_GRID_NATIVE_EVIDENCE_ROOT ?? join(sourceEvidence, "native-run-02"));
const temp = resolve(process.env.CANVAS_GRID_BUILD_ROOT ?? "");
const appPath = resolve(process.env.CANVAS_GRID_APP_PATH ?? join(temp, "DerivedData/Build/Products/Debug-iphonesimulator/CanvasGridEvidence.app"));
const bundleId = "com.penkra.canvas.qa.grid";
const commandLog = [];

function relativeEvidence(path) { return relative(evidence, path).split(sep).join("/"); }
function sleep(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function command(commandName, args, options = {}) {
  const started = new Date().toISOString();
  const commandText = [commandName, ...args].join(" ");
  try {
    const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
    const record = { command: commandText, args, exitCode: 0, started, finished: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr };
    commandLog.push(record);
    return { ...result, record };
  } catch (error) {
    const record = { command: commandText, args, exitCode: error.code ?? 1, started, finished: new Date().toISOString(), stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) };
    commandLog.push(record);
    throw Object.assign(error, { exitCode: record.exitCode, record });
  }
}

async function allowFailure(commandName, args, options = {}) {
  try { return { ...(await command(commandName, args, options)), code: 0 }; }
  catch (error) { return { stdout: error.stdout ?? "", stderr: error.stderr ?? String(error), code: error.exitCode ?? 1, record: error.record }; }
}

async function writeEvidence(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

async function queryDevice(device) {
  const listed = JSON.parse((await command("xcrun", ["simctl", "list", "devices", "-j"])).stdout);
  const found = Object.values(listed.devices).flat().find(({ udid }) => udid === device.id);
  const ui = await allowFailure("xcrun", ["simctl", "ui", device.id, "content_size"]);
  return { id: device.id, key: device.key, state: found?.state ?? "unknown", contentSize: ui.code === 0 ? ui.stdout.trim() || null : null, contentSizeQuery: ui.record ?? null };
}

async function decodePng(path) {
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(await readFile(path));
  assert.ok(image, `CanvasKit could not decode ${path}`);
  try {
    const width = image.width();
    const height = image.height();
    const pixels = image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
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
    const result = await allowFailure("xcrun", ["simctl", "spawn", device.id, "log", "show", "--style", "compact", "--last", "5s", "--predicate", "eventMessage CONTAINS[c] \"LUNA_GRID_READY\""], { timeout: 10000, killSignal: "SIGTERM" });
    combined += `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    await writeEvidence(logPath, combined);
    const rootGeometry = rootGeometryReceipt(caseID, nonce, combined);
    if (result.code === 0 && readyReceipt(caseID, nonce, combined) && rootGeometry) return { status: "ready", attempt, logPath: relativeEvidence(logPath), pattern: `LUNA_GRID_READY case=${caseID} nonce=${nonce}`, rootGeometry };
    await sleep(500);
  }
  return { status: "unmeasured", reason: "exact case/nonce readiness receipt was not observed within bounded wait", logPath: relativeEvidence(logPath), pattern: `LUNA_GRID_READY case=${caseID} nonce=${nonce}` };
}

async function captureCaseAttempt(device, contentSize, caseID, scale, expected, referencePath, stateDir, sequence, attemptNumber) {
  const attemptId = randomUUID();
  const nonce = `grid-run-02-${device.key}-${contentSize}-${caseID}-${sequence}-${attemptNumber}-${attemptId}`;
  const attemptDir = join(stateDir, "attempts", caseID, `${nonce}-${attemptId}`);
  await mkdir(join(stateDir, "attempts", caseID), { recursive: true });
  await mkdir(attemptDir, { recursive: false });
  const launchDir = join(attemptDir, "launch");
  const args = ["simctl", "launch", "--terminate-running-process", device.id, bundleId, "--grid-case", caseID, "--grid-nonce", nonce];
  let launch;
  try { launch = await command("xcrun", args, { timeout: 30000, killSignal: "SIGTERM" }); }
  catch (error) {
    await writeEvidence(join(launchDir, "launch-failure.log"), `${error.record?.stdout ?? ""}\n${error.record?.stderr ?? ""}`);
    return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, status: "unmeasured", reason: "simctl launch failed", launchExitCode: error.exitCode, launchFailurePath: relativeEvidence(join(launchDir, "launch-failure.log")), referencePath: relativeEvidence(referencePath) };
  }
  const pid = launch.stdout.match(/(\d+)\s*$/mu)?.[1] ?? null;
  await writeEvidence(join(launchDir, "launch.json"), { command: launch.record.command, args, exitCode: 0, stdout: launch.stdout, stderr: launch.stderr, pid });
  if (!pid) return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, status: "unmeasured", reason: "simctl launch returned no PID", referencePath: relativeEvidence(referencePath) };
  const readiness = await waitForReceipt(device, caseID, nonce, launchDir);
  if (readiness.status !== "ready") return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, pid, status: "unmeasured", reason: readiness.reason, readiness, referencePath: relativeEvidence(referencePath) };
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
  if (!stability.stable) return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, pid, status: "unmeasured", reason: "consecutive screenshot SHA-256 hashes were not identical valid hashes", readiness, stability, referencePath: relativeEvidence(referencePath) };
  const capturedHashes = { a: first.sha256, b: second.sha256 };
  const fullBeforeCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  let crop;
  let cropBytes;
  try {
    crop = cropRectFromRootReceipt(readiness.rootGeometry, second.image, { width: 340, height: 400 });
    cropBytes = await cropPngBytes(await readFile(fullB), crop);
  } catch (error) {
    return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, pid, status: "unmeasured", reason: `root receipt crop rejected: ${error.message}`, readiness, stability, fullCapturePaths: stability.paths, referencePath: relativeEvidence(referencePath) };
  }
  const capturePath = join(attemptDir, "crop.png");
  await writeFile(capturePath, cropBytes.bytes, { flag: "wx" });
  const fullAfterCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  let fullFrameHashStability;
  try {
    fullFrameHashStability = validateFullFrameHashes({ captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop });
  } catch (error) {
    fullFrameHashStability = { captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop, stable: false, reason: error.message };
  }
  await writeEvidence(join(launchDir, "full-frame-hash-stability.json"), fullFrameHashStability);
  if (!fullFrameHashStability.stable) return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, pid, status: "unmeasured", reason: "full screenshot bytes changed between pre-crop and post-crop rehash", readiness, stability, fullFrameHashStability, fullCapturePaths: stability.paths, crop, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath) };
  const native = await decodePng(capturePath);
  const comparison = compareGridPixels(expected, native, scale);
  const status = comparison.status === "pass" ? "pass" : "fail";
  return { caseID, deviceId: device.id, contentSize, scale, nonce, attemptId, attemptNumber, launchArguments: args, pid, status, measurementStatus: "measured", readiness, stability, fullFrameHashStability, fullCapturePaths: stability.paths, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath), crop, comparison };
}

async function captureCase(device, contentSize, caseID, scale, expected, referencePath, stateDir, sequence) {
  const attempts = [];
  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    const result = await captureCaseAttempt(device, contentSize, caseID, scale, expected, referencePath, stateDir, sequence, attemptNumber);
    attempts.push(result);
    if (result.measurementStatus === "measured" || attemptNumber === 3) return { ...result, attempts };
  }
  throw new Error("bounded capture attempt loop did not return");
}

async function setupDevice(device, appPathValue, initial) {
  const setup = { deviceId: device.id, deviceKey: device.key, initialState: initial, bootedByRunner: false, installed: false };
  if (initial.state === "Shutdown") {
    try { await command("xcrun", ["simctl", "boot", device.id]); setup.bootedByRunner = true; }
    catch (error) { return { ...setup, failure: { phase: "boot", exitCode: error.exitCode, stdout: error.record?.stdout ?? "", stderr: error.record?.stderr ?? String(error) } }; }
  }
  const bootstatus = await allowFailure("xcrun", ["simctl", "bootstatus", device.id, "-b"], { timeout: 60000, killSignal: "SIGTERM" });
  if (bootstatus.code !== 0) return { ...setup, failure: { phase: "bootstatus", exitCode: bootstatus.code, stdout: bootstatus.stdout, stderr: bootstatus.stderr } };
  const observed = await queryDevice(device);
  setup.observedContentSize = observed.contentSize;
  if (!observed.contentSize) return { ...setup, failure: { phase: "content_size", exitCode: observed.contentSizeQuery?.exitCode ?? 1, stdout: observed.contentSizeQuery?.stdout ?? "", stderr: observed.contentSizeQuery?.stderr ?? "" } };
  try { await command("xcrun", ["simctl", "install", device.id, appPathValue], { timeout: 60000, killSignal: "SIGTERM" }); setup.installed = true; }
  catch (error) { return { ...setup, failure: { phase: "install", exitCode: error.exitCode, stdout: error.record?.stdout ?? "", stderr: error.record?.stderr ?? String(error) } }; }
  return setup;
}

async function restoreDevice(device, setup) {
  const actions = [];
  if (!setup) return actions;
  if (setup.observedContentSize) actions.push(await allowFailure("xcrun", ["simctl", "ui", device.id, "content_size", setup.observedContentSize]));
  if (setup.bootedByRunner) actions.push(await allowFailure("xcrun", ["simctl", "shutdown", device.id]));
  return actions.map(({ code, stdout, stderr }) => ({ code, stdout, stderr }));
}

const initialStates = {};
for (const device of GRID_DEVICES) initialStates[device.key] = await queryDevice(device);
if (GRID_CASE_IDS.length !== 13 || GRID_MATRIX_CASE_IDS.length !== 12) throw new Error("Grid matrix declaration is not 12 plus one control.");
const currentSourceReceipt = sourceHashReceipt(buildGridSources().sources);
const expected = Object.fromEntries(expectedGridGeometry(JSON.parse(await readFile(join(sourceEvidence, "ir.json"), "utf8"))).map((entry) => [entry.caseId, entry]));
await mkdir(evidence, { recursive: true });
await writeEvidence(join(evidence, "source-hashes.json"), currentSourceReceipt);
await copyFile(join(sourceEvidence, "project-hash.json"), join(evidence, "project-hash.json"));
const binarySha256 = sha256(await readFile(join(appPath, "CanvasGridEvidence")));
await writeEvidence(join(evidence, "binary-facts.json"), { appPath, executable: "CanvasGridEvidence", sha256: binarySha256, infoPlistPath: relativeEvidence(join(appPath, "Info.plist")), sourceSha256: currentSourceReceipt.sourceSha256 });
const setups = {};
const entries = [];
const failures = [];
try {
  for (const device of GRID_DEVICES) {
    setups[device.key] = await setupDevice(device, appPath, initialStates[device.key]);
    const setup = setups[device.key];
    for (const contentSize of device.contentSizes) {
      const stateDir = join(evidence, "captures", device.key, contentSize);
      if (!setup.installed) {
        for (const caseID of GRID_CASE_IDS) entries.push({ caseID, deviceId: device.id, contentSize, scale: device.scale, status: "unmeasured", reason: "device setup did not complete", setupFailure: setup.failure ?? null });
        continue;
      }
      const stateSet = await allowFailure("xcrun", ["simctl", "ui", device.id, "content_size", contentSize]);
      if (stateSet.code !== 0) {
        for (const caseID of GRID_CASE_IDS) entries.push({ caseID, deviceId: device.id, contentSize, scale: device.scale, status: "unmeasured", reason: "content-size mutation failed", setupFailure: { phase: "content_size_set", exitCode: stateSet.code, stdout: stateSet.stdout, stderr: stateSet.stderr } });
        continue;
      }
      for (const caseID of GRID_CASE_IDS) {
        const referencePath = join(sourceEvidence, "references", `${device.key}-${contentSize}`, `${caseID}.png`);
        const entry = await captureCase(device, contentSize, caseID, device.scale, expected[caseID], referencePath, stateDir, entries.length + 1);
        entries.push(entry);
        if (entry.status === "unmeasured" || entry.status === "fail") failures.push(entry);
      }
    }
  }
} finally {
  const restoration = {};
  for (const device of GRID_DEVICES) restoration[device.key] = await restoreDevice(device, setups[device.key]);
  await writeEvidence(join(evidence, "restoration.json"), { initialStates, setups, restoration });
}
const finalStates = {};
for (const device of GRID_DEVICES) finalStates[device.key] = await queryDevice(device);
await writeEvidence(join(evidence, "device-state.json"), { initialStates, setups, finalStates });
await writeEvidence(join(evidence, "measurements.json"), { package: "luna-ios-grid-production-20260907", sourceSha256: currentSourceReceipt.sourceSha256, expectedIdentities: GRID_CASE_IDS.flatMap((caseID) => GRID_DEVICES.flatMap((device) => device.contentSizes.map((contentSize) => `${caseID}|${device.id}|${contentSize}`))), entries, counts: { entries: entries.length, primaryEntries: entries.filter(({ caseID }) => GRID_MATRIX_CASE_IDS.includes(caseID)).length, controlEntries: entries.filter(({ caseID }) => caseID === "grid-control-padding-overlay").length, measured: entries.filter(({ measurementStatus }) => measurementStatus === "measured").length, pass: entries.filter(({ status }) => status === "pass").length, fail: entries.filter(({ status }) => status === "fail").length, unmeasured: entries.filter(({ status }) => status === "unmeasured").length }, failures });
await writeEvidence(join(evidence, "commands.json"), commandLog.map(({ stdout, stderr, ...record }) => record));
console.log(JSON.stringify({ evidence, entries: entries.length, counts: { measured: entries.filter(({ measurementStatus }) => measurementStatus === "measured").length, pass: entries.filter(({ status }) => status === "pass").length, fail: entries.filter(({ status }) => status === "fail").length, unmeasured: entries.filter(({ status }) => status === "unmeasured").length }, finalStates }, null, 2));
