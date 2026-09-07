import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportCompose } from "../src/exporters/mobile.mjs";
import {
  CASE_IDS, CASE_SPECS, CANDIDATE_PATHS, DENSITIES, FONT_SCALES, buildJustifyCase, caseDocument, caseIdFor, measureJustifyCapture,
} from "../scripts/luna-android-justify-generate.mjs";

const evidenceDir = fileURLToPath(new URL("../research/luna-android-justify-20260906/", import.meta.url));
const execFile = promisify(execFileCallback);

async function hashedFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function sourceFor(spec, options = {}) {
  const id = caseIdFor(spec);
  return exportCompose(buildJustifyCase(id, options).ir).get("MobileFixture.kt");
}

test("justify fixture matrix covers both axes, three values, gaps, and padding", () => {
  assert.equal(CASE_IDS.length, 24);
  assert.equal(new Set(CASE_IDS).size, 24);
  for (const spec of CASE_SPECS) {
    const built = buildJustifyCase(caseIdFor(spec));
    assert.deepEqual(built.document.children[0].children[0].children.map((child) => child.fill), ["#123456", "#f4a261", "#2a9d8f"]);
    assert.deepEqual(Object.keys(built.expectedBounds), ["child-1", "child-2", "child-3"]);
    assert.equal(built.document.children[0].role, "android");
    assert.equal(built.document.children[0].width, 340);
    assert.equal(built.document.children[0].height, 400);
    assert.deepEqual(built.document.children[0].children[0].x, 20);
    assert.deepEqual(built.document.children[0].children[0].y, 60);
  }
});

test("Compose Row emits exact start/center/end spacedBy overloads and defaults", () => {
  const expected = {
    start: "androidx.compose.ui.Alignment.Start",
    center: "androidx.compose.ui.Alignment.CenterHorizontally",
    end: "androidx.compose.ui.Alignment.End",
  };
  for (const justifyContent of ["start", "center", "end"]) {
    const source = sourceFor({ direction: "horizontal", justifyContent, gap: 10, padding: "asymmetric" });
    assert.ok(source.includes(`horizontalArrangement = Arrangement.spacedBy(10.dp, ${expected[justifyContent]})`));
  }
  const defaultSource = sourceFor({ direction: "horizontal", justifyContent: "start", gap: 0, padding: "none" }, { omitJustify: true });
  assert.match(defaultSource, /horizontalArrangement = Arrangement\.spacedBy\(0\.dp, androidx\.compose\.ui\.Alignment\.Start\)/u);
});

test("Compose Column emits exact top/center/bottom spacedBy overloads and defaults", () => {
  const expected = {
    start: "androidx.compose.ui.Alignment.Top",
    center: "androidx.compose.ui.Alignment.CenterVertically",
    end: "androidx.compose.ui.Alignment.Bottom",
  };
  for (const justifyContent of ["start", "center", "end"]) {
    const source = sourceFor({ direction: "vertical", justifyContent, gap: 10, padding: "asymmetric" });
    assert.ok(source.includes(`verticalArrangement = Arrangement.spacedBy(10.dp, ${expected[justifyContent]})`));
  }
  const defaultSource = sourceFor({ direction: "vertical", justifyContent: "start", gap: 0, padding: "none" }, { omitJustify: true });
  assert.match(defaultSource, /verticalArrangement = Arrangement\.spacedBy\(0\.dp, androidx\.compose\.ui\.Alignment\.Top\)/u);
});

