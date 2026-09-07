import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { decodePngBytes, encodeRgbaPng } from "./luna-ios-grid-capture-utils-20260907.mjs";

export const DIAGNOSTIC_CASE_IDS = Object.freeze(["case-01", "case-02", "case-03", "case-04", "case-06", "case-07", "case-08", "case-10", "case-11", "case-12"]);
export const DIAGNOSTIC_STATES = Object.freeze(["iphone-large", "iphone-accessibility-extra-extra-large", "ipad-large"]);
export const STALE_REGISTRATION_LABEL = "center-cropped-authored-frame";
export const ACTUAL_CROP_METHOD = "receipt-derived byte-preserving CanvasKit crop";
const DECORATION_CASES = new Set(["case-02", "case-03", "case-04", "case-07", "case-08"]);
const COLOR_CASES = new Set(["case-10"]);

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function readJson(path) { return readFile(path, "utf8").then(JSON.parse); }
function relativePath(root, path) { return relative(resolve(root), resolve(path)).replaceAll("\\", "/"); }
function pixel(image, x, y) { const offset = (y * image.width + x) * 4; return image.pixels.slice(offset, offset + 4); }
function whiteDiff(value) { return Math.max(255 - value[0], 255 - value[1], 255 - value[2]); }
export function isForeground(value) { return value[3] > 0 && whiteDiff(value) > 2; }
function samePixel(a, b) { return a.every((value, index) => value === b[index]); }
function isUniform(image, x, y, radius = 2) {
  const center = pixel(image, x, y);
  for (let oy = -radius; oy <= radius; oy += 1) for (let ox = -radius; ox <= radius; ox += 1) {
    const nx = x + ox; const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) return false;
    if (!samePixel(center, pixel(image, nx, ny))) return false;
  }
  return true;
}

export function boundsFromMask(mask, width, height) {
  let count = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (mask[y * width + x]) {
    count += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return count ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, count } : null;
}

export function connectedComponents(mask, width, height) {
  const seen = new Uint8Array(width * height); const components = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const start = y * width + x;
    if (!mask[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; let count = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; const cx = index % width; const cy = Math.floor(index / width);
      count += 1; minX = Math.min(minX, cx); minY = Math.min(minY, cy); maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = cx + dx; const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    components.push({ minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, count });
  }
  return components.sort((a, b) => a.minY - b.minY || a.minX - b.minX || b.count - a.count);
}

function pointBounds(bounds, scale) {
  if (!bounds) return null;
  return { minX: bounds.minX / scale, minY: bounds.minY / scale, maxX: bounds.maxX / scale, maxY: bounds.maxY / scale, width: bounds.width / scale, height: bounds.height / scale, count: bounds.count };
}

function foregroundStats(image, scale) {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) mask[y * image.width + x] = isForeground(pixel(image, x, y)) ? 1 : 0;
  const bounds = boundsFromMask(mask, image.width, image.height);
  const bands = [];
  for (let y = 0; y < image.height; y += 1) {
    let rowCount = 0; for (let x = 0; x < image.width; x += 1) rowCount += mask[y * image.width + x];
    if (!rowCount) continue;
    const previous = bands.at(-1);
    if (previous && previous.maxY === y - 1) { previous.maxY = y; previous.count += rowCount; }
    else bands.push({ minY: y, maxY: y, height: 1, count: rowCount });
  }
  for (const band of bands) { band.height = band.maxY - band.minY + 1; band.points = { minY: band.minY / scale, maxY: band.maxY / scale, height: band.height / scale, count: band.count }; }
  return { physical: bounds, points: pointBounds(bounds, scale), components: connectedComponents(mask, image.width, image.height), bands, mask };
}

