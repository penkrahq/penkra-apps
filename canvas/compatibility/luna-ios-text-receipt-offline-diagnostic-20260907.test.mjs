import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ACTUAL_CROP_METHOD, DIAGNOSTIC_CASE_IDS, DIAGNOSTIC_STATES, STALE_REGISTRATION_LABEL,
  analyzeRetainedEvidence, boundsFromMask, comparePixelArrays, connectedComponents, mismatchCategories, mismatchCategoryTotal,
} from "../scripts/luna-ios-text-receipt-offline-diagnostic-20260907.mjs";

const evidenceRoot = new URL("../research/luna-ios-text-receipt-20260907/native-run-01", import.meta.url).pathname;
const referencesRoot = new URL("../research/luna-ios-text-receipt-20260907/references", import.meta.url).pathname;
const diagnosticRoot = new URL("../research/luna-ios-text-receipt-20260907/offline-diagnostic", import.meta.url).pathname;

test("synthetic foreground components and comparator preserve exact pixel rule", () => {
  const mask = Uint8Array.from([
    1, 1, 0, 0, 0,
    0, 1, 0, 1, 0,
    0, 0, 0, 1, 0,
  ]);
  assert.deepEqual(connectedComponents(mask, 5, 3), [
    { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 2, height: 2, count: 3 },
    { minX: 3, minY: 1, maxX: 3, maxY: 2, width: 1, height: 2, count: 2 },
  ]);
  assert.deepEqual(boundsFromMask(mask, 5, 3), { minX: 0, minY: 0, maxX: 3, maxY: 2, width: 4, height: 3, count: 5 });
  const referencePixels = new Uint8Array(7 * 7 * 4); const actualPixels = new Uint8Array(7 * 7 * 4); referencePixels.fill(255); actualPixels.fill(255);
  for (let index = 0; index < referencePixels.length; index += 4) { referencePixels[index] = 18; referencePixels[index + 1] = 52; referencePixels[index + 2] = 86; referencePixels[index + 3] = 255; actualPixels.set(referencePixels.slice(index, index + 4), index); }
  actualPixels[(3 * 7 + 3) * 4] = 10;
  const comparison = comparePixelArrays({ width: 7, height: 7, pixels: referencePixels }, { width: 7, height: 7, pixels: actualPixels });
  assert.equal(comparison.comparedPixels, 9); assert.equal(comparison.mismatchedPixels, 1); assert.deepEqual(comparison.bounds, { minX: 3, minY: 3, maxX: 3, maxY: 3, width: 1, height: 1, count: 1 });
  const overlapMask = new Uint8Array(9 * 9); for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) { const outer = x === 0 || x === 8 || y === 0 || y === 8; const inner = ((x === 2 || x === 6) && y >= 2 && y <= 6) || ((y === 2 || y === 6) && x >= 2 && x <= 6); if (outer || inner) overlapMask[y * 9 + x] = 1; }
  const overlapComponents = connectedComponents(overlapMask, 9, 9); assert.equal(overlapComponents.length, 2); assert.ok(overlapComponents[0].maxX >= overlapComponents[1].minX && overlapComponents[0].maxY >= overlapComponents[1].minY, "synthetic component bounds must overlap");
  const overlapReference = { width: 9, height: 9, pixels: new Uint8Array(9 * 9 * 4) }; const overlapActual = { width: 9, height: 9, pixels: new Uint8Array(9 * 9 * 4) }; for (let index = 0; index < overlapReference.pixels.length; index += 4) { overlapReference.pixels.set([18, 52, 86, 255], index); overlapActual.pixels.set([18, 52, 86, 255], index); } for (let index = 0; index < overlapMask.length; index += 1) if (overlapMask[index]) overlapActual.pixels[index * 4] = 10;
  const overlapCount = overlapMask.reduce((sum, value) => sum + value, 0); const categories = mismatchCategories(overlapReference, overlapActual, null, { mask: overlapMask, components: overlapComponents, mismatchedPixels: overlapCount }, "case-01"); assert.equal(mismatchCategoryTotal(categories), overlapCount);
});

test("retained diagnostic is exact 30-entry Cartesian evidence and recomputes deterministically", async () => {
  const temp = await mkdtemp(join(tmpdir(), "canvas-text-receipt-offline-diagnostic-"));
  try {
    const generated = await analyzeRetainedEvidence({ evidenceRoot, referencesRoot, outputRoot: temp });
    const committed = JSON.parse(await readFile(join(diagnosticRoot, "diagnostic.json"), "utf8"));
    assert.equal(generated.report.entries.length, 30);
    assert.deepEqual(generated.report.matrix.states, DIAGNOSTIC_STATES);
    assert.deepEqual(generated.report.matrix.cases, DIAGNOSTIC_CASE_IDS);
    assert.equal(new Set(generated.report.entries.map(({ identity }) => identity)).size, 30);
    assert.deepEqual(generated.report.entries.map(({ identity, comparison, mismatch, foreground, mismatchClassification }) => ({ identity, comparedPixels: comparison.comparedPixels, mismatchedPixels: comparison.mismatchedPixels, status: comparison.status, bounds: mismatch.bounds, components: mismatch.components, referenceBounds: foreground.reference.physical, nativeBounds: foreground.native.physical, mismatchClassification })), committed.entries.map(({ identity, comparison, mismatch, foreground, mismatchClassification }) => ({ identity, comparedPixels: comparison.comparedPixels, mismatchedPixels: comparison.mismatchedPixels, status: comparison.status, bounds: mismatch.bounds, components: mismatch.components, referenceBounds: foreground.reference.physical, nativeBounds: foreground.native.physical, mismatchClassification })));
    assert.equal(generated.report.provenance.fullHashChecks, 30);
    assert.equal(generated.report.provenance.staleRegistrationLabelCount, 30);
    assert.equal(generated.report.comparator.registrationLabel, STALE_REGISTRATION_LABEL);
    assert.equal(generated.report.comparator.actualCropMethod, ACTUAL_CROP_METHOD);
    assert.ok(generated.report.entries.every(({ provenance }) => provenance.fullFrameHashesMatchRecorded && provenance.fullFrameStable));
    assert.ok(generated.report.entries.every(({ comparison }) => comparison.comparedPixels > 0 && comparison.mismatchedPixels >= 0));
    assert.ok(generated.report.entries.every(({ comparison, mismatchClassification }) => Object.values(mismatchClassification).reduce((sum, value) => sum + value, 0) === comparison.mismatchedPixels));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("offline provenance requires retained shutdown receipts and matching binary hash", async () => {
  const result = await analyzeRetainedEvidence({ evidenceRoot, referencesRoot });
  assert.ok(result.report.provenance.binary.sha256);
  assert.equal(result.report.provenance.initialStates.length, 2);
  assert.ok(result.report.provenance.initialStates.every(({ state }) => state === "Shutdown"));
  assert.ok(result.report.provenance.finalStates.every(({ state }) => state === "Shutdown"));
  assert.equal(result.report.provenance.restorationLogHasSuccessfulShutdown, true);
});
