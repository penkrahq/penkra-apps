import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { capabilityTableFor } from "../src/capability-tables.mjs";

const evidenceDir = fileURLToPath(new URL("../research/luna-android-grid-production-20260907/", import.meta.url));
const matrixMeasurementsPath = join(evidenceDir, "measurements.json");
const translatedMeasurementsPath = join(evidenceDir, "translated-control-y110", "measurements.json");
const promoted = Object.freeze([
  "properties.gridColumn", "properties.gridRow", "properties.gridTemplateColumns", "properties.gridTemplateRows",
  "properties.layout", "properties.layoutPosition", "properties.padding",
]);
const remainingUnverified = Object.freeze([
  "nodes.text", "properties.accessibility.landmark", "properties.accessibility.linkName", "properties.content",
  "properties.effect.shadow.spread", "properties.fill", "properties.fill.gradient.linear.transformed",
  "properties.fill.gradient.radial.transformed", "properties.fontFamily", "properties.fontStyle", "properties.headingLevel",
  "properties.icon", "properties.lang", "properties.letterSpacing", "properties.library", "properties.marks",
  "properties.modes", "properties.paragraphs", "properties.strikethrough", "properties.text.paragraph.headingLevel",
  "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.italic",
  "properties.text.run.letterSpacing", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.textGrowth",
  "properties.underline", "properties.varies", "properties.weight", "properties.wrap", "root.axes", "root.lang",
]);

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

test("Compose grid promotions bind to retained production result hashes", async () => {
  const table = capabilityTableFor("kotlin");
  assert.deepEqual(promoted.filter((path) => table.properties[path].verdict === "native"), promoted);
  const manifest = JSON.parse(await readFile(join(evidenceDir, "artifact-manifest.json"), "utf8"));
  const files = new Map(manifest.files.map((record) => [record.path, record]));
  const matrixHash = files.get("measurements.json")?.sha256;
  const translatedHash = files.get("translated-control-y110/measurements.json")?.sha256;
  assert.equal(await sha256(matrixMeasurementsPath), matrixHash);
  assert.equal(await sha256(translatedMeasurementsPath), translatedHash);
  const matrixRows = JSON.parse(await readFile(matrixMeasurementsPath, "utf8"));
  const translatedRows = JSON.parse(await readFile(translatedMeasurementsPath, "utf8"));
  assert.equal(matrixRows.length, 48);
  assert.ok(matrixRows.every((row) => row.status === "pass" && row.mismatchedPixels === 0));
  assert.equal(translatedRows.length, 2);
  assert.ok(translatedRows.every((row) => row.status === "pass" && row.mismatchedPixels === 0));
  for (const path of promoted) {
    const row = table.properties[path];
    assert.equal(row.status, undefined, path);
    const hash = path === "properties.padding" || path === "properties.layoutPosition" ? translatedHash : matrixHash;
    assert.match(row.evidence, new RegExp(`(?:measurements\\.json|translated-control-y110/measurements\\.json) sha256=${hash}`), path);
  }
});

test("Compose text, semantic, paint and unmeasured layout rows stay closed", () => {
  const table = capabilityTableFor("kotlin");
  assert.deepEqual(remainingUnverified.filter((path) => table.properties[path].status === "unverified"), remainingUnverified);
  for (const path of remainingUnverified) {
    assert.equal(table.properties[path].verdict, null, path);
    assert.equal(table.properties[path].status, "unverified", path);
  }
});
