import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { cropPngBytes, cropRectFromRootReceipt, decodePngBytes, validateFullFrameHashes } from "./luna-ios-grid-capture-utils-20260907.mjs";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildFontCatalog, buildTextIR, exportExactFontFiles, readExactFontSources, EXACT_CASE_IDS } from "./luna-ios-text-font-catalog.mjs";
import { buildTextDecorationDocument } from "./luna-ios-text-fixture.mjs";
import { imageIdentity } from "./luna-ios-text-verify.mjs";
import { mkdir as mkdirPath } from "node:fs/promises";

export const TEXT_RECEIPT_CASE_IDS = Object.freeze([...EXACT_CASE_IDS]);
export const TEXT_RECEIPT_EXCLUDED_CASE_IDS = Object.freeze(["case-05", "case-09"]);
export const TEXT_RECEIPT_DEVICES = Object.freeze([
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", contentSizes: ["large", "accessibility-extra-extra-large"], scale: 3 },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", contentSizes: ["large"], scale: 2 },
]);
export const TEXT_RECEIPT_ATTEMPTS = 3;
export const TEXT_RECEIPT_LAUNCH_TIMEOUT_MS = 120000;
export const TEXT_RECEIPT_QUERY_TIMEOUT_MS = 10000;
export const TEXT_RECEIPT_BUNDLE_ID = "com.penkra.canvas.qa.textreceipt";
export const TEXT_RECEIPT_ROOT = "luna-ios-text-receipt-20260907";
export const TEXT_RECEIPT_BUILD_COMMAND = "xcodebuild -project CanvasTextReceiptEvidence.xcodeproj -scheme CanvasTextReceiptEvidence -sdk iphonesimulator -configuration Debug -jobs 2";
export const TEXT_RECEIPT_RECEIPT_DELAY_MS = 500;

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function iso(value) { return new Date(value).toISOString(); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function validHash(value) { return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value); }
export function boundedSleep(milliseconds) { return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)); }

export function evidenceRelative(root, path) { return relative(resolve(root), resolve(path)).replaceAll("\\", "/"); }

export function sourceHashReceipt(sources) {
  const files = [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, contents]) => ({ path, sha256: sha256(Buffer.from(contents)), bytes: Buffer.byteLength(contents) }));
  return { sourceSha256: sha256(files.map(({ path, sha256: digest }) => `${path}:${digest}\n`).join("")), files };
}

export function serializeTextReceiptError(error, phase) {
  return { phase, name: error?.name ?? "Error", message: String(error?.message ?? error), code: error?.code ?? null, signal: error?.signal ?? null, killed: error?.killed ?? false, stack: error?.stack ?? null };
}

export async function requireFreshEvidenceRoot(root) {
  const path = resolve(root);
  try { const entries = await readdir(path); assert.equal(entries.length, 0, `evidence root must be fresh: ${path}`); }
  catch (error) { if (error.code !== "ENOENT") throw error; await mkdir(path, { recursive: true }); }
  return path;
}

export async function createExclusiveAttemptDir(stateDir, caseId, nonce) {
  const parent = join(stateDir, "attempts", caseId);
  await mkdir(parent, { recursive: true });
  const path = join(parent, nonce);
  await mkdir(path, { recursive: false });
  return path;
}

export function textReceiptQueryArgs(deviceId, startTimestamp, endTimestamp = new Date().toISOString()) {
  assert.ok(typeof deviceId === "string" && deviceId.length > 0, "device ID is required");
  const startMillis = Date.parse(startTimestamp); const endMillis = Date.parse(endTimestamp);
  assert.ok(Number.isFinite(startMillis) && Number.isFinite(endMillis), "receipt timestamps must be ISO timestamps");
  assert.ok(endMillis >= startMillis, "receipt end must not precede start");
  return ["spawn", deviceId, "log", "show", "--style", "compact", "--start", `@${Math.floor(startMillis / 1000)}`, "--end", `@${Math.ceil(endMillis / 1000)}`, "--predicate", "eventMessage CONTAINS[c] \"LUNA_TEXT_READY\" OR eventMessage CONTAINS[c] \"LUNA_TEXT_ROOT\" OR eventMessage CONTAINS[c] \"LUNA_TEXT_FONT\""];
}