export function comparePixelArrays(reference, actual) {
  assert.equal(reference.width, actual.width, "reference/native width mismatch");
  assert.equal(reference.height, actual.height, "reference/native height mismatch");
  const mask = new Uint8Array(reference.width * reference.height); const samples = []; let comparedPixels = 0; let mismatchedPixels = 0;
  for (let y = 0; y < reference.height; y += 1) for (let x = 0; x < reference.width; x += 1) {
    if (!isUniform(reference, x, y, 2)) continue;
    comparedPixels += 1; const expected = pixel(reference, x, y); const observed = pixel(actual, x, y);
    if (expected.some((value, index) => Math.abs(value - observed[index]) > 2)) {
      mask[y * reference.width + x] = 1; mismatchedPixels += 1;
      if (samples.length < 20) samples.push({ x, y, expected: [...expected], actual: [...observed] });
    }
  }
  return { comparedPixels, mismatchedPixels, mask, bounds: boundsFromMask(mask, reference.width, reference.height), components: connectedComponents(mask, reference.width, reference.height), samples, boundaryTolerancePixels: 2, channelTolerance: 2 };
}

function colorInterior(reference, actual, base, x, y) {
  return isForeground(pixel(reference, x, y)) && isForeground(pixel(actual, x, y)) && isUniform(reference, x, y, 2) && isUniform(actual, x, y, 2) && (!base || isUniform(base, x, y, 2));
}

export function mismatchCategories(reference, actual, base, comparison, caseId) {
  const categories = { glyphEdge: 0, nonbaselineForegroundCandidate: 0, colorInterior: 0, interior: 0, topology: 0 };
  for (let y = 0; y < reference.height; y += 1) for (let x = 0; x < reference.width; x += 1) {
    if (!comparison.mask[y * reference.width + x]) continue;
    const refInk = isForeground(pixel(reference, x, y)); const actualInk = isForeground(pixel(actual, x, y)); const baseInk = base ? isForeground(pixel(base, x, y)) : true;
    if (DECORATION_CASES.has(caseId) && !baseInk && (refInk || actualInk)) categories.nonbaselineForegroundCandidate += 1;
    else if (COLOR_CASES.has(caseId) && colorInterior(reference, actual, base, x, y)) categories.colorInterior += 1;
    else if (refInk && actualInk && isUniform(reference, x, y, 2) && isUniform(actual, x, y, 2)) categories.interior += 1;
    else if (refInk !== actualInk) categories.topology += 1;
    else categories.glyphEdge += 1;
  }
  return categories;
}

export function mismatchCategoryTotal(categories) { return Object.values(categories).reduce((sum, value) => sum + value, 0); }

function unionBounds(entries) {
  const present = entries.filter(Boolean); if (!present.length) return null;
  return { minX: Math.min(...present.map((b) => b.minX)), minY: Math.min(...present.map((b) => b.minY)), maxX: Math.max(...present.map((b) => b.maxX)), maxY: Math.max(...present.map((b) => b.maxY)), count: present.reduce((sum, b) => sum + b.count, 0) };
}

async function decode(path, canvasKit) { return decodePngBytes(await readFile(path), canvasKit); }

async function verifyProvenance(evidenceRoot) {
  const buildFacts = await readJson(join(evidenceRoot, "build", "build-facts.json"));
  const binaryPath = join(evidenceRoot, "build", "CanvasTextReceiptEvidence.app", "CanvasTextReceiptEvidence");
  const binary = await readFile(binaryPath); const binarySha256 = sha256(binary);
  assert.equal(binarySha256, buildFacts.executableSha256, "retained binary hash differs from build facts");
  assert.equal(binary.byteLength, buildFacts.executableBytes, "retained binary size differs from build facts");
  const before = await readJson(join(evidenceRoot, "build", "devices-before-install.json"));
  const after = await readJson(join(evidenceRoot, "build", "devices-after-restore.json"));
  const assigned = new Set(["A3D92728-7F7B-44D1-BE51-155B891905D9", "8F053C2C-958D-4CC5-AB38-E838CFAC9442"]);
  const states = (value) => Object.values(value.devices ?? {}).flat().filter((device) => assigned.has(device.udid)).map(({ udid, state }) => ({ udid, state })).sort((a, b) => a.udid.localeCompare(b.udid));
  const initialStates = states(before); const finalStates = states(after);
  assert.equal(initialStates.length, 2); assert.equal(finalStates.length, 2); assert.ok(initialStates.every(({ state }) => state === "Shutdown")); assert.ok(finalStates.every(({ state }) => state === "Shutdown"));
  const restoration = await readJson(join(evidenceRoot, "restoration.json"));
  const restorationLog = await readFile(join(evidenceRoot, "device-restoration.log"), "utf8");
  assert.ok(restorationLog.includes("exit=0"));
  return { buildFacts, binary: { path: relativePath(evidenceRoot, binaryPath), sha256: binarySha256, bytes: binary.byteLength }, initialStates, finalStates, restoration, restorationLogHasSuccessfulShutdown: restorationLog.includes("shutdown") && restorationLog.includes("exit=0") };
}

