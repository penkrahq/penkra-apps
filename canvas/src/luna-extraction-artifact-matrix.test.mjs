import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { openBrowser } from "../compatibility/browser-fixture.mjs";
import { extractDocumentNode, extractDocumentNodes } from "./export-service.mjs";
import { preflightPdfx4 } from "./exporters/pdfx-preflight.mjs";
import {
  MARKER, ROLELESS_SPECS, TRIANGLE, colorBounds, compareMarkerBounds, compareTriangleMeasurement, decodePng,
  inspectPdf, inspectPdfPages, parseSvg, physicalDocument, rolelessDocument, runTool, sha256, triangleMeasurement,
} from "../scripts/luna-extraction-artifact-fixtures.mjs";

const ASSETS = { assets: new Map() };
const formats = ["png", "svg", "pdf"];
const multiSpecs = [ROLELESS_SPECS[0], ROLELESS_SPECS[3], ROLELESS_SPECS[6]];

function expectedPng(spec, scale) {
  return { width: spec.width * scale, height: spec.height * scale, marker: { x: MARKER.x * scale, y: MARKER.y * scale, width: MARKER.width * scale, height: MARKER.height * scale } };
}

function expectedTriangle(scale = 1) {
  return { x: TRIANGLE.x * scale, y: TRIANGLE.y * scale, width: TRIANGLE.width * scale, height: TRIANGLE.height * scale };
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
          const triangle = triangleMeasurement(image, expectedTriangle(2));
          assert.equal(compareTriangleMeasurement(triangle, expectedTriangle(2)).ok, true, JSON.stringify(triangle));
        } else if (format === "svg") {
          const svg = parseSvg(await readFile(destination, "utf8"));
          assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
          assert.deepEqual(svg.marker && { x: svg.marker.x, y: svg.marker.y, width: svg.marker.width, height: svg.marker.height }, { x: MARKER.x, y: MARKER.y, width: MARKER.width, height: MARKER.height });
          assert.deepEqual(svg.triangle && { d: svg.triangle.d, transform: svg.triangle.transform }, { d: TRIANGLE.geometry, transform: `translate(${TRIANGLE.x} ${TRIANGLE.y}) scale(1 1) translate(0 0)` });
          assert.equal(svg.hasImage, false);
        } else {
          const pdf = await inspectPdf(destination, { ...MARKER, samples: 1 }, 2, expectedTriangle());
          assert.equal(pdf.pages, 1);
          assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
          assert.deepEqual(pdf.rendered, { width: spec.width, height: spec.height });
          assert.equal(pdf.imageXObjectLines.length, 0);
          assert.equal(pdf.markerComparison.ok, true, JSON.stringify(pdf.markerComparison));
          assert.equal(pdf.triangleComparison.ok, true, JSON.stringify(pdf.triangleComparison));
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
          assert.equal(compareTriangleMeasurement(triangleMeasurement(image, expectedTriangle(2)), expectedTriangle(2)).ok, true);
        } else if (format === "svg") {
          const svg = parseSvg(await readFile(path, "utf8"));
          assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
          assert.equal(svg.hasImage, false);
        } else {
          const pdf = await inspectPdf(path, { ...MARKER, samples: 1 }, 2, expectedTriangle());
          assert.equal(pdf.pages, 1); assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
          assert.equal(pdf.imageXObjectLines.length, 0); assert.equal(pdf.markerComparison.ok, true); assert.equal(pdf.triangleComparison.ok, true);
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
      const rendered = await inspectPdfPages(pdfPath, multiSpecs.map(() => ({ marker: { ...MARKER, samples: 1 }, triangle: expectedTriangle() })));
      assert.equal(rendered.pages, 3);
      assert.deepEqual(rendered.pageSizes, multiSpecs.map((spec) => ({ width: spec.width, height: spec.height })));
      assert.equal(rendered.renderedPages.length, 3);
      for (const page of rendered.renderedPages) {
        assert.equal(page.markerComparison.ok, true, JSON.stringify(page.markerComparison));
        assert.equal(page.triangleComparison.ok, true, JSON.stringify(page.triangleComparison));
      }
    }
    assert.equal(outcomes.filter((row) => row.status === "pass").length, 4);
    assert.equal(outcomes.filter((row) => row.status === "blocked").length, 2);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("physical roleless PDF preserves mm trim/media/bleed boxes and the PDF/X-4 writer publishes a verified artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-physical-"));
  const outcomes = []; const failures = [];
  const trimWidth = 210 * 72 / 25.4; const trimHeight = 297 * 72 / 25.4;
  try {
    const physicalPath = join(directory, "a4-roleless.pdf");
    await collectCase(outcomes, failures, "physical/pdf", async () => {
      await extractDocumentNode(physicalDocument(), { nodeId: ROLELESS_SPECS[0].id, format: "pdf", destination: physicalPath }, ASSETS);
      const expectedPhysicalMarker = {
        x: Math.round(9 + MARKER.x * trimWidth / ROLELESS_SPECS[0].width),
        y: Math.round(9 + MARKER.y * trimHeight / ROLELESS_SPECS[0].height),
        width: Math.round(MARKER.width * trimWidth / ROLELESS_SPECS[0].width),
        height: Math.round(MARKER.height * trimHeight / ROLELESS_SPECS[0].height),
        samples: 1,
      };
      const expectedPhysicalTriangle = {
        x: Math.round(9 + TRIANGLE.x * trimWidth / ROLELESS_SPECS[0].width),
        y: Math.round(9 + TRIANGLE.y * trimHeight / ROLELESS_SPECS[0].height),
        width: Math.round(TRIANGLE.width * trimWidth / ROLELESS_SPECS[0].width),
        height: Math.round(TRIANGLE.height * trimHeight / ROLELESS_SPECS[0].height),
      };
      const observed = await inspectPdf(physicalPath, expectedPhysicalMarker, 2, expectedPhysicalTriangle);
      assert.equal(observed.pages, 1);
      assert.ok(Math.abs(observed.mediaBox.width - (trimWidth + 18)) < 0.001);
      assert.ok(Math.abs(observed.mediaBox.height - (trimHeight + 18)) < 0.001);
      assert.ok(Math.abs(observed.bleedBox.width - (trimWidth + 18)) < 0.001);
      assert.ok(Math.abs(observed.bleedBox.height - (trimHeight + 18)) < 0.001);
      assert.ok(Math.abs(observed.trimBox.x - 9) < 0.001 && Math.abs(observed.trimBox.y - 9) < 0.001);
      assert.ok(Math.abs(observed.trimBox.width - trimWidth) < 0.001 && Math.abs(observed.trimBox.height - trimHeight) < 0.001);
      assert.deepEqual(observed.rendered, { width: Math.ceil(trimWidth + 18), height: Math.ceil(trimHeight + 18) });
      assert.equal(observed.markerComparison.ok, true, JSON.stringify(observed.markerComparison));
      assert.equal(observed.triangleComparison.ok, true, JSON.stringify(observed.triangleComparison));
      assert.equal(observed.imageXObjectLines.length, 0);
    });
    const pdfxPath = join(directory, "writer-verified.pdf");
    await collectCase(outcomes, failures, "physical/pdf-x4", async () => {
      const result = await extractDocumentNode(physicalDocument(), { nodeId: ROLELESS_SPECS[0].id, format: "pdf", profile: "PDF/X-4", destination: pdfxPath }, ASSETS);
      assert.deepEqual(result.artifacts, [pdfxPath]);
      const bytes = await readFile(pdfxPath);
      assert.equal(bytes.subarray(0, 8).toString("latin1"), "%PDF-1.6");
      const pdfx = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
      assert.equal(pdfx.getPages().length, 1);
      const page = pdfx.getPages()[0];
      assert.ok(Math.abs(page.getTrimBox().width - trimWidth) < 0.001);
      assert.ok(Math.abs(page.getTrimBox().height - trimHeight) < 0.001);
      assert.ok(Math.abs(page.getMediaBox().width - (trimWidth + 18)) < 0.001);
      assert.ok(Math.abs(page.getMediaBox().height - (trimHeight + 18)) < 0.001);
      const report = await preflightPdfx4(bytes);
      assert.deepEqual(report.issues, []);
      assert.equal(report.canvasWriterSubset?.verified, true);
      assert.equal(report.conformant, false);
    });
    const invalidProfilePath = join(directory, "invalid-profile.pdf");
    await expectCode(outcomes, failures, "physical/invalid-profile", invalidProfilePath, "CANVAS_PDF_PROFILE_UNKNOWN", () => extractDocumentNode(rolelessDocument([ROLELESS_SPECS[0]]), { nodeId: ROLELESS_SPECS[0].id, format: "pdf", profile: "PDF/X-3", destination: invalidProfilePath }, ASSETS));
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("marker comparator rejects null/zero samples and shifts beyond the two-pixel boundary", () => {
  const expected = { x: 10, y: 12, width: 20, height: 16 };
  assert.equal(compareMarkerBounds({ ...expected, samples: 10 }, expected, 2).ok, true);
  assert.equal(compareMarkerBounds({ ...expected, x: 12, samples: 1 }, expected, 2).ok, true);
  assert.equal(compareMarkerBounds({ ...expected, x: 13, samples: 1 }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds({ x: null, y: null, width: null, height: null, samples: 0 }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds({ ...expected, samples: Number.NaN }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds({ ...expected, samples: -1 }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds({ ...expected, samples: undefined }, expected, 2).ok, false);
  assert.equal(compareMarkerBounds(undefined, expected, 2).ok, false);
});

test("missing, rectangular, vertically flipped and shifted triangles all fail the independent mask oracle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-missing-triangle-"));
  try {
    const mutations = [
      ["missing", (triangle, root) => { root.children = root.children.filter((node) => node !== triangle); }],
      ["rectangle", (triangle) => { triangle.type = "rectangle"; delete triangle.geometry; delete triangle.viewBox; }],
      ["flipped", (triangle) => { triangle.geometry = "M 0 0 L 15 25 L 30 0 Z"; }],
      ["shifted-3px", (triangle) => { triangle.x += 3; }],
    ];
    for (const [name, mutate] of mutations) {
      const document = rolelessDocument([ROLELESS_SPECS[0]]);
      const triangle = document.children[0].children.find((node) => node.id.endsWith("-triangle"));
      mutate(triangle, document.children[0]);
      const path = join(directory, `${name}.png`);
      await extractDocumentNode(document, { nodeId: ROLELESS_SPECS[0].id, format: "png", scale: 2, destination: path }, ASSETS);
      const measurement = triangleMeasurement(decodePng(await readFile(path)), expectedTriangle(2));
      assert.equal(compareTriangleMeasurement(measurement, expectedTriangle(2)).ok, false, name);
      if (name === "missing") assert.equal(measurement.samples, 0);
    }
    const realScaleOnePath = join(directory, "real-scale-one.png");
    await extractDocumentNode(rolelessDocument([ROLELESS_SPECS[0]]), { nodeId: ROLELESS_SPECS[0].id, format: "png", destination: realScaleOnePath }, ASSETS);
    const realScaleOne = triangleMeasurement(decodePng(await readFile(realScaleOnePath)), expectedTriangle());
    assert.equal(compareTriangleMeasurement(realScaleOne, expectedTriangle()).ok, true, JSON.stringify(realScaleOne));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("SVG artifacts receive native browser render measurements through the existing vector harness", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-svg-render-"));
  let browser;
  try {
    browser = await openBrowser(join(directory, "chrome"), context.signal);
    const document = rolelessDocument();
    for (const spec of ROLELESS_SPECS) {
      const path = join(directory, `${spec.id}.svg`);
      await extractDocumentNode(document, { nodeId: spec.id, format: "svg", destination: path }, ASSETS);
      const image = decodePng(await browser.screenshot(pathToFileURL(path).href, spec.width, spec.height, 1));
      assert.deepEqual({ width: image.width, height: image.height }, { width: spec.width, height: spec.height });
      assert.equal(compareMarkerBounds(colorBounds(image), { ...MARKER, samples: 1 }).ok, true);
      assert.equal(compareTriangleMeasurement(triangleMeasurement(image, expectedTriangle()), expectedTriangle()).ok, true);
    }
    const manifest = JSON.parse(await readFile(new URL("../research/luna-extraction-artifact-matrix-20260907/corpus/manifest.json", import.meta.url), "utf8"));
    for (const record of manifest.retained.filter((candidate) => candidate.format === "svg")) {
      const spec = ROLELESS_SPECS.find((candidate) => candidate.id === record.id);
      const retainedPath = fileURLToPath(new URL(`../research/luna-extraction-artifact-matrix-20260907/corpus/${record.path}`, import.meta.url));
      const image = decodePng(await browser.screenshot(pathToFileURL(retainedPath).href, spec.width, spec.height, 1));
      assert.equal(compareMarkerBounds(colorBounds(image), { ...MARKER, samples: 1 }).ok, true);
      assert.equal(compareTriangleMeasurement(triangleMeasurement(image, expectedTriangle()), expectedTriangle()).ok, true);
    }
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF inspection subprocesses enforce a finite timeout", async () => {
  await assert.rejects(runTool(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], 100), (error) => error?.killed === true && error?.signal === "SIGKILL");
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
      const retainedBytes = await readFile(new URL(`../research/luna-extraction-artifact-matrix-20260907/corpus/${record.path}`, import.meta.url));
      if (record.format === "png") {
        const retainedImage = decodePng(retainedBytes);
        const expected = expectedPng(spec, 2);
        assert.deepEqual({ width: retainedImage.width, height: retainedImage.height }, { width: expected.width, height: expected.height });
        assert.equal(compareMarkerBounds(colorBounds(retainedImage), { ...expected.marker, samples: 1 }).ok, true);
        assert.equal(compareTriangleMeasurement(triangleMeasurement(retainedImage, expectedTriangle(2)), expectedTriangle(2)).ok, true);
      } else if (record.format === "svg") {
        const retainedSvg = parseSvg(retainedBytes.toString("utf8"));
        assert.deepEqual(retainedSvg.viewBox, [0, 0, spec.width, spec.height]);
        assert.equal(retainedSvg.hasImage, false);
        assert.deepEqual(retainedSvg.triangle?.d, TRIANGLE.geometry);
      } else {
        const retainedPdf = join(regenerated, `retained-${index}.pdf`);
        await writeFile(retainedPdf, retainedBytes);
        const inspectedRetainedPdf = await inspectPdf(retainedPdf, { ...MARKER, samples: 1 }, 2, expectedTriangle());
        assert.equal(inspectedRetainedPdf.pages, 1);
        assert.equal(inspectedRetainedPdf.markerComparison.ok, true);
        assert.equal(inspectedRetainedPdf.triangleComparison.ok, true);
        assert.equal(inspectedRetainedPdf.imageXObjectLines.length, 0);
      }
      const destination = join(regenerated, `${index}.${record.format}`);
      await extractDocumentNode(document, { nodeId: spec.id, format: record.format, ...(record.format === "png" ? { scale: 2 } : {}), destination }, ASSETS);
      if (record.format === "png") {
        const image = decodePng(await readFile(destination));
        const expected = expectedPng(spec, 2);
        assert.deepEqual({ width: image.width, height: image.height }, { width: expected.width, height: expected.height });
        assert.equal(compareMarkerBounds(colorBounds(image), { ...expected.marker, samples: 1 }).ok, true);
        assert.equal(compareTriangleMeasurement(triangleMeasurement(image, expectedTriangle(2)), expectedTriangle(2)).ok, true);
      } else if (record.format === "svg") {
        const svg = parseSvg(await readFile(destination, "utf8"));
        assert.deepEqual(svg.viewBox, [0, 0, spec.width, spec.height]);
        assert.deepEqual({ x: svg.marker?.x, y: svg.marker?.y, width: svg.marker?.width, height: svg.marker?.height }, { x: MARKER.x, y: MARKER.y, width: MARKER.width, height: MARKER.height });
        assert.deepEqual(svg.triangle?.d, TRIANGLE.geometry);
        assert.equal(svg.hasImage, false);
      } else {
        const pdf = await inspectPdf(destination, { ...MARKER, samples: 1 }, 2, expectedTriangle());
        assert.equal(pdf.pages, 1); assert.deepEqual(pdf.pageSize, { width: spec.width, height: spec.height });
        assert.deepEqual(pdf.rendered, { width: spec.width, height: spec.height });
        assert.equal(pdf.markerComparison.ok, true); assert.equal(pdf.triangleComparison.ok, true); assert.equal(pdf.imageXObjectLines.length, 0);
      }
    }
    assert.equal(corpusRoot.endsWith("/corpus/"), true);
  } finally { await rm(regenerated, { recursive: true, force: true }); }
});
