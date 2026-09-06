import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { EXACT_CASE_IDS, ITALIC_CASE_IDS } from "../scripts/luna-ios-text-font-catalog.mjs";

const evidence = new URL("../research/luna-ios-text-20260906/exact-font-catalog/", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("fixture.json", evidence), "utf8"));
const catalog = JSON.parse(await readFile(new URL("catalog.json", evidence), "utf8"));
const measurements = JSON.parse(await readFile(new URL("measurements.json", evidence), "utf8"));

function evidencePath(path) {
  assert.equal(typeof path, "string");
  assert.ok(!path.startsWith("/"), `persisted evidence path is absolute: ${path}`);
  return new URL(path, evidence);
}

test("exact-catalog fixture selects ten independent source-ID frames", () => {
  assert.deepEqual(fixture.selectedCaseIds, EXACT_CASE_IDS);
  assert.equal(fixture.children.length, 12);
});

test("catalog rejection evidence distinguishes missing and mismatched exact faces", () => {
  assert.equal(catalog.full12Case.status, "rejected");
  assert.equal(catalog.full12Case.code, "CANVAS_MOBILE_FONT_MISSING");
  for (const caseId of ITALIC_CASE_IDS) {
    assert.equal(catalog.italicCases[caseId].status, "rejected");
    assert.equal(catalog.italicCases[caseId].code, "CANVAS_MOBILE_FONT_MISSING");
  }
  assert.equal(catalog.mislabeledRegularUnderItalic.status, "rejected");
  assert.equal(catalog.mislabeledRegularUnderItalic.code, "CANVAS_MOBILE_FONT_MISMATCH");
  assert.equal(catalog.correctCatalog.status, "accepted");
  assert.deepEqual(catalog.correctCatalog.entries.map(({ key, weight, italic }) => [key, weight, italic]), [["Inter:400:normal", 400, false], ["Inter:700:normal", 700, false]]);
});

test("exact-catalog native matrix has thirty portable measured entries and baseline comparisons", async () => {
  assert.equal(measurements.entries.length, 30);
  assert.equal(new Set(measurements.entries.map((entry) => `${entry.caseId}:${entry.deviceId}:${entry.contentSize}`)).size, 30);
  assert.ok(measurements.entries.every((entry) => entry.status === "mismatch"));
  assert.ok(measurements.entries.every((entry) => EXACT_CASE_IDS.includes(entry.caseId)));
  assert.ok(measurements.entries.every((entry) => !ITALIC_CASE_IDS.includes(entry.caseId)));
  for (const entry of measurements.entries) {
    await access(evidencePath(entry.referencePath));
    await access(evidencePath(entry.capturePath));
    await access(evidencePath(entry.baselineCapturePath));
    assert.equal(entry.registration.method, "center-cropped-authored-frame");
    assert.equal(entry.registration.boundaryTolerancePixels, 2);
    assert.ok(entry.comparedPixels > 0);
    assert.ok(Number.isInteger(entry.mismatchedPixels));
    assert.equal(typeof entry.baselineComparison.byteIdentical, "boolean");
    assert.equal(typeof entry.baselineComparison.pixelIdentical, "boolean");
  }
});

test("built exact-catalog app records catalog filename hashes and generated registration sources", async () => {
  assert.equal(measurements.buildExit, 0);
  assert.equal(measurements.fontFacts.valid, true);
  assert.equal(measurements.fontFacts.registrationUsesUIAppFonts, false);
  assert.ok(Object.values(measurements.fontFacts.fontHashes).every(({ matches }) => matches));
  const registration = JSON.parse(await readFile(new URL("registration-sources.json", evidence), "utf8"));
  assert.equal(registration.helper, true);
  assert.ok(registration.cases.every(({ callsRegister }) => callsRegister));
  assert.match(await readFile(new URL("swift/CanvasFonts.swift", evidence), "utf8"), /CanvasFonts/);
});