function expectedIdentitySet() { return new Set(DIAGNOSTIC_STATES.flatMap((state) => DIAGNOSTIC_CASE_IDS.map((caseId) => `${state}/${caseId}`))); }

export async function analyzeRetainedEvidence({ evidenceRoot, referencesRoot, outputRoot = null } = {}) {
  const evidence = resolve(evidenceRoot); const references = resolve(referencesRoot); const canvasKit = await getCanvasKit();
  const run = await readJson(join(evidence, "results.json")); const manifest = await readJson(join(references, "manifest.json"));
  assert.equal(run.results.length, 30); assert.equal(new Set(run.results.map((entry) => `${entry.device}-${entry.contentSize}/${entry.caseId}`)).size, 30);
  const expected = expectedIdentitySet(); const actual = new Set(run.results.map((entry) => `${entry.device}-${entry.contentSize}/${entry.caseId}`)); assert.deepEqual([...actual].sort(), [...expected].sort());
  const refs = new Map(manifest.entries.map((entry) => [entry.identity, entry])); const baseByState = new Map();
  for (const state of DIAGNOSTIC_STATES) {
    const [device, ...contentParts] = state.split("-"); const contentSize = contentParts.join("-"); const identity = `case-01|${device}|${contentSize}`; const manifestEntry = refs.get(identity); assert.ok(manifestEntry, `missing reference ${identity}`);
    baseByState.set(state, await decode(join(references, manifestEntry.path), canvasKit));
  }
  const entries = []; let staleRegistrationLabelCount = 0; let fullHashChecks = 0;
  for (const result of run.results) {
    assert.equal(result.attempts.length, 1, `${result.caseId} must have one retained attempt`);
    const attempt = result.attempts[0]; const identity = `${result.device}-${result.contentSize}/${result.caseId}`; const manifestEntry = refs.get(`${result.caseId}|${result.device}|${result.contentSize}`); assert.ok(manifestEntry);
    const referencePath = join(references, manifestEntry.path); const nativePath = join(evidence, attempt.paths.cropB); const fullAPath = join(evidence, attempt.paths.fullA); const fullBPath = join(evidence, attempt.paths.fullB);
    const reference = await decode(referencePath, canvasKit); const native = await decode(nativePath, canvasKit); const base = baseByState.get(`${result.device}-${result.contentSize}`);
    const referenceForeground = foregroundStats(reference, manifestEntry.scale); const nativeForeground = foregroundStats(native, manifestEntry.scale); const comparison = comparePixelArrays(reference, native); assert.equal(comparison.comparedPixels, attempt.comparison.comparedPixels, `${identity} compared-pixel count changed`); assert.equal(comparison.mismatchedPixels, attempt.comparison.mismatchedPixels, `${identity} mismatch count changed`); assert.equal(comparison.mismatchedPixels > 0 ? "mismatch" : "pass", attempt.comparison.status, `${identity} status changed`); const categories = mismatchCategories(reference, native, base, comparison, result.caseId); assert.equal(mismatchCategoryTotal(categories), comparison.mismatchedPixels, `${identity} mismatch categories must partition mismatch pixels`);
    const fullA = await readFile(fullAPath); const fullB = await readFile(fullBPath); const fullAHash = sha256(fullA); const fullBHash = sha256(fullB); const recorded = attempt.fullHashes;
    const fullHashValid = [recorded.captured, recorded.beforeCrop, recorded.afterCrop].every((pair) => pair.a === fullAHash && pair.b === fullBHash); assert.ok(fullHashValid, `${identity} retained full hash mismatch`); fullHashChecks += 1;
    const registrationLabel = attempt.comparison.registration?.method ?? null; if (registrationLabel === STALE_REGISTRATION_LABEL) staleRegistrationLabelCount += 1;
    const boundsDelta = referenceForeground.physical && nativeForeground.physical ? { minX: nativeForeground.physical.minX - referenceForeground.physical.minX, minY: nativeForeground.physical.minY - referenceForeground.physical.minY, maxX: nativeForeground.physical.maxX - referenceForeground.physical.maxX, maxY: nativeForeground.physical.maxY - referenceForeground.physical.maxY, width: nativeForeground.physical.width - referenceForeground.physical.width, height: nativeForeground.physical.height - referenceForeground.physical.height } : null;
    const lineDelta = referenceForeground.bands.length === nativeForeground.bands.length ? nativeForeground.bands.map((band, index) => ({ minY: band.minY - referenceForeground.bands[index].minY, maxY: band.maxY - referenceForeground.bands[index].maxY, height: band.height - referenceForeground.bands[index].height })) : null;
    entries.push({ identity, caseId: result.caseId, device: result.device, contentSize: result.contentSize, scale: manifestEntry.scale, paths: { reference: relativePath(evidence, referencePath), nativeCrop: attempt.paths.cropB, fullA: attempt.paths.fullA, fullB: attempt.paths.fullB }, hashes: { reference: sha256(await readFile(referencePath)), nativeCrop: sha256(await readFile(nativePath)), fullA: fullAHash, fullB: fullBHash }, dimensions: { reference: { width: reference.width, height: reference.height }, native: { width: native.width, height: native.height } }, comparison: { comparedPixels: comparison.comparedPixels, mismatchedPixels: comparison.mismatchedPixels, status: attempt.comparison.status, rule: { boundaryTolerancePixels: comparison.boundaryTolerancePixels, channelTolerance: comparison.channelTolerance }, retainedRegistrationLabel: registrationLabel, actualCropMethod: ACTUAL_CROP_METHOD }, mismatch: { bounds: comparison.bounds, points: pointBounds(comparison.bounds, manifestEntry.scale), components: comparison.components, samples: comparison.samples }, foreground: { reference: { physical: referenceForeground.physical, points: referenceForeground.points, bands: referenceForeground.bands.map(({ mask, ...band }) => band), componentCount: referenceForeground.components.length }, native: { physical: nativeForeground.physical, points: nativeForeground.points, bands: nativeForeground.bands.map(({ mask, ...band }) => band), componentCount: nativeForeground.components.length }, delta: boundsDelta, lineBandDelta: lineDelta }, mismatchClassification: categories, geometryEvidence: { boundsEqual: JSON.stringify(referenceForeground.physical) === JSON.stringify(nativeForeground.physical), lineBandCountEqual: referenceForeground.bands.length === nativeForeground.bands.length, lineBandsEqual: JSON.stringify(referenceForeground.bands.map(({ mask, ...band }) => band)) === JSON.stringify(nativeForeground.bands.map(({ mask, ...band }) => band)), interpretation: "Foreground bounds and bands are direct pixel observations; unequal antialias pixels alone do not prove a layout error." }, provenance: { fullFrameHashesMatchRecorded: fullHashValid, fullFrameStable: recorded.stable === true } });
  }
  entries.sort((a, b) => a.identity.localeCompare(b.identity));
  const summarize = (subset) => ({ entries: subset.length, comparedPixels: subset.reduce((sum, entry) => sum + entry.comparison.comparedPixels, 0), mismatchedPixels: subset.reduce((sum, entry) => sum + entry.comparison.mismatchedPixels, 0), statuses: subset.reduce((map, entry) => { map[entry.comparison.status] = (map[entry.comparison.status] ?? 0) + 1; return map; }, {}), mismatchBounds: unionBounds(subset.map((entry) => entry.mismatch.bounds)), mismatchClassification: subset.reduce((map, entry) => { for (const [key, value] of Object.entries(entry.mismatchClassification)) map[key] = (map[key] ?? 0) + value; return map; }, {}) });
  const byState = Object.fromEntries(DIAGNOSTIC_STATES.map((state) => [state, summarize(entries.filter((entry) => `${entry.device}-${entry.contentSize}` === state))]));
  const byCase = Object.fromEntries(DIAGNOSTIC_CASE_IDS.map((caseId) => [caseId, summarize(entries.filter((entry) => entry.caseId === caseId))]));
  const report = { package: "luna-ios-text-receipt-offline-diagnostic-20260907", sourceEvidence: "3967d70", generatedAt: "offline-deterministic", matrix: { expectedEntries: 30, actualEntries: entries.length, exactIdentities: entries.map((entry) => entry.identity), states: DIAGNOSTIC_STATES, cases: DIAGNOSTIC_CASE_IDS }, comparator: { rule: "existing measureCapture comparator", boundaryTolerancePixels: 2, channelTolerance: 2, registrationLabel: STALE_REGISTRATION_LABEL, registrationLabelStatus: "stale: retained crops were produced by receipt-derived byte-preserving CanvasKit crop", actualCropMethod: ACTUAL_CROP_METHOD, noRegistrationApplied: true }, summary: { overall: summarize(entries), byState, byCase }, provenance: { ...(await verifyProvenance(evidence)), fullHashChecks, staleRegistrationLabelCount }, entries };
  if (outputRoot) {
    const output = resolve(outputRoot); await mkdir(join(output, "contact-sheets"), { recursive: true }); await writeFile(join(output, "diagnostic.json"), json(report));
    const contactSheets = [];
    for (const state of DIAGNOSTIC_STATES) {
      const stateEntries = entries.filter((entry) => `${entry.device}-${entry.contentSize}` === state); const thumbWidth = 255; const thumbHeight = 135; const sheetWidth = thumbWidth * 2; const sheetHeight = thumbHeight * stateEntries.length; const pixels = new Uint8Array(sheetWidth * sheetHeight * 4); pixels.fill(255);
      for (let row = 0; row < stateEntries.length; row += 1) {
        const entry = stateEntries[row]; const ref = await decode(join(references, refs.get(`${entry.caseId}|${entry.device}|${entry.contentSize}`).path), canvasKit); const native = await decode(join(evidence, entry.paths.nativeCrop), canvasKit);
        for (const [column, image] of [[0, ref], [1, native]]) for (let y = 0; y < thumbHeight; y += 1) for (let x = 0; x < thumbWidth; x += 1) {
          const sourceX = Math.min(image.width - 1, Math.floor(x * image.width / thumbWidth)); const sourceY = Math.min(image.height - 1, Math.floor(y * image.height / thumbHeight)); const source = pixel(image, sourceX, sourceY); const target = ((row * thumbHeight + y) * sheetWidth + column * thumbWidth + x) * 4; pixels.set(source, target);
        }
      }
      const path = join(output, "contact-sheets", `${state}.png`); await writeFile(path, encodeRgbaPng({ width: sheetWidth, height: sheetHeight, pixels }, canvasKit)); contactSheets.push({ state, path: relativePath(output, path), columns: ["reference", "native"], rows: stateEntries.map((entry) => entry.caseId), dimensions: { width: sheetWidth, height: sheetHeight } });
    }
    await writeFile(join(output, "contact-sheets.json"), json(contactSheets));
    const case01 = entries.find((entry) => entry.identity === "iphone-large/case-01"); const reportLines = [`# Offline text receipt diagnostic`, ``, `Source evidence: 3967d70. All 30 retained comparisons were recomputed without registration, masking, or tolerance changes.`, ``, `- Overall: ${report.summary.overall.mismatchedPixels} mismatched pixels across ${report.summary.overall.entries} measured entries; statuses: ${JSON.stringify(report.summary.overall.statuses)}.`, `- Case01 iPhone Large: ${case01.comparison.mismatchedPixels} mismatches; bounds ${JSON.stringify(case01.mismatch.bounds)}; classification ${JSON.stringify(case01.mismatchClassification)}.`, `- Registration metadata: all ${staleRegistrationLabelCount} retained results say \`${STALE_REGISTRATION_LABEL}\`; this is stale metadata. The actual crops are ${ACTUAL_CROP_METHOD}. Old results were not rewritten.`, `- Foreground bounds/bands are reported in physical pixels and points per entry. A bounds/band difference is geometry evidence; antialias-count differences alone are not a layout diagnosis.`, `- \`nonbaselineForegroundCandidate\` is an ambiguous glyph/decor candidate from comparison with the fixed-size case01 reference; it is not a causal decoration verdict, especially at XXL.`, `- XXL is reported separately under \`iphone-accessibility-extra-extra-large\`; it is not merged with Large baseline conclusions.`, `- Build executable hash and size, full-frame hashes, initial/final device states, and restoration receipts all verified offline.`, ``, `## State summary`, ``, `| State | Entries | Compared | Mismatched | Classification |`, `| --- | ---: | ---: | ---: | --- |`]; for (const state of DIAGNOSTIC_STATES) { const summary = report.summary.byState[state]; reportLines.push(`| ${state} | ${summary.entries} | ${summary.comparedPixels} | ${summary.mismatchedPixels} | ${JSON.stringify(summary.mismatchClassification)} |`); } reportLines.push(``, `## Case/state details`, ``, `| Identity | Compared | Mismatched | Mismatch bounds | Components | Foreground delta (x/y/w/h) | Classification |`, `| --- | ---: | ---: | --- | ---: | --- | --- |`); for (const entry of entries) { const bounds = entry.mismatch.bounds ? `${entry.mismatch.bounds.minX},${entry.mismatch.bounds.minY}..${entry.mismatch.bounds.maxX},${entry.mismatch.bounds.maxY}` : "none"; const delta = entry.foreground.delta ? `${entry.foreground.delta.minX}/${entry.foreground.delta.minY}/${entry.foreground.delta.width}/${entry.foreground.delta.height}` : "none"; reportLines.push(`| ${entry.identity} | ${entry.comparison.comparedPixels} | ${entry.comparison.mismatchedPixels} | ${bounds} | ${entry.mismatch.components.length} | ${delta} | ${JSON.stringify(entry.mismatchClassification)} |`); } reportLines.push(``, `Contact sheets use rows in case order and columns reference/native; see \`contact-sheets.json\`.`); await writeFile(join(output, "report.md"), `${reportLines.join("\n")}\n`);
    return { report, contactSheets };
  }
  return { report, contactSheets: [] };
}

if (process.argv[1]?.endsWith("luna-ios-text-receipt-offline-diagnostic-20260907.mjs")) {
  const evidenceRoot = resolve(process.env.CANVAS_TEXT_RECEIPT_NATIVE_ROOT ?? new URL("../research/luna-ios-text-receipt-20260907/native-run-01", import.meta.url).pathname);
  const referencesRoot = resolve(process.env.CANVAS_TEXT_RECEIPT_REFERENCES_ROOT ?? new URL("../research/luna-ios-text-receipt-20260907/references", import.meta.url).pathname);
  const outputRoot = resolve(process.env.CANVAS_TEXT_RECEIPT_OFFLINE_DIAGNOSTIC_ROOT ?? join(new URL("../research/luna-ios-text-receipt-20260907", import.meta.url).pathname, "offline-diagnostic"));
  const result = await analyzeRetainedEvidence({ evidenceRoot, referencesRoot, outputRoot }); console.log(JSON.stringify({ outputRoot, entries: result.report.entries.length, mismatchedPixels: result.report.summary.overall.mismatchedPixels, staleRegistrationLabelCount: result.report.provenance.staleRegistrationLabelCount }, null, 2));
}