test("non-start/center/end justify values keep the existing no-overload arrangement", () => {
  const document = caseDocument(caseIdFor({ direction: "horizontal", justifyContent: "start", gap: 10, padding: "none" }));
  document.children[0].children[0].justifyContent = "space-between";
  const ir = buildCapabilityVerificationIR(document, { role: "android", frames: [document.children[0].id] }, CANDIDATE_PATHS);
  const source = exportCompose(ir).get("MobileFixture.kt");
  assert.match(source, /horizontalArrangement = Arrangement\.spacedBy\(10\.dp\),/u);
  assert.doesNotMatch(source, /horizontalArrangement = Arrangement\.spacedBy\(10\.dp, androidx\.compose\.ui\.Alignment/u);
});

test("retained PNG corpus recomputes all structured measurements with portable paths", async () => {
  const report = JSON.parse(await readFile(resolve(evidenceDir, "measurements.json"), "utf8"));
  const manifest = JSON.parse(await readFile(resolve(evidenceDir, "artifact-manifest.json"), "utf8"));
  const expectedKeys = new Set(CASE_IDS.flatMap((caseId) => DENSITIES.flatMap((density) => FONT_SCALES.map((fontScale) => `${caseId}|${density}|${fontScale}`))));
  assert.equal(report.length, expectedKeys.size);
  assert.equal(manifest.caseCount, CASE_IDS.length);
  assert.deepEqual(manifest.caseIds, CASE_IDS);
  assert.equal(manifest.measurementCount, report.length);
  assert.equal(manifest.captureCount, report.length);
  for (const record of manifest.files) {
    const actual = await hashedFile(resolve(evidenceDir, record.path));
    assert.equal(actual.bytes, record.bytes);
    assert.equal(actual.sha256, record.sha256);
  }
  const seen = new Set();
  for (const row of report) {
    const key = `${row.caseId}|${row.density}|${row.fontScale}`;
    assert.ok(expectedKeys.has(key));
    assert.ok(!seen.has(key));
    seen.add(key);
    assert.equal(isAbsolute(row.referencePath), false);
    assert.equal(isAbsolute(row.capturePath), false);
    const referencePath = resolve(evidenceDir, row.referencePath);
    const capturePath = resolve(evidenceDir, row.capturePath);
    assert.equal(relative(evidenceDir, referencePath).startsWith(".."), false);
    assert.equal(relative(evidenceDir, capturePath).startsWith(".."), false);
    await stat(referencePath);
    await stat(capturePath);
    const recomputed = await measureJustifyCapture(row.caseId, row.density, row.fontScale, capturePath, evidenceDir);
    assert.deepEqual(recomputed.expectedBounds, row.expectedBounds);
    assert.deepEqual(recomputed.observedBounds, row.observedBounds);
    assert.equal(recomputed.comparedPixels, row.comparedPixels);
    assert.equal(recomputed.mismatchedPixels, row.mismatchedPixels);
    assert.ok(row.comparedPixels > 0);
    assert.ok(row.mismatchedPixels >= 0);
    assert.equal(row.boundaryExclusionPixels, 2);
    assert.equal(row.channelTolerance, 2);
    assert.deepEqual(recomputed.boundMismatches, row.boundMismatches);
    assert.equal(recomputed.status, row.status);
  }
  assert.deepEqual(seen, expectedKeys);
});

test("displaced group fails absolute bounds while aligned interior sampling remains clean", async () => {
  const caseId = "horizontal-center-g10-none";
  const density = 420;
  const fontScale = 1;
  const sourcePath = resolve(evidenceDir, caseId, "capture-420-font-1.png");
  const tempDir = await mkdtemp(join(tmpdir(), "luna-android-justify-negative-"));
  const displacedPath = resolve(tempDir, "displaced.png");
  try {
    await execFile("magick", [sourcePath, "-roll", "+12+0", displacedPath]);
    const displaced = await measureJustifyCapture(caseId, density, fontScale, displacedPath, evidenceDir);
    assert.equal(displaced.status, "fail");
    assert.equal(displaced.mismatchedPixels, 0);
    assert.ok(displaced.boundMismatches.some((mismatch) => mismatch.coordinate === "x" && Math.abs(mismatch.observed - mismatch.expected) > 2));
  } finally {
    await rm(displacedPath, { force: true });
    await rmdir(tempDir);
  }
});

test("tampered retained bytes are rejected by the recorded artifact hash", async () => {
  const manifest = JSON.parse(await readFile(resolve(evidenceDir, "artifact-manifest.json"), "utf8"));
  const record = manifest.files.find((entry) => entry.path === "horizontal-center-g10-none/capture-420-font-1.png");
  assert.ok(record);
  const sourcePath = resolve(evidenceDir, record.path);
  const tempDir = await mkdtemp(join(tmpdir(), "luna-android-justify-tamper-"));
  const tamperedPath = resolve(tempDir, "tampered.png");
  try {
    await copyFile(sourcePath, tamperedPath);
    const bytes = await readFile(tamperedPath);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(tamperedPath, bytes);
    const tampered = await hashedFile(tamperedPath);
    assert.equal(tampered.bytes, record.bytes);
    assert.notEqual(tampered.sha256, record.sha256);
  } finally {
    await rm(tamperedPath, { force: true });
    await rmdir(tempDir);
  }
});
