import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName } from "pdf-lib";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { extractDocumentNode, extractDocumentNodes } from "../src/export-service.mjs";

export const SCALE_CASES = Object.freeze([
  { scale: 1, dpi: 72 },
  { scale: 2, dpi: 144 },
  { scale: 3, dpi: 216 },
]);

export const EXTRACTION_CASES = Object.freeze([
  { name: "rectangle-path", node: { type: "path", geometry: "M0 0H100V100H0Z", viewBox: [0, 0, 100, 100], fill: "#168557" } },
  { name: "rectangle-polygon", node: { type: "polygon", geometry: "M0 0H100V100H0Z", viewBox: [0, 0, 100, 100], fill: "#168557" } },
  { name: "ring-evenodd", node: { type: "path", geometry: "M0 0H100V100H0Z M25 25H75V75H25Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#F04C24" } },
  { name: "ring-nonzero", node: { type: "path", geometry: "M0 0H100V100H0Z M25 25H75V75H25Z", viewBox: [0, 0, 100, 100], fillRule: "nonzero", fill: "#F04C24" } },
  { name: "cubic-ring-evenodd", node: { type: "path", geometry: "M0 50 C0 0 100 0 100 50 C100 100 0 100 0 50 Z M25 50 C25 25 75 25 75 50 C75 75 25 75 25 50 Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#F04C24" } },
  { name: "open-stroked-path", node: { type: "path", geometry: "M0 0L100 50L0 100", viewBox: [0, 0, 100, 100], stroke: { fill: "#123456", thickness: 4 } } },
  { name: "alpha-behind-green", node: { type: "rectangle", fill: "#F04C2480" }, extra: [{ id: "green", type: "rectangle", x: 110, y: 100, width: 80, height: 70, fill: "#168557" }] },
  { name: "transparent-child-frame", special: "transparent-child-frame" },
]);

const PAGE_WIDTH = 300;
const PAGE_HEIGHT = 220;
const CONTENT_BOUNDARY_PHYSICAL_PIXELS = 2;
const CHANNEL_TOLERANCE = 2;

export function makeExtractionDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: EXTRACTION_CASES.map((fixture, index) => {
      const pageId = `page-${index + 1}`;
      const children = fixture.special === "transparent-child-frame"
        ? [{
          id: `child-frame-${index + 1}`, type: "frame", layout: "none", x: 10, y: 10, width: 200, height: 180,
          children: [
            { id: `white-back-${index + 1}`, type: "rectangle", x: 0, y: 0, width: 200, height: 180, fill: "#FFFFFF" },
            { id: `child-ring-${index + 1}`, type: "path", x: 30, y: 20, width: 140, height: 140, geometry: "M0 0H100V100H0Z M25 25H75V75H25Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#F04C24" },
          ],
        }]
        : [{
          id: `main-${index + 1}`, type: fixture.node.type, x: 40, y: 30, width: 140, height: 140,
          geometry: fixture.node.geometry, viewBox: fixture.node.viewBox, fillRule: fixture.node.fillRule,
          ...(fixture.node.fill ? { fill: fixture.node.fill } : {}), ...(fixture.node.stroke ? { stroke: fixture.node.stroke } : {}),
        }, ...(fixture.extra ?? []).map((node, extraIndex) => ({ ...node, id: `${node.id}-${index + 1}-${extraIndex + 1}` }))];
      return { id: pageId, type: "frame", layout: "none", width: PAGE_WIDTH, height: PAGE_HEIGHT, fill: "#E8EEF4", children };
    }),
  };
}

function portablePath(outputDir, absolutePath) {
  return relative(outputDir, absolutePath).split("\\").join("/");
}

function popplerVersion() {
  const result = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`Poppler blocker: pdftoppm is unavailable (${result.error?.message ?? result.stderr ?? `exit ${result.status}`}).`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n")[0];
}

function renderPoppler(pdfPath, pngPath, dpi) {
  const prefix = pngPath.endsWith(".png") ? pngPath.slice(0, -4) : pngPath;
  const command = ["pdftoppm", "-r", String(dpi), "-singlefile", "-png", pdfPath, prefix];
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`pdftoppm failed: ${command.join(" ")}\n${result.stderr ?? result.error?.message ?? ""}`);
  return command;
}

