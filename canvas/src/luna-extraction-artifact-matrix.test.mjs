import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { extractDocumentNode, extractDocumentNodes } from "./export-service.mjs";
import {
  MARKER, ROLELESS_SPECS, TRIANGLE, colorBounds, compareMarkerBounds, decodePng, inspectPdf, parseSvg,
  physicalDocument, rolelessDocument, sha256,
} from "../scripts/luna-extraction-artifact-fixtures.mjs";

const ASSETS = { assets: new Map() };
const formats = ["png", "svg", "pdf"];
const multiSpecs = [ROLELESS_SPECS[0], ROLELESS_SPECS[3], ROLELESS_SPECS[6]];

function expectedPng(spec, scale) {
  return { width: spec.width * scale, height: spec.height * scale, marker: { x: MARKER.x * scale, y: MARKER.y * scale, width: MARKER.width * scale, height: MARKER.height * scale } };
}

function addFailure(failures, label, error) {
  failures.push({ label, code: error?.code ?? "UNCLASSIFIED", message: error?.message ?? String(error) });
}

async function collectCase(outcomes, failures, label, operation) {
  try {
    const value = await operation();
    outcomes.push({ label, status: "pass" });
    return value;
  } catch (error) {
    outcomes.push({ label, status: "fail", code: error?.code ?? "UNCLASSIFIED" });
    addFailure(failures, label, error);
    return null;
  }
}

async function expectCode(outcomes, failures, label, path, code, operation) {
  try {
    await assert.rejects(operation, { code });
    outcomes.push({ label, status: "blocked", code });
  } catch (error) {
    outcomes.push({ label, status: "fail", code: error?.code ?? "UNCLASSIFIED" });
    addFailure(failures, label, error);
  }
  try { await readFile(path); addFailure(failures, `${label}:destination`, new Error("destination exists after rejection")); }
  catch (error) { if (error.code !== "ENOENT") addFailure(failures, `${label}:destination-check`, error); }
}