export function parseTextReadyReceipt(caseId, nonce, text) {
  const pattern = new RegExp(`LUNA_TEXT_READY case=${escapeRegex(caseId)} nonce=${escapeRegex(nonce)} regularPostScript=([^ ]+) boldPostScript=([^\\n]+)(?:\\n|$)`, "u");
  const match = String(text).match(pattern); if (!match) return null;
  return { caseId, nonce, regularPostScript: match[1], boldPostScript: match[2].trim() };
}

export function parseTextRootReceipt(caseId, nonce, text) {
  const n = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
  const pattern = new RegExp(`LUNA_TEXT_ROOT case=${escapeRegex(caseId)} nonce=${escapeRegex(nonce)} frame=${n},${n} ${n}x${n} window=${n},${n} ${n}x${n} screen=${n},${n} ${n}x${n} scale=${n}(?:\\n|$)`, "u");
  const match = String(text).match(pattern); if (!match) return null;
  const values = match.slice(1).map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return { caseId, nonce, root: { x: values[0], y: values[1], width: values[2], height: values[3] }, window: { x: values[4], y: values[5], width: values[6], height: values[7] }, screen: { x: values[8], y: values[9], width: values[10], height: values[11] }, scale: values[12] };
}

export function stableTextScreenshotHashes(hashes) {
  return Array.isArray(hashes) && hashes.length >= 2 && hashes.every(validHash) && hashes.every((hash) => hash === hashes[0]);
}

export function buildTextReceiptProjectYaml() {
  return `name: CanvasTextReceiptEvidence
options:
  bundleIdPrefix: com.penkra.canvas.qa
settings:
  base:
    SWIFT_VERSION: "6.0"
    CODE_SIGNING_ALLOWED: NO
targets:
  CanvasTextReceiptEvidence:
    type: application
    platform: iOS
    deploymentTarget: "16.0"
    sources:
      - swift/Sources/CanvasTextReceipt
      - swift/SimulatorHost/App.swift
      - path: ../luna-ios-text-20260906/exact-font-catalog/Fonts
        buildPhase: resources
    settings:
      base:
        GENERATE_INFOPLIST_FILE: YES
        PRODUCT_BUNDLE_IDENTIFIER: ${TEXT_RECEIPT_BUNDLE_ID}
        INFOPLIST_KEY_UILaunchScreen_Generation: YES
        TARGETED_DEVICE_FAMILY: "1,2"
schemes:
  CanvasTextReceiptEvidence:
    build:
      targets:
        CanvasTextReceiptEvidence: all
`;
}