function pngPixels(image, canvasKit) {
  const decoded = canvasKit.MakeImageFromEncoded(image);
  if (!decoded) throw new Error("CanvasKit could not decode a PNG artifact.");
  try {
    const width = decoded.width();
    const height = decoded.height();
    const pixels = decoded.readPixels(0, 0, {
      width, height, colorType: canvasKit.ColorType.RGBA_8888,
      alphaType: canvasKit.AlphaType.Unpremul, colorSpace: canvasKit.ColorSpace.SRGB,
    });
    if (!pixels) throw new Error("CanvasKit could not read PNG pixels.");
    return { width, height, pixels: Buffer.from(pixels) };
  } finally { decoded.delete(); }
}

function hashPixels(decoded) { return createHash("sha256").update(decoded.pixels).digest("hex"); }

export function compareUniformInterior(reference, actual, scale) {
  const boundary = CONTENT_BOUNDARY_PHYSICAL_PIXELS;
  const radius = boundary;
  const result = {
    width: reference.width, height: reference.height, actualWidth: actual.width, actualHeight: actual.height,
    boundaryPhysicalPixels: CONTENT_BOUNDARY_PHYSICAL_PIXELS, boundaryRasterPixels: CONTENT_BOUNDARY_PHYSICAL_PIXELS,
    channelTolerance: CHANNEL_TOLERANCE, comparedPixels: 0, comparedChannels: 0,
    mismatchPixels: 0, mismatchChannels: 0, maxObservedChannelDifference: 0,
  };
  if (reference.width !== actual.width || reference.height !== actual.height) return { ...result, dimensionMismatch: true };
  for (let y = boundary; y < reference.height - boundary; y += 1) for (let x = boundary; x < reference.width - boundary; x += 1) {
    let uniform = true;
    const center = (y * reference.width + x) * 4;
    for (let dy = -radius; dy <= radius && uniform; dy += 1) for (let dx = -radius; dx <= radius && uniform; dx += 1) {
      const neighbor = ((y + dy) * reference.width + x + dx) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        if (Math.abs(reference.pixels[center + channel] - reference.pixels[neighbor + channel]) > 1) { uniform = false; break; }
      }
    }
    if (!uniform) continue;
    result.comparedPixels += 1;
    let pixelMismatch = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(reference.pixels[center + channel] - actual.pixels[center + channel]);
      result.comparedChannels += 1;
      result.maxObservedChannelDifference = Math.max(result.maxObservedChannelDifference, difference);
      if (difference > CHANNEL_TOLERANCE) { result.mismatchChannels += 1; pixelMismatch = true; }
    }
    if (pixelMismatch) result.mismatchPixels += 1;
  }
  return result;
}

async function writeReference(document, nodeId, scale, path) {
  const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds: [nodeId] }], new Map(), { scale, maxDimension: 8192, failOnDownscale: true });
  if (screenshot.width !== PAGE_WIDTH * scale || screenshot.height !== PAGE_HEIGHT * scale) throw new Error(`Canvas reference ${nodeId} at scale ${scale} measured ${screenshot.width}x${screenshot.height}, expected ${PAGE_WIDTH * scale}x${PAGE_HEIGHT * scale}.`);
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

