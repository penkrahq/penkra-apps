import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const evidence = new URL("../research/luna-ios-text-metrics-20260906/", import.meta.url);
const pixel = JSON.parse(await readFile(new URL("pixel-measurements.json", evidence), "utf8"));
const runtime = JSON.parse(await readFile(new URL("runtime-summary.json", evidence), "utf8"));
const document = JSON.parse(await readFile(new URL("document-text-measurements.json", evidence), "utf8"));
const comparison = JSON.parse(await readFile(new URL("comparison-report.json", evidence), "utf8"));
const build = JSON.parse(await readFile(new URL("xcodebuild.log", evidence), "utf8"));

function resolveEvidence(path) {
  assert.equal(typeof path, "string");
  assert.ok(!path.startsWith("/"));
  return new URL(path, evidence);
}

test("CanvasKit pixel metrics cover every exact-catalog pair without registration", async () => {
  assert.equal(pixel.entries.length, 30);
  assert.equal(new Set(pixel.entries.map((entry) => `${entry.caseId}|${entry.deviceId}|${entry.contentSize}`)).size, 30);
  for (const entry of pixel.entries) {
    assert.equal(entry.registration.applied, false);
    assert.equal(entry.registration.translation, false);
    assert.equal(entry.registration.scaleNormalization, false);
    for (const side of [entry.reference, entry.native]) {
      await access(resolveEvidence(side.path));
      assert.equal(side.rowHistogram.length, side.height);
      assert.ok(side.inkBounds);
      assert.equal(side.pointBands.length, side.bands.length);
      assert.match(side.sha256, /^[0-9a-f]{64}$/u);
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

test("measureDocumentText retains all twelve text layouts and font hashes", () => {
  assert.equal(document.nodeIds.length, 12);
  assert.equal(Object.keys(document.layouts).length, 12);
  assert.ok(Object.keys(document.layouts["case-01-text"].fontHashes).includes("Inter|Regular"));
  assert.ok(Object.values(document.layouts).every((layout) => layout.lines.length === 2));
  assert.equal(comparison.states.length, 3);
  assert.ok(comparison.states.every((state) => state.confirmed.pixelPairs.length === 10));
  assert.ok(comparison.states.every((state) => typeof state.unprovenCausalInference === "string"));
});

test("runtime build uses the retained bounded compiler command", () => {
  assert.equal(build.exitCode, 0);
  assert.match(build.command, /build -jobs 2$/u);
});