export function buildTextReceiptHostSource(ir) {
  const outputNames = ir.outputs.map((output) => ({ id: output.id, source: output.name.normalize("NFC").replace(/[^A-Za-z0-9]+/gu, " ").trim().split(/\s+/u).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("") }));
  const ids = outputNames.map(({ id }) => JSON.stringify(id)).join(", ");
  const cases = outputNames.map(({ id, source }) => `    case ${JSON.stringify(id)}: return AnyView(${source}())`).join("\n");
  return `import Foundation
import SwiftUI
import UIKit
import CoreText

enum TextReceiptSelection {
  static let knownCaseIDs: Set<String> = [${ids}]
  static func view(for caseID: String) -> AnyView {
    switch caseID {
${cases}
    default: preconditionFailure("Unknown text fixture case: \\(caseID)")
    }
  }
}

struct TextReceiptScreen: View {
  let caseID: String
  let nonce: String

  private func emitReceipts(_ frame: CGRect) {
    let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first
    let screen = window?.screen ?? UIScreen.main
    let wf = window?.frame ?? .zero
    let sb = screen.bounds
    let scale = screen.scale
    let regular = CTFontCreateWithName("Inter-Regular" as CFString, 24, nil)
    let bold = CTFontCreateWithName("Inter-Bold" as CFString, 24, nil)
    let regularName = CTFontCopyPostScriptName(regular) as String
    let boldName = CTFontCopyPostScriptName(bold) as String
    NSLog("LUNA_TEXT_FONT case=%@ nonce=%@ regularPostScript=%@ boldPostScript=%@", caseID, nonce, regularName, boldName)
    NSLog("LUNA_TEXT_READY case=%@ nonce=%@ regularPostScript=%@ boldPostScript=%@", caseID, nonce, regularName, boldName)
    NSLog("LUNA_TEXT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f window=%.3f,%.3f %.3fx%.3f screen=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, frame.minX, frame.minY, frame.width, frame.height, wf.minX, wf.minY, wf.width, wf.height, sb.minX, sb.minY, sb.width, sb.height, scale)
  }

  var body: some View {
    TextReceiptSelection.view(for: caseID)
      .frame(width: 340, height: 180, alignment: .topLeading)
      .accessibilityIdentifier("canvas-text-receipt-\\(caseID)")
      .background(GeometryReader { proxy in Color.clear.onAppear { emitReceipts(proxy.frame(in: .global)) } })
  }
}

@main
struct CanvasTextReceiptApp: App {
  let caseID: String
  let nonce: String
  init() {
    let args = ProcessInfo.processInfo.arguments
    guard let c = args.firstIndex(of: "--canvas-case"), args.indices.contains(c + 1), let n = args.firstIndex(of: "--canvas-nonce"), args.indices.contains(n + 1) else { preconditionFailure("Text receipt requires case and nonce") }
    caseID = args[c + 1]; nonce = args[n + 1]
    guard TextReceiptSelection.knownCaseIDs.contains(caseID), !nonce.isEmpty else { preconditionFailure("Invalid text receipt selection") }
    CanvasFonts.register()
  }
  var body: some Scene { WindowGroup { TextReceiptScreen(caseID: caseID, nonce: nonce) } }
}
`;
}