test("roleless extraction artifacts cover 12 translated roots in PNG/SVG/PDF", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-matrix-"));
  const document = rolelessDocument();
  const outcomes = []; const failures = [];
  try {
    for (const spec of ROLELESS_SPECS) for (const format of formats) {
      const destination = join(directory, "single", `${spec.id}.${format}`);
      await collectCase(outcomes, failures, `single/${spec.id}/${format}`, async () => {
        await import("node:fs/promises").then(({ mkdir }) => mkdir(join(directory, "single"), { recursive: true }));
        await extractDocumentNode(document, { nodeId: spec.id, format, ...(format === "png" ? { scale: 2 } : {}), destination }, ASSETS);
        if (format === "png") {
          const image = decodePng(await readFile(destination));
          const expected = expectedPng(spec, 2);
          assert.deepEqual({ width: image.width, height: image.height }, { width: expected.width, height: expected.height });
          assert.deepEqual([...image.pixels.subarray(0, image.channels).subarray(0, 3)], [255, 255, 255]);
          const comparison = compareMarkerBounds(colorBounds(image), { ...expected.marker, samples: 1 });
          assert.equal(comparison.ok, true, JSON.stringify(comparison));
        } else if (format === "svg") {
          const svg = parseSvg(await readFile(destination, "utf8"));
          assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
          assert.deepEqual(svg.marker && { x: svg.marker.x, y: svg.marker.y, width: svg.marker.width, height: svg.marker.height }, { x: MARKER.x, y: MARKER.y, width: MARKER.width, height: MARKER.height });
          assert.deepEqual(svg.triangle && { d: svg.triangle.d, transform: svg.triangle.transform }, { d: TRIANGLE.geometry, transform: `translate(${TRIANGLE.x} ${TRIANGLE.y}) scale(1 1) translate(0 0)` });
          assert.equal(svg.hasImage, false);
        } else {
          const pdf = await inspectPdf(destination, { ...MARKER, samples: 1 });
          assert.equal(pdf.pages, 1);
          assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
          assert.deepEqual(pdf.rendered, { width: spec.width, height: spec.height });
          assert.equal(pdf.imageXObjectLines.length, 0);
          assert.equal(pdf.markerComparison.ok, true, JSON.stringify(pdf.markerComparison));
        }
      });
    }
    assert.equal(outcomes.length, 36);
    assert.equal(outcomes.filter((row) => row.status === "pass").length, 36);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("directory extraction publishes three named artifacts per format and exact-file multi-unit rules are preflighted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-destination-matrix-"));
  const document = rolelessDocument();
  const outcomes = []; const failures = [];
  try {
    for (const format of formats) {
      const outputDirectory = join(directory, `${format}-directory`);
      const result = await collectCase(outcomes, failures, `directory/${format}`, () => extractDocumentNodes(document, {
        node: multiSpecs.map((spec) => spec.id), format, destination: `${outputDirectory}/`, ...(format === "png" ? { scale: 2 } : {}),
      }, ASSETS));
      if (!result) continue;
      const expectedPaths = multiSpecs.map((spec) => join(outputDirectory, `${spec.id}.${format}`));
      assert.deepEqual(result.artifacts, expectedPaths);
      assert.deepEqual((await readdir(outputDirectory)).sort(), expectedPaths.map((path) => path.split("/").at(-1)).sort());
      for (const [index, spec] of multiSpecs.entries()) {
        const path = expectedPaths[index];
        if (format === "png") {
          const image = decodePng(await readFile(path));
          const expected = expectedPng(spec, 2);
          assert.deepEqual({ width: image.width, height: image.height }, { width: expected.width, height: expected.height });
          assert.equal(compareMarkerBounds(colorBounds(image), { ...expected.marker, samples: 1 }).ok, true);
        } else if (format === "svg") {
          const svg = parseSvg(await readFile(path, "utf8"));
          assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
          assert.equal(svg.hasImage, false);
        } else {
          const pdf = await inspectPdf(path, { ...MARKER, samples: 1 });
          assert.equal(pdf.pages, 1); assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
          assert.equal(pdf.imageXObjectLines.length, 0); assert.equal(pdf.markerComparison.ok, true);
        }
      }
    }
    const ids = multiSpecs.map((spec) => spec.id);
    for (const format of ["png", "svg"]) {
      const destination = join(directory, `multi-${format}.out`);
      await expectCode(outcomes, failures, `exact-file/${format}`, destination, "CANVAS_EXTRACT_FORMAT_SINGLE_UNIT", () => extractDocumentNodes(document, { node: ids, format, destination }, ASSETS));
    }
    const pdfPath = join(directory, "multi.pdf");
    const multi = await collectCase(outcomes, failures, "exact-file/pdf", () => extractDocumentNodes(document, { node: ids, format: "pdf", destination: pdfPath }, ASSETS));
    if (multi) {
      const pages = (await PDFDocument.load(await readFile(pdfPath))).getPages();
      assert.equal(pages.length, 3);
      assert.deepEqual(pages.map((page) => page.getSize()), multiSpecs.map((spec) => ({ width: spec.width, height: spec.height })));
    }
    assert.equal(outcomes.filter((row) => row.status === "pass").length, 4);
    assert.equal(outcomes.filter((row) => row.status === "blocked").length, 2);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("physical roleless PDF preserves mm trim/media/bleed boxes and the PDF/X-4 gate leaves no file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-physical-"));
  const outcomes = []; const failures = [];
  try {
    const physicalPath = join(directory, "a4-roleless.pdf");
    await collectCase(outcomes, failures, "physical/pdf", async () => {
      await extractDocumentNode(physicalDocument(), { nodeId: ROLELESS_SPECS[0].id, format: "pdf", destination: physicalPath }, ASSETS);
      const trimWidth = 210 * 72 / 25.4; const trimHeight = 297 * 72 / 25.4;
      const expectedPhysicalMarker = {
        x: Math.round(9 + MARKER.x * trimWidth / ROLELESS_SPECS[0].width),
        y: Math.round(9 + MARKER.y * trimHeight / ROLELESS_SPECS[0].height),
        width: Math.round(MARKER.width * trimWidth / ROLELESS_SPECS[0].width),
        height: Math.round(MARKER.height * trimHeight / ROLELESS_SPECS[0].height),
        samples: 1,
      };
      const observed = await inspectPdf(physicalPath, expectedPhysicalMarker);
      assert.equal(observed.pages, 1);
      assert.ok(Math.abs(observed.mediaBox.width - (trimWidth + 18)) < 0.001);
      assert.ok(Math.abs(observed.mediaBox.height - (trimHeight + 18)) < 0.001);
      assert.ok(Math.abs(observed.bleedBox.width - (trimWidth + 18)) < 0.001);
      assert.ok(Math.abs(observed.bleedBox.height - (trimHeight + 18)) < 0.001);
      assert.ok(Math.abs(observed.trimBox.x - 9) < 0.001 && Math.abs(observed.trimBox.y - 9) < 0.001);
      assert.ok(Math.abs(observed.trimBox.width - trimWidth) < 0.001 && Math.abs(observed.trimBox.height - trimHeight) < 0.001);
      assert.deepEqual(observed.rendered, { width: Math.ceil(trimWidth + 18), height: Math.ceil(trimHeight + 18) });
      assert.equal(observed.markerComparison.ok, true, JSON.stringify(observed.markerComparison));
      assert.equal(observed.imageXObjectLines.length, 0);
    });
    const unverifiedPath = join(directory, "unverified.pdf");
    await expectCode(outcomes, failures, "physical/pdf-x4", unverifiedPath, "CANVAS_PDF_PROFILE_UNVERIFIED", () => extractDocumentNode(rolelessDocument([ROLELESS_SPECS[0]]), { nodeId: ROLELESS_SPECS[0].id, format: "pdf", profile: "PDF/X-4", destination: unverifiedPath }, ASSETS));
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("marker comparator rejects null/zero samples and shifts beyond the two-pixel boundary", () => {
  const expected = { x: 10, y: 12, width: 20, height: 16 };
  assert.equal(compareMarkerBounds({ ...expected, samples: 10 }, expected, 2).ok, true);
  assert.equal(compareMarkerBounds({ ...expected, x: 12, samples: 1 }, expected, 2).ok, true);
  assert.equal(compareMarkerBounds({ ...expected, x: 13, samples: 1 }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds({ x: null, y: null, width: null, height: null, samples: 0 }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds(undefined, expected, 2).ok, false);
});

test("retained representative corpus has verified hashes and regenerates current semantic measurements", async () => {
  const manifestUrl = new URL("../research/luna-extraction-artifact-matrix-20260907/corpus/manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.retainedCount, 12);
  assert.equal(manifest.retained.length, 12);
  assert.equal(new Set(manifest.retained.map((record) => record.path)).size, 12);
  const corpusRoot = fileURLToPath(new URL("../research/luna-extraction-artifact-matrix-20260907/corpus/", import.meta.url));
  for (const record of manifest.retained) {
    assert.equal(record.path.startsWith("/"), false);
    assert.equal(record.path.includes(".."), false);
    const bytes = await readFile(new URL(`../research/luna-extraction-artifact-matrix-20260907/corpus/${record.path}`, import.meta.url));
    assert.equal(sha256(bytes), record.hash);
  }
  const regenerated = await mkdtemp(join(tmpdir(), "canvas-roleless-retained-regeneration-"));
  const document = rolelessDocument();
  try {
    for (const [index, record] of manifest.retained.entries()) {
      const spec = ROLELESS_SPECS.find((candidate) => candidate.id === record.id);
      assert.ok(spec, `retained fixture ${record.id} is present in the explicit identity matrix`);
      const destination = join(regenerated, `${index}.${record.format}`);
      await extractDocumentNode(document, { nodeId: spec.id, format: record.format, ...(record.format === "png" ? { scale: 2 } : {}), destination }, ASSETS);
      if (record.format === "png") {
        const image = decodePng(await readFile(destination));
        const expected = expectedPng(spec, 2);
        assert.deepEqual({ width: image.width, height: image.height }, { width: expected.width, height: expected.height });
        assert.equal(compareMarkerBounds(colorBounds(image), { ...expected.marker, samples: 1 }).ok, true);
      } else if (record.format === "svg") {
        const svg = parseSvg(await readFile(destination, "utf8"));
        assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
        assert.deepEqual({ x: svg.marker?.x, y: svg.marker?.y, width: svg.marker?.width, height: svg.marker?.height }, { x: MARKER.x, y: MARKER.y, width: MARKER.width, height: MARKER.height });
        assert.deepEqual(svg.triangle?.d, TRIANGLE.geometry);
        assert.equal(svg.hasImage, false);
      } else {
        const pdf = await inspectPdf(destination, { ...MARKER, samples: 1 });
        assert.equal(pdf.pages, 1); assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
        assert.deepEqual(pdf.rendered, { width: spec.width, height: spec.height });
        assert.equal(pdf.markerComparison.ok, true); assert.equal(pdf.imageXObjectLines.length, 0);
      }
    }
    assert.equal(corpusRoot.endsWith("/corpus/"), true);
  } finally { await rm(regenerated, { recursive: true, force: true }); }
});
