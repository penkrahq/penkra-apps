import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { bindingsForExportSet, resolveExportDestinations } from "../src/export-delivery.mjs";
import { exportDocumentBatch } from "../src/export-service.mjs";
import { fortyCount, fortySchoolSets, fortySchoolTemplate, viewportHeight, viewportWidths } from "../scripts/luna-html-batch-browser.mjs";

const tolerance = 2;
const evidenceRoot = fileURLToPath(new URL("../research/luna-html-batch-browser-20260906/corpus/", import.meta.url));

function assertNear(actual, expected, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
}

function assertRelativeEvidencePath(path, label) {
  assert.equal(typeof path, "string", `${label} must be a string`);
  assert.equal(isAbsolute(path), false, `${label} must be relative`);
  assert.equal(path.includes(".."), false, `${label} must stay below the evidence root`);
}

function canonicalReport(bytes) {
  return JSON.stringify(JSON.parse(bytes.toString("utf8")), (_key, value) => {
    if (typeof value !== "string") return value;
    if (value.endsWith("/styles.css")) return "<bundle>/styles.css";
    if (value.endsWith("/slide.html")) return "<bundle>/slide.html";
    if (value.endsWith("/export-report.json")) return "<bundle>/export-report.json";
    return value;
  });
}

function assertObservedEntry(observation) {
  const key = `${observation.schoolIndex}:${observation.width}`;
  const expectedSchool = `School ${observation.schoolIndex}`;
  const expectedWidth = 100 + observation.schoolIndex - 1;
  assert.equal(observation.height, viewportHeight);
  assert.equal(observation.deviceScaleFactor, 1);
  assert.equal(observation.school.textContent, expectedSchool);
  assert.equal(observation.school.tag, "P");
  assert.equal(observation.marker.tag, "DIV");
  assertNear(observation.school.bounds.width, expectedWidth, `${key} school width`);
  assertNear(observation.school.bounds.height, 50, `${key} school height`);
  assertNear(observation.marker.bounds.width, 20, `${key} marker width`);
  assertNear(observation.marker.bounds.height, 20, `${key} marker height`);
  assertNear(observation.marker.bounds.left - observation.school.bounds.left, observation.school.bounds.width + 10, `${key} marker horizontal offset`);
  assertNear(observation.marker.bounds.top, observation.school.bounds.top, `${key} marker top`);
  assert.equal(observation.unresolvedVisibleText.length, 0);
  assert.match(observation.fontFamily, /Inter/u);
  assert.equal(observation.fontSize, "24px");
  assert.deepEqual(observation.tags, ["P", "DIV"]);
  assert.deepEqual(observation.console, []);
  assert.deepEqual(observation.failedLocalResources, []);
  assert.equal(observation.status, "pass");
  assert.deepEqual(observation.failures, []);
  assertRelativeEvidencePath(observation.screenshot.relativePath, `${key} screenshot`);
}

test("committed live Chrome corpus contains all 120 checks and current HTML bytes regenerate identically", async (context) => {
  const measurements = JSON.parse(await readFile(join(evidenceRoot, "measurements.json"), "utf8"));
  assert.equal(measurements.format, "html");
  assert.equal(measurements.artifactCount, fortyCount);
  assert.deepEqual(measurements.viewportWidths, viewportWidths);
  assert.equal(measurements.viewportHeight, viewportHeight);
  assert.equal(measurements.deviceScaleFactor, 1);
  assert.equal(measurements.observations.length, 120);
  assert.equal(measurements.screenshotCount, 120);
  assert.ok(measurements.browser?.terminated);
  assert.ok(["SIGTERM", "SIGKILL"].includes(measurements.browser.exit?.signal));

  const entries = new Set();
  const screenshots = new Set();
  for (const observation of measurements.observations) {
    const key = `${observation.schoolIndex}:${observation.width}`;
    assert.equal(entries.has(key), false, `duplicate measurement ${key}`);
    entries.add(key);
    assert.equal(viewportWidths.includes(observation.width), true);
    assert.equal(observation.url.startsWith("file://<evidence-root>/"), true);
    assertObservedEntry(observation);
    assert.equal(screenshots.has(observation.screenshot.relativePath), false, `${key} screenshot collision`);
    screenshots.add(observation.screenshot.relativePath);
    const screenshot = await stat(join(evidenceRoot, observation.screenshot.relativePath));
    assert.ok(screenshot.isFile() && screenshot.size > 0, `${key} screenshot exists`);
  }
  assert.equal(entries.size, 120);
  assert.equal(screenshots.size, 120);

  const sets = fortySchoolSets();
  const retainedBundles = new Set(measurements.generatedBundles);
  assert.equal(retainedBundles.size, 40);
  for (const set of sets) assert.equal(retainedBundles.has(`bundles/${set.output}`), true);
  assertRelativeEvidencePath(measurements.preservedUnrelatedEntry, "preserved unrelated entry");
  assert.equal(await readFile(join(evidenceRoot, measurements.preservedUnrelatedEntry), "utf8"), "preserve this unrelated entry\n");

  const regenerationRoot = await mkdtemp(join(tmpdir(), "canvas-luna-html-regeneration-"));
  context.after(() => rm(regenerationRoot, { recursive: true, force: true }));
  const document = fortySchoolTemplate();
  const before = structuredClone(document);
  const destinations = resolveExportDestinations(`${regenerationRoot}/`, sets, "html");
  await exportDocumentBatch(document, sets.map((set, index) => ({
    role: "route", frames: ["slide"], destination: destinations[index], bindings: bindingsForExportSet(set),
  })), { assets: new Map(), title: "Forty-school HTML browser acceptance regeneration" });
  assert.deepEqual(document, before, "current generator mutated the exact template");
  assert.deepEqual((await readdir(regenerationRoot)).sort(), sets.map((set) => set.output).sort());

  for (let index = 0; index < sets.length; index += 1) {
    const retained = join(evidenceRoot, "bundles", sets[index].output);
    const regenerated = destinations[index];
    for (const filename of ["slide.html", "styles.css"]) {
      assert.deepEqual(await readFile(join(regenerated, filename)), await readFile(join(retained, filename)), `${sets[index].output}/${filename} bytes changed`);
    }
    assert.equal(canonicalReport(await readFile(join(regenerated, "export-report.json"))), canonicalReport(await readFile(join(retained, "export-report.json"))), `${sets[index].output}/export-report semantics changed`);
    assert.doesNotMatch(await readFile(join(regenerated, "slide.html"), "utf8"), /\$\{(?:schoolName|cardWidth)\}/u);
  }
});