async function inspectPdf(pdfPath) {
  const parsed = await PDFDocument.load(await readFile(pdfPath));
  const page = parsed.getPages()[0];
  const images = parsed.context.enumerateIndirectObjects().some(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image");
  return { pageCount: parsed.getPageCount(), width: page.getWidth(), height: page.getHeight(), imageXObjects: images };
}

async function fileSize(path) { return (await stat(path)).size; }

async function renderAndMeasure(document, fixture, pdfPath, outputDir, canvasKit, record) {
  const scaleCase = SCALE_CASES.find(({ scale }) => scale === record.scale);
  const referencePath = join(outputDir, "canvas-references", `${fixture.name}-scale-${record.scale}.png`);
  const popplerPath = join(outputDir, "poppler", `${fixture.name}-scale-${record.scale}.png`);
  await mkdir(dirname(referencePath), { recursive: true });
  await mkdir(dirname(popplerPath), { recursive: true });
  await writeReference(document, record.nodeId, record.scale, referencePath);
  const command = renderPoppler(pdfPath, popplerPath, scaleCase.dpi);
  const reference = pngPixels(await readFile(referencePath), canvasKit);
  const actual = pngPixels(await readFile(popplerPath), canvasKit);
  if (actual.width !== PAGE_WIDTH * record.scale || actual.height !== PAGE_HEIGHT * record.scale) throw new Error(`Poppler render ${fixture.name} at scale ${record.scale} measured ${actual.width}x${actual.height}, expected ${PAGE_WIDTH * record.scale}x${PAGE_HEIGHT * record.scale}.`);
  const measurement = compareUniformInterior(reference, actual, record.scale);
  return {
    ...record, dpi: scaleCase.dpi, referencePath: portablePath(outputDir, referencePath), popplerPath: portablePath(outputDir, popplerPath),
    popplerCommand: command, referenceWidth: reference.width, referenceHeight: reference.height,
    popplerWidth: actual.width, popplerHeight: actual.height, referencePixelHash: hashPixels(reference), popplerPixelHash: hashPixels(actual),
    measurement, status: measurement.dimensionMismatch || measurement.mismatchPixels > 0 ? "mismatch" : "pass",
    artifactBytes: { reference: await fileSize(referencePath), poppler: await fileSize(popplerPath) },
  };
}

async function runMultiNodeCheck(document, outputDir, canvasKit, singleCases) {
  const nodeIds = EXTRACTION_CASES.map((_, index) => `page-${index + 1}`);
  const pdfPath = join(outputDir, "multi-node-8-pages.pdf");
  await extractDocumentNodes(document, { node: nodeIds, format: "pdf", destination: pdfPath }, { assets: new Map() });
  const parsed = await PDFDocument.load(await readFile(pdfPath));
  const pageInfo = parsed.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() }));
  const prefix = join(outputDir, "multi-node-pages", "page");
  await mkdir(dirname(prefix), { recursive: true });
  const command = ["pdftoppm", "-r", "72", "-png", "-f", "1", "-l", "8", pdfPath, prefix];
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`pdftoppm failed: ${command.join(" ")}\n${result.stderr ?? result.error?.message ?? ""}`);
  const pages = [];
  for (let index = 0; index < nodeIds.length; index += 1) {
    const pagePath = `${prefix}-${index + 1}.png`;
    const pixels = pngPixels(await readFile(pagePath), canvasKit);
    const single = singleCases.find((item) => item.nodeId === nodeIds[index] && item.scale === 1);
    pages.push({
      index: index + 1, nodeId: nodeIds[index], path: portablePath(outputDir, pagePath),
      width: pixels.width, height: pixels.height, pixelHash: hashPixels(pixels),
      singleUnitPixelHash: single?.popplerPixelHash ?? null, matchesSingleUnit: Boolean(single && hashPixels(pixels) === single.popplerPixelHash),
      bytes: await fileSize(pagePath),
    });
  }
  return {
    path: portablePath(outputDir, pdfPath), bytes: await fileSize(pdfPath), pageCount: parsed.getPageCount(), pageInfo,
    command, authoredNodeOrder: nodeIds, pages, distinctPixelHashes: new Set(pages.map((page) => page.pixelHash)).size,
    orderedHashesMatch: pages.every((page) => page.matchesSingleUnit),
  };
}

