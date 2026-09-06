import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName } from "pdf-lib";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { compareUniformInterior } from "../scripts/luna-pdf-extraction-matrix.mjs";

const PAGE_WIDTH = 300;
const PAGE_HEIGHT = 220;
const PATHS = [
  "nodes.path",
  "properties.geometry",
  "properties.viewBox",
  "properties.fillRule",
];
const BACKGROUND = [0xE8, 0xEE, 0xF4, 0xFF];

const CASES = Object.freeze([
  ["open-L-V-chain", "M0 0L100 50L0 100"],
  ["disconnected-two-subpaths", "M0 15L100 15M0 85L100 85"],
  ["cubic-to-line-join", "M0 50C0 0 100 0 100 50L0 100"],
  ["closed-ring-control", "M0 0H100V100H0Z M25 25H75V75H25Z"],
]);

function makeDocument(geometry, fillRule) {
  return {
    version: "2.17",
    module: "generic",
    axes: {},
    variables: {},
    paragraphStyles: {},
    imports: {},
    flows: [],
    children: [{
      id: "page",
      type: "frame",
      layout: "none",
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      fill: "#E8EEF4",
      children: [{
        id: "stroke-case",
        type: "path",
        x: 40,
        y: 30,
        width: 220,
        height: 160,
        geometry,
        viewBox: [0, 0, 100, 100],
        ...(fillRule ? { fillRule, fill: "#F04C24" } : {}),
        stroke: { fill: "#123456", thickness: 8 },
      }],
    }],
  };
}

function decodePng(bytes, canvasKit) {
  const image = canvasKit.MakeImageFromEncoded(bytes);
  assert.ok(image, "CanvasKit decoded the PNG");
  try {
    const width = image.width();
    const height = image.height();
    const pixels = image.readPixels(0, 0, {
      width,
      height,
      colorType: canvasKit.ColorType.RGBA_8888,
      alphaType: canvasKit.AlphaType.Unpremul,
      colorSpace: canvasKit.ColorSpace.SRGB,
    });
    assert.ok(pixels, "CanvasKit read PNG pixels");
    return { width, height, pixels: Buffer.from(pixels) };
  } finally {
    image.delete();
  }
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.pixels.subarray(offset, offset + 4));
}

function pixelHash(image) {
  return createHash("sha256").update(image.pixels).digest("hex");
}

