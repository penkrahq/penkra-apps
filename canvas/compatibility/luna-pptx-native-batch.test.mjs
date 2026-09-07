import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { generatePptxCorpus, setsForForty, templateForDeckSlide } from "../scripts/luna-pptx-native-batch-generate.mjs";
import { findMarkerBounds, inspectPdf, inspectPptx, sha256, validateMarkerMeasurement } from "../scripts/luna-pptx-native-batch-verify.mjs";

const evidenceRoot = new URL("../research/luna-pptx-native-batch-20260907/run-4uxvfr/", import.meta.url);
const evidencePath = (relativePath) => new URL(relativePath, evidenceRoot);

test("retained forty PPTX corpus has exact fixture, hashes, editable text, and distinct marker positions", async () => {
  const hashes = JSON.parse(await readFile(evidencePath("source-hashes.json"), "utf8"));
  const semantic = JSON.parse(await readFile(evidencePath("semantic.xml.json"), "utf8"));
  const fixture = JSON.parse(await readFile(evidencePath("source-fixture.json"), "utf8"));
  assert.equal(hashes.length, 40);
  assert.deepEqual(fixture.sets, setsForForty());
  assert.deepEqual(fixture.document, templateForDeckSlide());
  assert.equal(semantic.length, 40);
  const positions = new Set();
  for (const [index, entry] of hashes.entries()) {
    const bytes = await readFile(evidencePath(entry.path));
    assert.equal(sha256(bytes), entry.sha256, entry.path);
    const school = `School ${index + 1}`;
    const observed = inspectPptx(bytes, school);
    assert.equal(observed.textPresent, true, school);
    assert.equal(observed.pictureFallback, false, school);
    assert.equal(observed.markerPresent, true, school);
    positions.add(observed.markerPosition.x);
  }
  assert.equal(positions.size, 40);
});

test("current generator regenerates the retained forty PPTX semantic XML without PowerPoint", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-luna-pptx-regenerate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const regenerated = await generatePptxCorpus({ evidenceRoot: root });
  const retained = JSON.parse(await readFile(evidencePath("source-hashes.json"), "utf8"));
  assert.equal(regenerated.hashes.length, retained.length);
  assert.deepEqual(regenerated.semantic.map(({ index, school, markerPosition, editableText, pictureFallback }) => ({ index, school, markerPosition, editableText, pictureFallback })), JSON.parse(await readFile(evidencePath("semantic.xml.json"), "utf8")));
});

test("portable native manifest retains all forty UI captures and actual native PDF observations", async () => {
  const manifest = JSON.parse(await readFile(evidencePath("native-manifest.json"), "utf8"));
  assert.equal(manifest.ids.length, 40);
  assert.equal(new Set(manifest.ids).size, 40);
  assert.equal(manifest.ui.entries.length, 40);
  assert.equal(manifest.ui.entries.filter((entry) => entry.screenshotExists).length, 40);
  assert.equal(manifest.ui.entries.filter((entry) => entry.visualInspected).length, 40);
  assert.equal(manifest.pdf.length, 3);
  for (const entry of manifest.ui.entries) {
    assert.match(entry.screenshot, /^ui(?:-final)?\/school-\d{2}\.jpg$/u);
    assert.equal(entry.expectedSchool, `School ${entry.index}`);
    assert.equal(entry.repairOrFontWarning, false);
    assert.equal(await readFile(evidencePath(entry.screenshot)).then(() => true), true);
  }
  for (const entry of manifest.pdf) {
    const observed = await inspectPdf(fileURLToPath(evidencePath(entry.pdf)), fileURLToPath(evidencePath(entry.rendered)));
    assert.deepEqual(observed.pageSizePt, entry.observed.pageSizePt);
    assert.deepEqual(observed.renderSize, entry.observed.renderSize);
    assert.deepEqual(observed.marker, entry.observed.marker);
    assert.equal(observed.text, entry.expectedSchool);
    assert.equal(observed.embeddedInter, true);
    assert.deepEqual(observed.pageSizePt, { width: 792, height: 612 });
    assert.equal(entry.status, "mismatch");
    assert.equal(validateMarkerMeasurement(observed.marker, entry.expected.marker), false);
  }
});

test("malformed, missing-entry, and displaced-marker checks remain explicit failures", async () => {
  const missing = evidencePath("pptx/School 999.pptx");
  await assert.rejects(readFile(missing), { code: "ENOENT" });
  assert.throws(() => inspectPptx(Buffer.from("malformed"), "School 1"));
  assert.equal(validateMarkerMeasurement({ x: 111, y: 0, width: 20, height: 20 }, { x: 110, y: 0, width: 20, height: 20 }), false);
  assert.equal(findMarkerBounds({ width: 1, height: 1, pixels: Buffer.from([0, 0, 0]) }), null);
});