export async function runExtractionMatrix(outputDirectory) {
  const outputDir = resolve(outputDirectory);
  await mkdir(outputDir, { recursive: true });
  const poppler = popplerVersion();
  const document = makeExtractionDocument();
  const canvasKit = await getCanvasKit();
  const cases = [];
  for (const [index, fixture] of EXTRACTION_CASES.entries()) {
    const nodeId = `page-${index + 1}`;
    const pdfPath = join(outputDir, "pdfs", `${fixture.name}.pdf`);
    await mkdir(dirname(pdfPath), { recursive: true });
    let pdfInspection;
    let extractionError;
    try {
      await extractDocumentNode(document, { nodeId, format: "pdf", destination: pdfPath }, { assets: new Map() });
      pdfInspection = await inspectPdf(pdfPath);
      if (pdfInspection.pageCount !== 1 || pdfInspection.width !== PAGE_WIDTH || pdfInspection.height !== PAGE_HEIGHT || pdfInspection.imageXObjects) throw new Error(`PDF invariant failed: ${JSON.stringify(pdfInspection)}`);
    } catch (error) { extractionError = { name: error.name, message: error.message, code: error.code ?? null }; }
    for (const { scale, dpi } of SCALE_CASES) {
      const record = { fixture: fixture.name, nodeId, scale, dpi, pdfPath: portablePath(outputDir, pdfPath), pdfInspection, expectedPage: { width: PAGE_WIDTH, height: PAGE_HEIGHT, count: 1, imageXObjects: false } };
      if (extractionError) cases.push({ ...record, status: "error", error: extractionError });
      else {
        try { cases.push(await renderAndMeasure(document, fixture, pdfPath, outputDir, canvasKit, record)); }
        catch (error) { cases.push({ ...record, status: "error", error: { name: error.name, message: error.message, code: error.code ?? null } }); }
      }
    }
  }
  const successfulCases = cases.filter((item) => item.status !== "error");
  const multiNode = await runMultiNodeCheck(document, outputDir, canvasKit, successfulCases);
  const manifest = {
    schema: 1, kind: "ordinary-pdf-extraction-rendering", generatedAt: new Date().toISOString(), poppler,
    page: { width: PAGE_WIDTH, height: PAGE_HEIGHT, dpi: SCALE_CASES.map((item) => item.dpi) },
    comparison: { boundaryPhysicalPixels: CONTENT_BOUNDARY_PHYSICAL_PIXELS, boundaryRasterPixels: CONTENT_BOUNDARY_PHYSICAL_PIXELS, channelTolerance: CHANNEL_TOLERANCE, noRegistration: true, uniformInteriorOnly: true },
    counts: { fixtures: EXTRACTION_CASES.length, scales: SCALE_CASES.length, comparisons: cases.length, passed: cases.filter((item) => item.status === "pass").length, mismatches: cases.filter((item) => item.status === "mismatch").length, errors: cases.filter((item) => item.status === "error").length },
    cases, multiNode,
  };
  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function recomputeExtractionMeasurements(outputDirectory) {
  const root = resolve(outputDirectory);
  const manifestPath = join(root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const canvasKit = await getCanvasKit();
  for (const record of manifest.cases) {
    if (record.status === "error") continue;
    const reference = pngPixels(await readFile(join(root, record.referencePath)), canvasKit);
    const actual = pngPixels(await readFile(join(root, record.popplerPath)), canvasKit);
    const measurement = compareUniformInterior(reference, actual, record.scale);
    record.referenceWidth = reference.width;
    record.referenceHeight = reference.height;
    record.popplerWidth = actual.width;
    record.popplerHeight = actual.height;
    record.referencePixelHash = hashPixels(reference);
    record.popplerPixelHash = hashPixels(actual);
    record.pdfInspection = await inspectPdf(join(root, record.pdfPath));
    record.measurement = measurement;
    record.status = measurement.dimensionMismatch || measurement.mismatchPixels > 0 ? "mismatch" : "pass";
  }
  manifest.comparison.boundaryRasterPixels = CONTENT_BOUNDARY_PHYSICAL_PIXELS;
  manifest.counts.passed = manifest.cases.filter((item) => item.status === "pass").length;
  manifest.counts.mismatches = manifest.cases.filter((item) => item.status === "mismatch").length;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyExtractionEvidence(outputDir) {
  const root = resolve(outputDir);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.counts.fixtures, 8);
  assert.equal(manifest.counts.scales, 3);
  assert.equal(manifest.counts.comparisons, 24);
  assert.equal(manifest.comparison.noRegistration, true);
  assert.equal(manifest.comparison.boundaryRasterPixels, 2);
  for (const record of manifest.cases) {
    for (const artifact of [record.pdfPath, record.referencePath, record.popplerPath]) {
      assert.equal(typeof artifact, "string");
      assert.ok(!artifact.startsWith("/"), `non-portable artifact path ${artifact}`);
      assert.ok(!artifact.split("/").includes(".."), `escaping artifact path ${artifact}`);
      await stat(join(root, artifact));
    }
    if (record.status === "error") continue;
    const canvasKit = await getCanvasKit();
    const reference = pngPixels(await readFile(join(root, record.referencePath)), canvasKit);
    const actual = pngPixels(await readFile(join(root, record.popplerPath)), canvasKit);
    assert.deepEqual(compareUniformInterior(reference, actual, record.scale), record.measurement, record.fixture);
  }
  assert.equal(manifest.multiNode.pageCount, 8);
  assert.deepEqual(manifest.multiNode.authoredNodeOrder, EXTRACTION_CASES.map((_, index) => `page-${index + 1}`));
  assert.ok(manifest.cases.every((record) => record.pdfInspection?.pageCount === 1 && record.pdfInspection.width === PAGE_WIDTH && record.pdfInspection.height === PAGE_HEIGHT && record.pdfInspection.imageXObjects === false));
  assert.ok(manifest.multiNode.distinctPixelHashes > 1, "multi-node render hashes must not collapse to one repeated page");
  assert.equal(manifest.multiNode.orderedHashesMatch, true);
  return manifest;
}

async function main() {
  const argument = process.argv.indexOf("--output-dir");
  const outputDir = argument >= 0 ? process.argv[argument + 1] : resolve(dirname(fileURLToPath(import.meta.url)), "../research/luna-pdf-extraction-20260906");
  if (!outputDir) throw new Error("--output-dir requires a path");
  const result = process.argv.includes("--recompute") ? await recomputeExtractionMeasurements(outputDir) : await runExtractionMatrix(outputDir);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
