import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { measureDocumentText } from "../src/document-screenshot.mjs";
import { CASES, buildTextDecorationDocument } from "../scripts/luna-ios-text-fixture.mjs";
import { analyzePngFile } from "../scripts/luna-ios-text-metrics.mjs";

const evidence = new URL("../research/luna-ios-text-metrics-20260906/", import.meta.url);
const pixel = JSON.parse(await readFile(new URL("pixel-measurements.json", evidence), "utf8"));
const runtime = JSON.parse(await readFile(new URL("runtime-summary.json", evidence), "utf8"));
const document = JSON.parse(await readFile(new URL("document-text-measurements.json", evidence), "utf8"));
const comparison = JSON.parse(await readFile(new URL("comparison-report.json", evidence), "utf8"));
const build = JSON.parse(await readFile(new URL("xcodebuild.log", evidence), "utf8"));
const exactCaseIds = ["case-01", "case-02", "case-03", "case-04", "case-06", "case-07", "case-08", "case-10", "case-11", "case-12"];
const expectedStates = [
  ["A3D92728-7F7B-44D1-BE51-155B891905D9", "large"],
  ["A3D92728-7F7B-44D1-BE51-155B891905D9", "accessibility-extra-extra-large"],
  ["8F053C2C-958D-4CC5-AB38-E838CFAC9442", "large"],
];

function resolveEvidence(path) {
  assert.equal(typeof path, "string");
  assert.ok(!path.startsWith("/"));
  return new URL(path, evidence);
}

test("CanvasKit pixel metrics cover every exact-catalog pair without registration", async () => {
  assert.equal(pixel.entries.length, 30);
  const identities = pixel.entries.map((entry) => `${entry.caseId}|${entry.deviceId}|${entry.contentSize}`);
  const expectedIdentities = expectedStates.flatMap(([deviceId, contentSize]) => exactCaseIds.map((caseId) => `${caseId}|${deviceId}|${contentSize}`));
  assert.deepEqual([...new Set(identities)].sort(), expectedIdentities.sort());
  const ck = await getCanvasKit();
  for (const entry of pixel.entries) {
    assert.equal(entry.registration.applied, false);
    assert.equal(entry.registration.translation, false);
    assert.equal(entry.registration.scaleNormalization, false);
    for (const side of [entry.reference, entry.native]) {
      const sideUrl = resolveEvidence(side.path);
      await access(sideUrl);
      assert.equal(side.rowHistogram.length, side.height);
      assert.ok(side.inkBounds);
      assert.equal(side.pointBands.length, side.bands.length);
      const recomputed = await analyzePngFile(ck, fileURLToPath(sideUrl), side.path, entry.scale);
      assert.deepEqual(recomputed, side);
    }
  }
});

test("runtime fixture records exact registered UIFont and CTFont facts for all states", () => {
  assert.equal(runtime.buildExit, 0);
  assert.equal(runtime.states.length, 3);
  assert.ok(runtime.states.every((state) => state.status === "measured"));
  assert.deepEqual(runtime.states.map((state) => state.contentSize), ["large", "accessibility-extra-extra-large", "large"]);
  assert.deepEqual(runtime.states.map((state) => state.contentSizeArgument), ["large", "accessibility-extra-extra-large", "large"]);
  for (const state of runtime.states) {
    assert.equal(state.fonts.regular.postScriptName, "Inter-Regular");
    assert.equal(state.fonts.bold.postScriptName, "Inter-Bold");
    assert.equal(state.fonts.regular.pointSize, 24);
    assert.equal(state.fonts.bold.pointSize, 24);
    assert.equal(state.fonts.regular.glyphAdvances.length, 2);
    assert.equal(state.fonts.bold.glyphAdvances.length, 2);
  }
  assert.deepEqual(runtime.states.map((state) => state.scaledBody.regular.pointSize), [24, 61, 24]);
  assert.deepEqual(runtime.states.map((state) => state.scaledBody.bold.pointSize), [24, 61, 24]);
});

test("measureDocumentText regeneration matches all retained numeric layouts and font hashes", async () => {
  assert.equal(document.nodeIds.length, 12);
  assert.equal(Object.keys(document.layouts).length, 12);
  assert.ok(Object.keys(document.layouts["case-01-text"].fontHashes).includes("Inter|Regular"));
  assert.ok(Object.values(document.layouts).every((layout) => layout.lines.length === 2));
  const regenerated = await measureDocumentText(buildTextDecorationDocument(), CASES.map(({ id }) => `${id}-text`));
  // JSON.stringify omits optional undefined flags from the retained report;
  // all numeric line/run arrays and font hashes remain compared exactly.
  const regeneratedLayouts = JSON.parse(JSON.stringify(Object.fromEntries([...regenerated.textLayouts.entries()])));
  assert.deepEqual(regeneratedLayouts, document.layouts);
  assert.equal(comparison.states.length, 3);
  assert.ok(comparison.states.every((state) => state.confirmed.pixelPairs.length === 10));
  assert.ok(comparison.states.every((state) => typeof state.unprovenCausalInference === "string"));
});

test("runtime build uses the retained bounded compiler command", () => {
  assert.equal(build.exitCode, 0);
  assert.match(build.command, /build -jobs 2$/u);
});