export async function prepareTextReceiptEvidence(destination) {
  const root = resolve(destination);
  const document = buildTextDecorationDocument();
  const ir = buildTextIR(TEXT_RECEIPT_CASE_IDS, document);
  const sources = await readExactFontSources();
  const catalog = buildFontCatalog(ir, sources);
  const files = exportExactFontFiles(ir, catalog);
  await mkdirPath(join(root, "swift", "Sources", "CanvasTextReceipt"), { recursive: true });
  await mkdirPath(join(root, "swift", "SimulatorHost"), { recursive: true });
  await mkdirPath(join(root, "swift", "Resources", "Fonts"), { recursive: true });
  await writeFile(join(root, "fixture.json"), json(document));
  await writeFile(join(root, "ir.json"), json({ ...ir, renderDocument: undefined }));
  await writeFile(join(root, "case-matrix.json"), json({ caseIds: TEXT_RECEIPT_CASE_IDS, excludedCaseIds: TEXT_RECEIPT_EXCLUDED_CASE_IDS, expectedEntries: TEXT_RECEIPT_CASE_IDS.length * 3 }));
  for (const [name, contents] of files) {
    const path = name.replace(/^_canvas\//u, "");
    if (path.startsWith("Fonts/")) continue;
    await writeFile(join(root, "swift", "Sources", "CanvasTextReceipt", path), contents);
  }
  const helper = files.get("_canvas/CanvasFonts.swift");
  assert.ok(helper, "generated font registration helper is required");
  await writeFile(join(root, "swift", "Sources", "CanvasTextReceipt", "CanvasFonts.swift"), helper);
  const host = buildTextReceiptHostSource(ir);
  await writeFile(join(root, "swift", "SimulatorHost", "App.swift"), host);
  const fontManifest = [...catalog].map(([key, face]) => ({ key, filename: face.filename, sha256: sha256(face.bytes), bytes: face.bytes.byteLength, sourcePath: `../luna-ios-text-20260906/exact-font-catalog/Fonts/${face.filename}`, retainedBytesInThisTree: false }));
  await writeFile(join(root, "font-sources.json"), json({ fonts: fontManifest, italicCasesExcluded: TEXT_RECEIPT_EXCLUDED_CASE_IDS }));
  const projectYaml = buildTextReceiptProjectYaml();
  await writeFile(join(root, "project.yml"), projectYaml);
  const provenanceSources = new Map([...files].filter(([name]) => !name.startsWith("Fonts/")));
  provenanceSources.set("SimulatorHost/App.swift", host);
  provenanceSources.set("project.yml", projectYaml);
  for (const [, face] of catalog) provenanceSources.set(`Fonts/${face.filename}`, face.bytes);
  const provenance = sourceHashReceipt(provenanceSources);
  await writeFile(join(root, "source-hashes.json"), json(provenance));
  await writeFile(join(root, "capture-plan.json"), json({ bundleIdentifier: TEXT_RECEIPT_BUNDLE_ID, cases: TEXT_RECEIPT_CASE_IDS, states: TEXT_RECEIPT_DEVICES.flatMap(({ key, contentSizes }) => contentSizes.map((contentSize) => `${key}-${contentSize}`)), expectedEntries: 30, pairAttempts: TEXT_RECEIPT_ATTEMPTS, launchTimeoutMs: TEXT_RECEIPT_LAUNCH_TIMEOUT_MS, queryTimeoutMs: TEXT_RECEIPT_QUERY_TIMEOUT_MS, buildCommand: TEXT_RECEIPT_BUILD_COMMAND, readiness: "exact case+nonce READY, ROOT geometry, runtime PostScript font identities, two stable screenshot hashes", crop: "receipt-derived byte-preserving CanvasKit crop of a 340x180 authored root", nativeRun: false }));
  await writeFile(join(root, "artifact-estimates.json"), json({ generatedSwiftBytes: [...files.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0) + Buffer.byteLength(host), exactFontBytes: fontManifest.reduce((sum, font) => sum + font.bytes, 0), fixtureBytes: Buffer.byteLength(JSON.stringify(document)), retainedPngBytesAtPreparation: 0, duplicateOldCorpus: false }));
  return { root, document, ir, catalog, files, sourceHash: provenance };
}

async function hashFile(path) { return sha256(await readFile(path)); }

async function appendJsonLine(path, value) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${JSON.stringify(value)}\n`);
}

export async function waitForTextReceipt({ device, caseId, nonce, launchStartTimestamp, launchDir, command, now = () => new Date(), sleep = boundedSleep, attempts = 20, queryTimeoutMs = TEXT_RECEIPT_QUERY_TIMEOUT_MS }) {
  const queries = join(launchDir, "receipt-queries.jsonl");
  const readyLog = join(launchDir, "ready-log.txt");
  let last = "";
  for (let index = 0; index < attempts; index += 1) {
    const endTimestamp = iso(now());
    const args = textReceiptQueryArgs(device.id, launchStartTimestamp, endTimestamp);
    const startedAt = iso(now());
    let result;
    try { result = await command.query({ device, args, timeoutMs: queryTimeoutMs }); }
    catch (error) { result = { stdout: "", stderr: "", error: serializeTextReceiptError(error, "receipt-query") }; }
    const stdout = String(result?.stdout ?? ""); const stderr = String(result?.stderr ?? "");
    last += `${stdout}${stderr}`;
    await appendJsonLine(queries, { index, startedAt, launchStartTimestamp, endTimestamp, args, stdout, stderr, exitCode: result?.exitCode ?? 0, error: result?.error ?? null });
    await (await import("node:fs/promises")).writeFile(readyLog, last);
    const ready = parseTextReadyReceipt(caseId, nonce, last);
    const root = parseTextRootReceipt(caseId, nonce, last);
    if (ready && root) return { ready, root, log: last, queryCount: index + 1, launchStartTimestamp, lastQueryEndTimestamp: endTimestamp };
    await sleep(TEXT_RECEIPT_RECEIPT_DELAY_MS);
  }
  return { ready: null, root: null, log: last, queryCount: attempts, launchStartTimestamp, lastQueryEndTimestamp: iso(now()) };
}

export async function restoreTextReceiptDevice({ device, observedContentSize, bootedByRunner, command }) {
  const operations = [];
  if (observedContentSize) operations.push(await command.setContentSize({ device, contentSize: observedContentSize }));
  if (bootedByRunner) operations.push(await command.shutdown({ device }));
  return { observedContentSize, bootedByRunner, operations };
}

export async function runTextReceiptCase({
  evidenceRoot, device, contentSize, caseId, referencePath = null, command, screenshot,
  compare = null, crop = cropPngBytes, now = () => new Date(), sleep = boundedSleep,
  pairAttempts = TEXT_RECEIPT_ATTEMPTS, receiptPollAttempts = 20,
  launchTimeoutMs = TEXT_RECEIPT_LAUNCH_TIMEOUT_MS, queryTimeoutMs = TEXT_RECEIPT_QUERY_TIMEOUT_MS,
  nonce = randomUUID(), settleMs = 1000,
}) {
  assert.ok(TEXT_RECEIPT_CASE_IDS.includes(caseId), `unknown text receipt case ${caseId}`);
  const stateDir = join(resolve(evidenceRoot), "states", device.key, contentSize, caseId);
  await mkdir(stateDir, { recursive: true });
  const launchDir = join(stateDir, `launch-${nonce}`);
  await mkdir(launchDir, { recursive: false });
  const launchStartTimestamp = iso(now());
  const launchRecord = { caseId, deviceId: device.id, deviceKey: device.key, contentSize, nonce, launchStartTimestamp, launchTimeoutMs, phase: "launch" };
  await writeFile(join(launchDir, "launch-command.json"), json(launchRecord));
  let launched = false; let receipt = null; let launchResult = null;
  try {
    launchResult = await command.launch({ device, caseId, nonce, args: ["--canvas-case", caseId, "--canvas-nonce", nonce], timeoutMs: launchTimeoutMs });
    launched = true;
    await writeFile(join(launchDir, "launch-result.json"), json({ ...launchResult, launchRecord, launched: true }));
  } catch (error) {
    const failure = serializeTextReceiptError(error, "launch");
    await writeFile(join(launchDir, "launch-failure.json"), json({ ...failure, launchRecord, launched: false }));
    return { caseId, device: device.key, contentSize, nonce, status: "unmeasured", phase: "launch", attempts: [], launch: { ...launchRecord, failure } };
  }
  receipt = await waitForTextReceipt({ device, caseId, nonce, launchStartTimestamp, launchDir, command, now, sleep, attempts: receiptPollAttempts, queryTimeoutMs });
  await writeFile(join(launchDir, "receipt.json"), json(receipt));
  if (!receipt.ready || !receipt.root) {
    const failure = { phase: "receipt", name: "ReceiptUnavailable", message: receipt.ready ? "root geometry receipt missing" : "exact case+nonce READY receipt missing", code: null, signal: null, killed: false, stack: null };
    await writeFile(join(launchDir, "receipt-failure.json"), json(failure));
    return { caseId, device: device.key, contentSize, nonce, status: "unmeasured", phase: "receipt", attempts: [], launch: { ...launchRecord, result: launchResult, launched }, receipt, failure };
  }
  if (receipt.ready.regularPostScript !== "Inter-Regular" || receipt.ready.boldPostScript !== "Inter-Bold") {
    const failure = { phase: "font-receipt", name: "FontReceiptMismatch", message: "runtime PostScript font identities did not match the exact catalog faces", code: "CANVAS_MOBILE_FONT_MISMATCH", signal: null, killed: false, stack: null, expected: { regularPostScript: "Inter-Regular", boldPostScript: "Inter-Bold" }, actual: receipt.ready };
    await writeFile(join(launchDir, "font-receipt-failure.json"), json(failure));
    return { caseId, device: device.key, contentSize, nonce, status: "unmeasured", phase: "font-receipt", attempts: [], launch: { ...launchRecord, result: launchResult, launched }, receipt, failure };
  }
  const attempts = [];
  for (let index = 0; index < pairAttempts; index += 1) {
    const attemptNonce = `${nonce}-${index + 1}`;
    const attemptDir = await createExclusiveAttemptDir(stateDir, caseId, attemptNonce);
    const record = { index: index + 1, attemptNonce, launchStartTimestamp, receiptQueryStart: receipt.launchStartTimestamp };
    try {
      if (settleMs > 0) await sleep(settleMs);
      const firstPath = join(attemptDir, "full-a.png"); const secondPath = join(attemptDir, "full-b.png");
      await screenshot({ device, path: firstPath, caseId, nonce, attempt: index + 1 });
      await screenshot({ device, path: secondPath, caseId, nonce, attempt: index + 1 });
      const first = await stat(firstPath); const second = await stat(secondPath);
      assert.ok(first.size > 0 && second.size > 0, "screenshot output must be non-empty");
      const identity = await imageIdentity([firstPath, secondPath]);
      assert.ok(identity.pixelIdentical, "consecutive screenshots are not pixel-stable");
      assert.ok(validHash(identity.sha256[0]) && validHash(identity.sha256[1]), "full screenshot hashes are invalid");
      const fullBeforeCrop = { a: await hashFile(firstPath), b: await hashFile(secondPath) };
      const fullA = await readFile(firstPath); const fullB = await readFile(secondPath);
      const canvasKit = await getCanvasKit();
      const cropRect = cropRectFromRootReceipt(receipt.root, decodePngBytes(fullA, canvasKit), { width: 340, height: 180 });
      const croppedA = await crop(fullA, cropRect, canvasKit);
      const croppedB = await crop(fullB, cropRect, canvasKit);
      await writeFile(join(attemptDir, "crop-a.png"), croppedA.bytes); await writeFile(join(attemptDir, "crop-b.png"), croppedB.bytes);
      const after = { a: await hashFile(firstPath), b: await hashFile(secondPath) };
      const hashes = validateFullFrameHashes({ captured: fullBeforeCrop, beforeCrop: fullBeforeCrop, afterCrop: after });
      const comparison = compare ? await compare(referencePath, join(attemptDir, "crop-b.png"), device.scale) : { status: "unmeasured", reason: "no comparator supplied" };
      if (comparison.status !== "pass" && comparison.status !== "mismatch") throw Object.assign(new Error("comparator did not return a measured status"), { code: "INVALID_COMPARISON" });
      assert.ok(Number.isFinite(comparison.comparedPixels) && comparison.comparedPixels > 0, "comparator returned no compared pixels");
      const result = { ...record, paths: { fullA: evidenceRelative(evidenceRoot, firstPath), fullB: evidenceRelative(evidenceRoot, secondPath), cropA: evidenceRelative(evidenceRoot, join(attemptDir, "crop-a.png")), cropB: evidenceRelative(evidenceRoot, join(attemptDir, "crop-b.png")) }, fullHashes: hashes, identity, comparison };
      await writeFile(join(attemptDir, "attempt.json"), json(result)); attempts.push(result);
      if (comparison.status !== "unmeasured") return { caseId, device: device.key, contentSize, nonce, status: comparison.status, phase: "measured", attempts, launch: { ...launchRecord, result: launchResult, launched }, receipt };
    } catch (error) {
      const failure = serializeTextReceiptError(error, "postlaunch");
      const result = { ...record, failure, receipt: { ready: receipt.ready, root: receipt.root }, successfulLaunch: true };
      await writeFile(join(attemptDir, "postlaunch-failure.json"), json(result)); attempts.push(result);
    }
  }
  return { caseId, device: device.key, contentSize, nonce, status: "unmeasured", phase: "postlaunch", attempts, launch: { ...launchRecord, result: launchResult, launched }, receipt };
}
