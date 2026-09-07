import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const localCanvasRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceRoot = resolve(process.env.CANVAS_IOS_TEXT_RECEIPT_EVIDENCE_ROOT ?? join(localCanvasRoot, "research/luna-ios-text-receipt-20260907"));
const harnessScriptsRoot = resolve(process.env.CANVAS_IOS_TEXT_RECEIPT_HARNESS_ROOT ?? join(localCanvasRoot, "scripts"));
const harnessCanvasRoot = resolve(harnessScriptsRoot, "..");
const harness = (name) => pathToFileURL(join(harnessScriptsRoot, name)).href;
const canvasHarness = (name) => pathToFileURL(join(harnessCanvasRoot, name)).href;

const { decodePngBytes } = await import(harness("luna-ios-grid-capture-utils-20260907.mjs"));
const { getCanvasKit } = await import(canvasHarness("vendor/open-pencil/engine.source.mjs"));
const canvasKit = await getCanvasKit();

const EXPECTED_CASES = ["case-01", "case-02", "case-03", "case-04", "case-06", "case-07", "case-08", "case-10", "case-11", "case-12"];
const EXPECTED_STATES = [
  ["iphone", "large", 3],
  ["iphone", "accessibility-extra-extra-large", 3],
  ["ipad", "large", 2],
];
const EXPECTED_DEVICES = {
  iphone: { id: "A3D92728-7F7B-44D1-BE51-155B891905D9", scale: 3 },
  ipad: { id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", scale: 2 },
};

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function bytes(path) { return readFile(path); }
function identity(caseId, deviceKey, contentSize) { return `${caseId}|${deviceKey}|${contentSize}`; }
function finitePositive(value, label) { assert.ok(Number.isFinite(value) && value > 0, `${label} must be finite and positive`); }

async function image(path) {
  const raw = await bytes(path);
  const decoded = decodePngBytes(raw, canvasKit);
  return { raw, decoded, sha256: sha256(raw) };
}

function expectedStateKeys() { return new Set(EXPECTED_STATES.map(([device, size]) => `${device}|${size}`)); }

test("retained corpus has exactly the 10-case x 3-state Cartesian identity and no unrecorded status changes", async () => {
  const matrix = await json(join(evidenceRoot, "case-matrix.json"));
  const plan = await json(join(evidenceRoot, "capture-plan.json"));
  const run = await json(join(evidenceRoot, "native-run-01", "results.json"));
  const receipt = await json(join(evidenceRoot, "native-run-01", "run-receipt.json"));
  assert.deepEqual(matrix.caseIds, EXPECTED_CASES);
  assert.deepEqual(matrix.excludedCaseIds, ["case-05", "case-09"]);
  assert.equal(matrix.expectedEntries, 30);
  assert.deepEqual(plan.cases, EXPECTED_CASES);
  assert.deepEqual(plan.states, EXPECTED_STATES.map(([device, size]) => `${device}-${size}`));
  assert.equal(plan.expectedEntries, 30);
  assert.equal(run.expectedEntries, 30);
  assert.equal(run.results.length, 30);
  const resultIds = run.results.map(({ caseId, device, contentSize }) => identity(caseId, device, contentSize));
  assert.equal(new Set(resultIds).size, 30, "receipt result identities must be unique");
  assert.deepEqual(new Set(resultIds), new Set(EXPECTED_STATES.flatMap(([device, size]) => EXPECTED_CASES.map((caseId) => identity(caseId, device, size)))));
  assert.ok(run.results.every(({ phase }) => phase === "measured"));
  assert.ok(run.results.every(({ status }) => status === "mismatch"), "historical mismatch statuses must remain unchanged");
  assert.deepEqual(receipt.matrix, { expected: 30, actual: 30, statuses: { mismatch: 30 }, states: plan.states, cases: 10 });
  assert.equal(receipt.evidence.visualInspectionCount, 30);
});

test("retained references, source/IR/font/build identities, and native output bytes reconcile", async () => {
  const provenance = await json(join(evidenceRoot, "source-hashes.json"));
  const fonts = await json(join(evidenceRoot, "font-sources.json"));
  const refs = await json(join(evidenceRoot, "references", "manifest.json"));
  const fixtureBytes = await bytes(join(evidenceRoot, "fixture.json"));
  const irBytes = await bytes(join(evidenceRoot, "ir.json"));
  const sourceFiles = [];
  for (const entry of provenance.files) {
    let filePath;
    if (entry.path === "project.yml") filePath = join(evidenceRoot, "project.yml");
    else if (entry.path === "SimulatorHost/App.swift") filePath = join(evidenceRoot, "swift", entry.path);
    else if (entry.path.startsWith("Fonts/")) {
      const font = fonts.fonts.find(({ filename }) => filename === entry.path.slice("Fonts/".length));
      assert.ok(font, `font manifest entry missing for ${entry.path}`);
      filePath = resolve(evidenceRoot, font.sourcePath);
    } else {
      const relativeSource = entry.path.startsWith("_canvas/") ? entry.path.slice("_canvas/".length) : entry.path;
      filePath = join(evidenceRoot, "swift", "Sources", "CanvasTextReceipt", relativeSource);
    }
    const actual = await bytes(filePath);
    assert.equal(actual.byteLength, entry.bytes, `source bytes ${entry.path}`);
    assert.equal(sha256(actual), entry.sha256, `source hash ${entry.path}`);
    sourceFiles.push({ path: entry.path, sha256: entry.sha256 });
  }
  const aggregate = sha256(sourceFiles.sort((a, b) => a.path.localeCompare(b.path)).map(({ path, sha256: digest }) => `${path}:${digest}\n`).join(""));
  assert.equal(aggregate, provenance.sourceSha256);
  const buildHashes = await json(join(evidenceRoot, "native-run-01", "build", "source-hashes.json"));
  const buildReceipt = await json(join(evidenceRoot, "native-run-01", "build", "build-source-receipt.json"));
  assert.deepEqual(buildHashes, provenance);
  assert.deepEqual(buildReceipt, { git: "1ce9d0434c3ac935bd55ede1605b54328b47231d", sourceSha256: provenance.sourceSha256, recordedAfterBuild: true });
  assert.equal(sha256(fixtureBytes), refs.entries[0].fixtureSha256);
  assert.equal(sha256(irBytes), refs.entries[0].sourceIRSha256);
  for (const font of fonts.fonts) {
    const actual = await bytes(resolve(evidenceRoot, font.sourcePath));
    assert.equal(actual.byteLength, font.bytes, `font manifest bytes ${font.filename}`);
    assert.equal(sha256(actual), font.sha256, `font manifest hash ${font.filename}`);
  }
  const buildFacts = await json(join(evidenceRoot, "native-run-01", "build", "build-facts.json"));
  const executable = join(evidenceRoot, "native-run-01", "build", "CanvasTextReceiptEvidence.app", "CanvasTextReceiptEvidence");
  const executableBytes = await bytes(executable);
  assert.equal(executableBytes.byteLength, buildFacts.executableBytes);
  assert.equal(sha256(executableBytes), buildFacts.executableSha256);
  for (const font of fonts.fonts) {
    const bundled = await bytes(join(evidenceRoot, "native-run-01", "build", "CanvasTextReceiptEvidence.app", font.filename));
    assert.equal(bundled.byteLength, font.bytes, `bundled font bytes ${font.filename}`);
    assert.equal(sha256(bundled), font.sha256, `bundled font hash ${font.filename}`);
  }
  assert.equal(refs.entries.length, 30);
  assert.equal(new Set(refs.entries.map(({ identity }) => identity)).size, 30);
  assert.deepEqual(new Set(refs.entries.map(({ deviceKey, contentSize }) => `${deviceKey}|${contentSize}`)), expectedStateKeys());
  for (const entry of refs.entries) {
    const actual = await image(join(evidenceRoot, "references", entry.path));
    assert.equal(actual.raw.byteLength, entry.bytes, entry.identity);
    assert.equal(actual.sha256, entry.sha256, entry.identity);
    assert.deepEqual([actual.decoded.width, actual.decoded.height], [entry.width, entry.height], entry.identity);
    assert.equal(sha256(Buffer.from(actual.decoded.pixels)), entry.pixelSha256, `${entry.identity} pixel hash`);
    assert.ok(entry.alphaPixels > 0 && entry.nonWhitePixels > 0, `${entry.identity} positive reference samples`);
    assert.deepEqual(entry.fontHashes["Inter:400"], { sha256: fonts.fonts[0].sha256, bytes: fonts.fonts[0].bytes, filename: fonts.fonts[0].filename });
    assert.deepEqual(entry.fontHashes["Inter:700"], { sha256: fonts.fonts[1].sha256, bytes: fonts.fonts[1].bytes, filename: fonts.fonts[1].filename });
  }
});

test("all 30 native receipts reconcile full-frame A/B stability, receipt bounds, crop dimensions, and positive comparisons", async () => {
  const run = await json(join(evidenceRoot, "native-run-01", "results.json"));
  const references = await json(join(evidenceRoot, "references", "manifest.json"));
  const refs = new Map(references.entries.map((entry) => [entry.identity, entry]));
  for (const result of run.results) {
    const device = EXPECTED_DEVICES[result.device];
    assert.ok(device, `unknown device ${result.device}`);
    const receipt = result.receipt;
    assert.equal(receipt.ready.caseId, result.caseId);
    assert.equal(receipt.ready.nonce, result.nonce);
    assert.equal(receipt.ready.regularPostScript, "Inter-Regular");
    assert.equal(receipt.ready.boldPostScript, "Inter-Bold");
    assert.equal(receipt.root.caseId, result.caseId);
    assert.equal(receipt.root.nonce, result.nonce);
    assert.equal(receipt.root.scale, device.scale);
    for (const box of [receipt.root.root, receipt.root.window, receipt.root.screen]) for (const key of ["x", "y", "width", "height"]) assert.ok(Number.isFinite(box[key]), `${result.caseId} ${result.device} ${key} finite`);
    assert.equal(receipt.root.root.width, 340);
    assert.equal(receipt.root.root.height, 180);
    finitePositive(receipt.root.window.width, "window width");
    finitePositive(receipt.root.window.height, "window height");
    assert.equal(receipt.root.screen.width, receipt.root.window.width);
    assert.equal(receipt.root.screen.height, receipt.root.window.height);
    assert.ok(receipt.root.root.x >= receipt.root.screen.x && receipt.root.root.y >= receipt.root.screen.y);
    assert.ok(receipt.root.root.x + receipt.root.root.width <= receipt.root.screen.x + receipt.root.screen.width);
    assert.ok(receipt.root.root.y + receipt.root.root.height <= receipt.root.screen.y + receipt.root.screen.height);
    const attempt = result.attempts[0];
    assert.equal(result.attempts.length, 1);
    assert.equal(attempt.fullHashes.stable, true);
    assert.deepEqual(attempt.fullHashes.captured, attempt.fullHashes.beforeCrop);
    assert.deepEqual(attempt.fullHashes.captured, attempt.fullHashes.afterCrop);
    assert.deepEqual(attempt.identity.sha256, [attempt.fullHashes.captured.a, attempt.fullHashes.captured.b]);
    assert.equal(attempt.identity.byteIdentical, true);
    assert.equal(attempt.identity.pixelIdentical, true);
    assert.ok(attempt.identity.pixelDimensions.width > 0 && attempt.identity.pixelDimensions.height > 0);
    const fullA = await image(join(evidenceRoot, "native-run-01", attempt.paths.fullA));
    const fullB = await image(join(evidenceRoot, "native-run-01", attempt.paths.fullB));
    const cropA = await image(join(evidenceRoot, "native-run-01", attempt.paths.cropA));
    const cropB = await image(join(evidenceRoot, "native-run-01", attempt.paths.cropB));
    assert.equal(fullA.sha256, attempt.fullHashes.captured.a);
    assert.equal(fullB.sha256, attempt.fullHashes.captured.b);
    assert.equal(fullA.sha256, fullB.sha256);
    assert.deepEqual([fullA.decoded.width, fullA.decoded.height], [Math.round(receipt.root.screen.width * device.scale), Math.round(receipt.root.screen.height * device.scale)]);
    assert.deepEqual([cropA.decoded.width, cropA.decoded.height], [340 * device.scale, 180 * device.scale]);
    assert.deepEqual([cropA.decoded.width, cropA.decoded.height], [cropB.decoded.width, cropB.decoded.height]);
    assert.equal(cropA.sha256, cropB.sha256);
    const comparison = attempt.comparison;
    assert.equal(comparison.status, "mismatch");
    assert.ok(Number.isFinite(comparison.comparedPixels) && comparison.comparedPixels > 0);
    assert.ok(Number.isInteger(comparison.mismatchedPixels) && comparison.mismatchedPixels >= 0);
    assert.equal(comparison.registration.dx, 0);
    assert.equal(comparison.registration.dy, 0);
    assert.equal(comparison.registration.boundaryTolerancePixels, 2);
    const reference = refs.get(identity(result.caseId, result.device, result.contentSize));
    assert.ok(reference, `reference for ${result.caseId} ${result.device} ${result.contentSize}`);
    assert.equal(reference.scale, device.scale);
  }
});

test("native run records observed device settings and exact restoration operations", async () => {
  const restoration = await json(join(evidenceRoot, "native-run-01", "restoration.json"));
  const receipt = await json(join(evidenceRoot, "native-run-01", "run-receipt.json"));
  assert.deepEqual(restoration, receipt.restoration);
  assert.deepEqual(Object.keys(restoration.restoration).sort(), ["ipad", "iphone"]);
  for (const key of ["iphone", "ipad"]) {
    const record = restoration.restoration[key];
    assert.equal(record.observedContentSize, "large");
    assert.equal(record.bootedByRunner, false);
    assert.deepEqual(record.operations, [{ operation: "content_size", status: "restored", contentSize: "large" }]);
    const snapshot = restoration.snapshots.find(({ device }) => device.key === key);
    assert.ok(snapshot);
    assert.equal(snapshot.observedContentSize, "large");
    assert.equal(snapshot.device.state, "Booted");
    assert.equal(snapshot.bootedByRunner, false);
  }
});

test("outer build/install lifecycle reconciles with inner matrix state and retained cleanup", async () => {
  const buildRoot = join(evidenceRoot, "native-run-01", "build");
  const before = await json(join(buildRoot, "devices-before-install.json"));
  const after = await json(join(buildRoot, "devices-after-restore.json"));
  const setupLog = await readFile(join(buildRoot, "device-setup.log"), "utf8");
  const cleanupLog = await readFile(join(evidenceRoot, "native-run-01", "device-restoration.log"), "utf8");
  const facts = await json(join(buildRoot, "build-facts.json"));
  const targets = Object.entries(EXPECTED_DEVICES).map(([key, device]) => ({ key, ...device }));
  const allDevices = (snapshot) => Object.values(snapshot.devices ?? {}).flat();
  for (const target of targets) {
    const beforeDevice = allDevices(before).find(({ udid }) => udid === target.id);
    const afterDevice = allDevices(after).find(({ udid }) => udid === target.id);
    assert.ok(beforeDevice, `${target.key} missing from pre-install device snapshot`);
    assert.ok(afterDevice, `${target.key} missing from post-restore device snapshot`);
    assert.equal(beforeDevice.state, "Shutdown", `${target.key} outer pre-install state`);
    assert.equal(afterDevice.state, "Shutdown", `${target.key} outer post-restore state`);
    assert.ok(Number.isFinite(Date.parse(afterDevice.lastBootedAt)), `${target.key} post-restore boot provenance`);
    assert.match(setupLog, new RegExp(`Monitoring boot status for .*\\(${target.id}\\)`, "u"));
    assert.match(setupLog, new RegExp(`observed_content_size device=${target.id} value=large`, "u"));
    assert.match(setupLog, new RegExp(`installed device=${target.id}.*executableSha256=${facts.executableSha256} executableBytes=${facts.executableBytes}`, "u"));
    assert.match(cleanupLog, new RegExp(`before_shutdown device=${target.id}[\\s\\S]*xcrun simctl shutdown ${target.id}[\\s\\S]*exit=0`, "u"));
  }
  assert.match(setupLog, /exit=0/u);
  assert.match(cleanupLog, /exit=0/u);
});
