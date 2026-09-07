import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import {
  buildGridSources,
  compareGridPixels,
  expectedGridGeometry,
  readyReceipt,
  rootGeometryReceipt,
  sourceHashReceipt,
  stableScreenshotHashes,
} from "./luna-ios-grid-production.mjs";
import { cropPngBytes, cropRectFromRootReceipt, validateFullFrameHashes } from "./luna-ios-grid-capture-utils-20260907.mjs";
import { exactReceiptInWindow, receiptQueryArgs } from "./luna-ios-grid-receipt-window.mjs";

export const SINGLE_CASE_ID = "grid-c100-180-r60-100-normal";
export const SINGLE_DEVICE = Object.freeze({ key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", contentSize: "large", scale: 3 });
export const SINGLE_LAUNCH_TIMEOUT_MS = 120_000;
export const SINGLE_RECEIPT_QUERY_TIMEOUT_MS = 10_000;
export const SINGLE_MAX_PAIR_ATTEMPTS = 3;

export function selectSingleCapturePlan() {
  return [{ caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: SINGLE_DEVICE.contentSize, scale: SINGLE_DEVICE.scale }];
}

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const sourceEvidence = resolve(root, "research/luna-ios-grid-production-20260907");
const evidence = resolve(process.env.CANVAS_GRID_NATIVE_EVIDENCE_ROOT ?? join(sourceEvidence, "native-run-02-missing-one"));
const binaryFactsPath = join(sourceEvidence, "native-run-02", "binary-facts.json");
const binaryFacts = JSON.parse(await readFile(binaryFactsPath, "utf8"));
const appPath = resolve(process.env.CANVAS_GRID_APP_PATH ?? binaryFacts.appPath);
const bundleId = "com.penkra.canvas.qa.grid";
const commandLog = [];

function relativeEvidence(path) { return relative(evidence, path).split(sep).join("/"); }
function sleep(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

async function command(commandName, args, options = {}) {
  const started = new Date().toISOString();
  const timeoutMs = options.timeout ?? null;
  try {
    const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
    const record = { command: [commandName, ...args].join(" "), args, exitCode: 0, started, finished: new Date().toISOString(), signal: null, killed: false, timedOut: false, timeoutMs, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: null };
    commandLog.push(record);
    return { ...result, record };
  } catch (error) {
    const record = { command: [commandName, ...args].join(" "), args, exitCode: error.code ?? 1, started, finished: new Date().toISOString(), signal: error.signal ?? null, killed: error.killed ?? false, timedOut: error.code === "ETIMEDOUT" || error.signal === options.killSignal, timeoutMs, stdout: error.stdout ?? "", stderr: error.stderr ?? "", error: String(error) };
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
  try { await stat(evidence); throw new Error(`Evidence root already exists; refusing to overwrite: ${evidence}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(evidence, { recursive: true });
}

async function queryDevice() {
  const listed = JSON.parse((await command("xcrun", ["simctl", "list", "devices", "-j"])).stdout);
  const found = Object.values(listed.devices).flat().find(({ udid }) => udid === SINGLE_DEVICE.id);
  const ui = await allowFailure("xcrun", ["simctl", "ui", SINGLE_DEVICE.id, "content_size"]);
  return { id: SINGLE_DEVICE.id, key: SINGLE_DEVICE.key, state: found?.state ?? "unknown", contentSize: ui.code === 0 ? ui.stdout.trim() || null : null, contentSizeQuery: ui.record ?? null };
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

async function screenshot(path) {
  await mkdir(dirname(path), { recursive: true });
  await command("xcrun", ["simctl", "io", SINGLE_DEVICE.id, "screenshot", "--type=png", path]);
  return { path, sha256: sha256(await readFile(path)), image: await decodePng(path) };
}

async function waitForReceipt(caseID, nonce, launchStartTimestamp, launchDir) {
  const logPath = join(launchDir, "ready-log.txt");
  const queryPath = join(launchDir, "receipt-queries.json");
  let combined = "";
  const queries = [];
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const endTimestamp = new Date().toISOString();
    const args = receiptQueryArgs(SINGLE_DEVICE.id, launchStartTimestamp, endTimestamp);
    const result = await allowFailure("xcrun", args, { timeout: SINGLE_RECEIPT_QUERY_TIMEOUT_MS, killSignal: "SIGTERM" });
    const query = { attempt, startTimestamp: launchStartTimestamp, endTimestamp, result: result.record ?? { exitCode: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } };
    queries.push(query);
    combined += `\n--- receipt query ${attempt} start=${launchStartTimestamp} end=${endTimestamp} ---\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    await writeEvidence(logPath, combined);
    await writeEvidence(queryPath, queries);
    const rootGeometry = rootGeometryReceipt(caseID, nonce, combined);
    if (result.code === 0 && readyReceipt(caseID, nonce, combined) && rootGeometry) return { status: "ready", attempt, logPath: relativeEvidence(logPath), queryPath: relativeEvidence(queryPath), launchStartTimestamp, rootGeometry };
    await sleep(500);
  }
  return { status: "unmeasured", reason: "exact case/nonce readiness receipt was not observed in fixed per-launch log window", logPath: relativeEvidence(logPath), queryPath: relativeEvidence(queryPath), launchStartTimestamp };
}

async function capturePair(expected, referencePath, stateDir, nonce, launchStartTimestamp, attemptNumber) {
  const attemptId = randomUUID();
  const attemptDir = join(stateDir, "attempts", SINGLE_CASE_ID, `${attemptNumber}-${attemptId}`);
  await mkdir(attemptDir, { recursive: false });
  const launchDir = join(attemptDir, "launch");
  const readiness = await waitForReceipt(SINGLE_CASE_ID, nonce, launchStartTimestamp, launchDir);
  if (readiness.status !== "ready") return { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, nonce, attemptId, attemptNumber, status: "unmeasured", reason: readiness.reason, readiness, referencePath: relativeEvidence(referencePath) };
  await sleep(2500);
  const fullA = join(attemptDir, "full", `${SINGLE_CASE_ID}-a.png`);
  const fullB = join(attemptDir, "full", `${SINGLE_CASE_ID}-b.png`);
  const first = await screenshot(fullA);
  await sleep(500);
  const second = await screenshot(fullB);
  const stability = { hashes: [first.sha256, second.sha256], stable: stableScreenshotHashes([first.sha256, second.sha256]), delayMs: 500, paths: [relativeEvidence(fullA), relativeEvidence(fullB)] };
  await writeEvidence(join(launchDir, "stability.json"), stability);
  if (!stability.stable) return { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, nonce, attemptId, attemptNumber, status: "unmeasured", reason: "consecutive screenshot SHA-256 hashes were not identical valid hashes", readiness, stability, referencePath: relativeEvidence(referencePath) };
  const captured = { a: first.sha256, b: second.sha256 };
  const beforeCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  const crop = cropRectFromRootReceipt(readiness.rootGeometry, second.image, { width: 340, height: 400 });
  const cropBytes = await cropPngBytes(await readFile(fullB), crop);
  const capturePath = join(attemptDir, "crop.png");
  await writeFile(capturePath, cropBytes.bytes, { flag: "wx" });
  const afterCrop = { a: sha256(await readFile(fullA)), b: sha256(await readFile(fullB)) };
  let fullFrameHashStability;
  try { fullFrameHashStability = validateFullFrameHashes({ captured, beforeCrop, afterCrop }); }
  catch (error) { fullFrameHashStability = { captured, beforeCrop, afterCrop, stable: false, reason: error.message }; }
  await writeEvidence(join(launchDir, "full-frame-hash-stability.json"), fullFrameHashStability);
  if (!fullFrameHashStability.stable) return { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, nonce, attemptId, attemptNumber, status: "unmeasured", reason: "full screenshot bytes changed between pre-crop and post-crop rehash", readiness, stability, fullFrameHashStability, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath) };
  const comparison = compareGridPixels(expected, await decodePng(capturePath), 3);
  return { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, nonce, attemptId, attemptNumber, status: comparison.status === "pass" ? "pass" : "fail", measurementStatus: "measured", readiness, stability, fullFrameHashStability, capturePath: relativeEvidence(capturePath), referencePath: relativeEvidence(referencePath), crop, comparison };
}

async function verifyInstalledBundle() {
  try {
    const container = await command("xcrun", ["simctl", "get_app_container", SINGLE_DEVICE.id, bundleId, "app"], { timeout: 30_000, killSignal: "SIGTERM" });
    const appContainer = container.stdout.trim();
    const installedExecutablePath = join(appContainer, binaryFacts.executable);
    const installedSha256 = sha256(await readFile(installedExecutablePath));
    return { appContainer, installedExecutablePath, installedSha256, expectedSha256: binaryFacts.sha256, matches: installedSha256 === binaryFacts.sha256, command: container.record };
  } catch (error) {
    return { matches: false, failure: { message: String(error), exitCode: error.exitCode ?? null, signal: error.signal ?? null, killed: error.killed ?? false, stdout: error.record?.stdout ?? error.stdout ?? "", stderr: error.record?.stderr ?? error.stderr ?? "", command: error.record ?? null } };
  }
}

async function restoreDevice(setup) {
  const actions = [];
  if (!setup) return actions;
  if (setup.observedContentSize) actions.push(await allowFailure("xcrun", ["simctl", "ui", SINGLE_DEVICE.id, "content_size", setup.observedContentSize]));
  if (setup.bootedByRunner) actions.push(await allowFailure("xcrun", ["simctl", "shutdown", SINGLE_DEVICE.id]));
  return actions.map(({ code, stdout, stderr, record }) => ({ code, stdout, stderr, command: record ?? null }));
}

async function main() {
  await requireFreshEvidenceRoot();
  const currentSource = sourceHashReceipt(buildGridSources().sources);
  const preflight = { appPath, hostSha256: sha256(await readFile(join(appPath, binaryFacts.executable))), expectedSha256: binaryFacts.sha256, sourceSha256: currentSource.sourceSha256, expectedSourceSha256: binaryFacts.sourceSha256 };
  preflight.hostMatches = preflight.hostSha256 === preflight.expectedSha256;
  preflight.sourceMatches = preflight.sourceSha256 === preflight.expectedSourceSha256;
  await writeEvidence(join(evidence, "preflight-binary.json"), preflight);
  if (!preflight.hostMatches || !preflight.sourceMatches) throw new Error(`binary/source verification failed before device mutation: ${JSON.stringify(preflight)}`);
  await writeEvidence(join(evidence, "source-hashes.json"), currentSource);
  await writeEvidence(join(evidence, "capture-plan.json"), { cases: [SINGLE_CASE_ID], device: SINGLE_DEVICE, launchTimeoutMs: SINGLE_LAUNCH_TIMEOUT_MS, receiptQueryTimeoutMs: SINGLE_RECEIPT_QUERY_TIMEOUT_MS, fixedReceiptWindow: true, maxPairAttempts: SINGLE_MAX_PAIR_ATTEMPTS, install: "not authorized; installed bundle hash is verified only" });
  const expected = Object.fromEntries(expectedGridGeometry(JSON.parse(await readFile(join(sourceEvidence, "ir.json"), "utf8"))).map((entry) => [entry.caseId, entry]));
  const initial = await queryDevice();
  let setup;
  let entry;
  try {
    setup = { deviceId: SINGLE_DEVICE.id, initialState: initial, bootedByRunner: false, installed: false, installAttempted: false };
    if (initial.state === "Shutdown") { await command("xcrun", ["simctl", "boot", SINGLE_DEVICE.id]); setup.bootedByRunner = true; }
    const bootstatus = await command("xcrun", ["simctl", "bootstatus", SINGLE_DEVICE.id, "-b"], { timeout: 60_000, killSignal: "SIGTERM" });
    const observed = await queryDevice();
    setup.observedContentSize = observed.contentSize;
    setup.installedBundle = await verifyInstalledBundle();
    if (bootstatus && setup.observedContentSize && setup.installedBundle.matches) {
      setup.installed = true;
      const stateSet = await command("xcrun", ["simctl", "ui", SINGLE_DEVICE.id, "content_size", "large"]);
      assert.equal(stateSet, stateSet);
      const nonce = `grid-run-02-missing-one-${SINGLE_CASE_ID}-${randomUUID()}`;
      const stateDir = join(evidence, "captures", "iphone", "large");
      const referencePath = join(sourceEvidence, "references", "iphone-large", `${SINGLE_CASE_ID}.png`);
      const launchDir = join(stateDir, "launch", nonce);
      const launchStartTimestamp = new Date().toISOString();
      const launchArgs = ["simctl", "launch", "--terminate-running-process", SINGLE_DEVICE.id, bundleId, "--grid-case", SINGLE_CASE_ID, "--grid-nonce", nonce];
      let launch;
      try {
        launch = await command("xcrun", launchArgs, { timeout: SINGLE_LAUNCH_TIMEOUT_MS, killSignal: "SIGTERM" });
        await writeEvidence(join(launchDir, "launch.json"), { ...launch.record, launchStartTimestamp, args: launchArgs });
        const pid = launch.stdout.match(/(\d+)\s*$/mu)?.[1] ?? null;
        if (!pid) entry = { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, status: "unmeasured", reason: "simctl launch returned no PID", launch: launch.record, attempts: [] };
        else {
          const attempts = [];
          for (let attemptNumber = 1; attemptNumber <= SINGLE_MAX_PAIR_ATTEMPTS; attemptNumber += 1) {
            const result = await capturePair(expected[SINGLE_CASE_ID], referencePath, stateDir, nonce, launchStartTimestamp, attemptNumber);
            attempts.push(result);
            if (result.measurementStatus === "measured") break;
          }
          entry = { ...attempts.at(-1), launch: launch.record, launchStartTimestamp, attempts };
        }
      } catch (error) {
        await writeEvidence(join(launchDir, "launch-failure.log"), JSON.stringify(error.record, null, 2) + "\n");
        entry = { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, status: "unmeasured", reason: "simctl launch failed", launch: error.record, attempts: [] };
      }
    } else entry = { caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3, status: "unmeasured", reason: "device setup or installed bundle verification failed", setup, attempts: [] };
  } finally {
    const restoration = await restoreDevice(setup);
    await writeEvidence(join(evidence, "restoration.json"), { initialStates: { iphone: initial }, setup, restoration });
  }
  const finalState = await queryDevice();
  await writeEvidence(join(evidence, "device-state.json"), { initialStates: { iphone: initial }, finalStates: { iphone: finalState }, setup });
  await writeEvidence(join(evidence, "measurements.json"), { package: "luna-ios-grid-production-20260907-missing-one", expectedIdentities: [`${SINGLE_CASE_ID}|${SINGLE_DEVICE.id}|large`], entries: [entry], counts: { entries: 1, measured: entry.measurementStatus === "measured" ? 1 : 0, pass: entry.status === "pass" ? 1 : 0, fail: entry.status === "fail" ? 1 : 0, unmeasured: entry.status === "unmeasured" ? 1 : 0 } });
  await writeEvidence(join(evidence, "commands.json"), commandLog);
  console.log(JSON.stringify({ evidence, entry, finalState }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