async function renderCase(name, geometry, directory, canvasKit, fillRule) {
  const document = makeDocument(geometry, fillRule);
  const ir = buildCapabilityVerificationIR(document, { format: "pdf", nodeId: "page" }, PATHS);
  assert.equal(ir.rasters.length, 0, `${name}: native PDF vectors are required`);
  const pdfBytes = await exportPdf(ir);
  const parsed = await PDFDocument.load(pdfBytes);
  assert.equal(parsed.getPageCount(), 1, `${name}: one PDF page`);
  assert.equal(parsed.getPages()[0].getWidth(), PAGE_WIDTH, `${name}: page width`);
  assert.equal(parsed.getPages()[0].getHeight(), PAGE_HEIGHT, `${name}: page height`);
  assert.equal(
    parsed.context.enumerateIndirectObjects().some(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image"),
    false,
    `${name}: no Image XObjects`
  );

  const pdfPath = join(directory, `${name}.pdf`);
  const popplerPath = join(directory, `${name}-poppler`);
  await writeFile(pdfPath, pdfBytes);
  const render = spawnSync("pdftoppm", ["-r", "72", "-singlefile", "-png", pdfPath, popplerPath], { encoding: "utf8" });
  assert.equal(render.status, 0, render.stderr);
  const [canvasCapture] = await takeDocumentScreenshots(document, [{ nodeIds: ["page"] }], new Map(), { scale: 1 });
  const canvasBytes = Buffer.from(canvasCapture.data, "base64");
  const canvasPath = join(directory, `${name}-canvas.png`);
  const actualPath = `${popplerPath}.png`;
  await writeFile(canvasPath, canvasBytes);
  const reference = decodePng(canvasBytes, canvasKit);
  const actual = decodePng(await readFile(actualPath), canvasKit);
  assert.deepEqual([reference.width, reference.height], [PAGE_WIDTH, PAGE_HEIGHT], `${name}: Canvas dimensions`);
  assert.deepEqual([actual.width, actual.height], [PAGE_WIDTH, PAGE_HEIGHT], `${name}: Poppler dimensions`);
  const measurement = compareUniformInterior(reference, actual, 1);
  assert.equal(measurement.boundaryRasterPixels, 2, `${name}: fixed raster boundary`);
  assert.equal(measurement.channelTolerance, 2, `${name}: fixed channel tolerance`);
  assert.equal(measurement.mismatchPixels, 0, `${name}: Canvas/PDF interior pixels`);
  assert.equal(measurement.mismatchChannels, 0, `${name}: Canvas/PDF interior channels`);

  if (name === "disconnected-two-subpaths") {
    assert.deepEqual(pixelAt(reference, 150, 110), BACKGROUND, `${name}: no accidental connection at the midpoint`);
    assert.deepEqual(pixelAt(actual, 150, 110), BACKGROUND, `${name}: PDF has no accidental connection at the midpoint`);
  }

  const evidenceDirectory = process.env.CANVAS_OPEN_PATH_JOIN_EVIDENCE_DIR;
  if (evidenceDirectory) {
    const caseDirectory = join(evidenceDirectory, name);
    await mkdir(caseDirectory, { recursive: true });
    await writeFile(join(caseDirectory, "source.pdf"), pdfBytes);
    await writeFile(join(caseDirectory, "canvas.png"), canvasBytes);
    await writeFile(join(caseDirectory, "poppler.png"), await readFile(actualPath));
    await writeFile(join(caseDirectory, "measurement.json"), `${JSON.stringify({
      name,
      geometry,
      page: { width: PAGE_WIDTH, height: PAGE_HEIGHT, dpi: 72 },
      imageXObjects: false,
      measurement,
    }, null, 2)}\n`);
  }

  return { document, reference, actual, measurement, canvasBytes, canvasPath, pdfPath };
}

test("open L/V chain preserves a connected centerline join in Canvas and PDF", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-open-path-join-"));
  try {
    const canvasKit = await getCanvasKit();
    await renderCase(CASES[0][0], CASES[0][1], directory, canvasKit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("disconnected two-subpath stroke does not acquire a connection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-open-path-join-"));
  try {
    const canvasKit = await getCanvasKit();
    await renderCase(CASES[1][0], CASES[1][1], directory, canvasKit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cubic-to-line join preserves the single open chain", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-open-path-join-"));
  try {
    const canvasKit = await getCanvasKit();
    await renderCase(CASES[2][0], CASES[2][1], directory, canvasKit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("closed ring remains on the existing closed-vector stroke path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-open-path-join-"));
  try {
    const canvasKit = await getCanvasKit();
    await renderCase(CASES[3][0], CASES[3][1], directory, canvasKit, "evenodd");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repeated cached-path rendering is byte-stable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-open-path-join-"));
  try {
    const document = makeDocument(CASES[0][1]);
    const first = await takeDocumentScreenshots(document, [{ nodeIds: ["page"] }], new Map(), { scale: 1 });
    const second = await takeDocumentScreenshots(document, [{ nodeIds: ["page"] }], new Map(), { scale: 1 });
    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    const firstBytes = Buffer.from(first[0].data, "base64");
    const secondBytes = Buffer.from(second[0].data, "base64");
    assert.equal(firstBytes.equals(secondBytes), true);
    assert.equal(pixelHash(decodePng(firstBytes, await getCanvasKit())), pixelHash(decodePng(secondBytes, await getCanvasKit())));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
