import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import { vectorForNode } from "../vector-path.mjs";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const INTER_BYTES = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));

const PDFX_OPTIONS = Object.freeze({
  profile: "PDF/X-4",
  outputIntent: PRINTER_BYTES,
  sourceColorProfile: SRGB_BYTES,
});
const TEXT_OPTIONS = Object.freeze({ ...PDFX_OPTIONS, fonts: { "Inter:400": INTER_BYTES } });

function node(id, type, geometry, paint, extra = {}) {
  return { id, z: extra.z ?? 0, type, capability: extra.capability ?? { verdict: "native" }, geometry, paint, ...extra };
}

function output(id, width, height, nodes, extra = {}) {
  return {
    id,
    width,
    height,
    physical: extra.physical ?? { w: width, h: height, unit: "px" },
    ...(extra.bleed === undefined ? {} : { bleed: extra.bleed }),
    nodes,
  };
}

function singlePage(nodes, dimensions = {}) {
  return { outputs: [output("page", dimensions.width ?? 240, dimensions.height ?? 160, nodes, dimensions)] };
}

function vectorExtra(id, type, geometry, viewBox, fillRule) {
  return { vector: vectorForNode({ id, type, geometry, viewBox, fillRule }) };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, bytes) {
  const typeBytes = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBytes, Buffer.from(bytes)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

// Deterministic valid 2x2 RGBA PNG, following the existing image-matrix fixture
// construction. It is passed to the actual exportPdf rasterizer callback.
function alphaPng() {
  const rgba = Buffer.from([
    230, 60, 40, 0, 40, 150, 90, 128,
    35, 90, 180, 255, 250, 210, 50, 0,
  ]);
  const rows = Buffer.concat([Buffer.from([0]), rgba.subarray(0, 8), Buffer.from([0]), rgba.subarray(8, 16)]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const ALPHA_PNG = alphaPng();

const CASES = Object.freeze([
  {
    name: "empty-white-physical-frame",
    ir: () => singlePage([]),
  },
  {
    name: "solid-rgb-rectangle",
    ir: () => singlePage([node("solid", "rectangle", { x: 20, y: 20, w: 120, h: 80 }, { fill: "#168557" })]),
  },
  {
    name: "gray-black-rectangles",
    ir: () => singlePage([
      node("gray", "rectangle", { x: 20, y: 20, w: 90, h: 70 }, { fill: "#808080" }),
      node("black", "rectangle", { x: 130, y: 20, w: 90, h: 70 }, { fill: "#000000" }, { z: 1 }),
    ]),
  },
  {
    name: "translucent-fill",
    ir: () => singlePage([node("fill-alpha", "rectangle", { x: 20, y: 20, w: 120, h: 80 }, { fill: "#168557", opacity: 0.5 })]),
  },
  {
    name: "translucent-stroke",
    ir: () => singlePage([node("stroke-alpha", "rectangle", { x: 30, y: 25, w: 120, h: 80 }, { fill: null, stroke: { fill: "#123456", width: 4 }, opacity: 0.5 })]),
  },
  {
    name: "ellipse",
    ir: () => singlePage([node("ellipse", "ellipse", { x: 30, y: 20, w: 140, h: 90 }, { fill: "#F04C24" })]),
  },
  {
    name: "path-nonzero",
    ir: () => singlePage([node("path-nonzero", "path", { x: 30, y: 20, w: 120, h: 90 }, { fill: "#168557" },
      vectorExtra("path-nonzero", "path", "M0 0 H100 V100 H0 Z", [0, 0, 100, 100], "nonzero"))]),
  },
  {
    name: "path-evenodd-hole",
    ir: () => singlePage([node("path-evenodd", "path", { x: 30, y: 20, w: 120, h: 90 }, { fill: "#F04C24" },
      vectorExtra("path-evenodd", "path", "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z", [0, 0, 100, 100], "evenodd"))]),
  },
  {
    name: "polygon",
    ir: () => singlePage([node("polygon", "polygon", { x: 30, y: 20, w: 120, h: 90 }, { fill: "#168557" },
      vectorExtra("polygon", "polygon", "M0 100 L50 0 L100 100 Z", [0, 0, 100, 100], "nonzero"))]),
  },
  {
    name: "exact-embedded-inter-text",
    ir: () => singlePage([node("text", "text", { x: 20, y: 20, w: 200, h: 60 }, {}, {
      semantics: { content: "Identity-H Inter 123", runs: [{ from: 0, to: 19, fontFamily: "Inter", fontSize: 24 }] },
    })], { width: 240, height: 120 }),
    options: TEXT_OPTIONS,
  },
  {
    name: "alpha-png-asset",
    ir: () => singlePage([node("alpha-png", "rectangle", { x: 30, y: 20, w: 120, h: 90 }, {}, { capability: { verdict: "raster" } })]),
    options: { rasterizeNode: async () => ALPHA_PNG },
  },
  {
    name: "multipage-differing-physical-size-and-bleed",
    ir: () => ({ outputs: [
      output("small-page", 200, 140, [node("small-rect", "rectangle", { x: 20, y: 20, w: 80, h: 60 }, { fill: "#168557" })], { physical: { w: 200, h: 140, unit: "px" }, bleed: 3 }),
      output("large-page", 320, 240, [node("large-ellipse", "ellipse", { x: 30, y: 30, w: 150, h: 100 }, { fill: "#F04C24" })], { physical: { w: 320, h: 240, unit: "px" }, bleed: 9 }),
    ]}),
  },
]);

assert.equal(CASES.length, 12);

async function assertPdfxCandidate(caseDefinition) {
  const options = { ...PDFX_OPTIONS, ...(caseDefinition.options ?? {}) };
  const bytes = await exportPdf(caseDefinition.ir(), options);
  assert.ok(bytes instanceof Uint8Array, `${caseDefinition.name}: exportPdf must return Uint8Array`);
  assert.equal(Buffer.from(bytes).subarray(0, 8).toString("latin1"), "%PDF-1.6", `${caseDefinition.name}: PDF header`);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const report = await preflightPdfx4(bytes);
  assert.equal(report.status, "verified-canvas-writer-subset", caseDefinition.name);
  assert.deepEqual(report.issues, [], caseDefinition.name);
  assert.equal(report.canvasWriterSubset?.verified, true, caseDefinition.name);
  assert.equal(report.conformant, false, caseDefinition.name);
  assert.ok(report.uncovered.length > 0, `${caseDefinition.name}: gate coverage must remain incomplete`);
  assertOutputShape(caseDefinition, pdf, bytes);
  return { name: caseDefinition.name, bytes: bytes.length, pages: pdf.getPages().length, issues: report.issues, conformant: report.conformant };
}

function resolve(pdf, value) { return value instanceof PDFRef ? pdf.context.lookup(value) : value; }

function contentText(pdf, page) {
  const contents = resolve(pdf, page.node.get(PDFName.of("Contents")));
  const streams = contents instanceof PDFArray ? contents.asArray().map((value) => resolve(pdf, value)) : [contents];
  return streams.filter((stream) => stream instanceof PDFRawStream)
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"))
    .join("\n");
}

function embeddedImages(pdf) {
  return pdf.context.enumerateIndirectObjects().map(([, object]) => object)
    .filter((object) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.decodeText?.() === "Image");
}

function embeddedFontDescriptors(pdf) {
  return pdf.context.enumerateIndirectObjects().map(([, object]) => object)
    .filter((object) => object instanceof PDFDict && object.has(PDFName.of("FontFile2")));
}

function assertPageBox(page, output) {
  const physical = output.physical ?? { w: output.width, h: output.height, unit: "px" };
  const scale = physical.unit === "in" ? 72 : physical.unit === "mm" ? 72 / 25.4 : 0.75;
  const trimWidth = physical.w * scale;
  const trimHeight = physical.h * scale;
  const bleed = Number(output.bleed ?? 0);
  const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${output.id}/${label}: ${actual} != ${expected}`);
  const media = page.getMediaBox();
  const trim = page.getTrimBox();
  close(media.width, trimWidth + bleed * 2, "media width");
  close(media.height, trimHeight + bleed * 2, "media height");
  close(trim.x, bleed, "trim x");
  close(trim.y, bleed, "trim y");
  close(trim.width, trimWidth, "trim width");
  close(trim.height, trimHeight, "trim height");
  assert.deepEqual(page.getCropBox(), media, `${output.id}/crop`);
  assert.deepEqual(page.getBleedBox(), media, `${output.id}/bleed`);
}

function assertOutputShape(caseDefinition, pdf, bytes) {
  const outputs = caseDefinition.ir().outputs;
  assert.equal(pdf.getPages().length, outputs.length, `${caseDefinition.name}: page count`);
  outputs.forEach((outputDefinition, index) => assertPageBox(pdf.getPages()[index], outputDefinition));
  const pagesText = pdf.getPages().map((page) => contentText(pdf, page)).join("\n");
  const images = embeddedImages(pdf);
  const fonts = embeddedFontDescriptors(pdf);
  if (caseDefinition.name === "exact-embedded-inter-text") {
    assert.ok(fonts.length > 0, "text case has an embedded FontFile2 descriptor");
    assert.match(pagesText, /BT/u, "text case has text operators");
    assert.match(pagesText, /Tj/u, "text case has show-text operators");
  } else {
    assert.equal(fonts.length, 0, `${caseDefinition.name}: unexpected embedded font`);
  }
  if (caseDefinition.name === "alpha-png-asset") {
    assert.equal(images.length, 2, "alpha case has color and soft-mask image XObjects");
    const image = images.find((candidate) => candidate.dict.has(PDFName.of("SMask")));
    assert.ok(image, "alpha case has a parent image XObject");
    const mask = resolve(pdf, image.dict.get(PDFName.of("SMask")));
    assert.ok(mask instanceof PDFRawStream, "alpha image has an SMask image stream");
    assert.match(pagesText, /Do/u, "alpha case has image draw operator");
  } else {
    assert.equal(images.length, 0, `${caseDefinition.name}: unexpected image XObject`);
  }
  if (["path-nonzero", "polygon"].includes(caseDefinition.name)) assert.match(pagesText, /\sf\b/u, `${caseDefinition.name}: native fill path`);
  if (caseDefinition.name === "path-evenodd-hole") assert.match(pagesText, /f\*/u, "evenodd path operator");
  if (["solid-rgb-rectangle", "gray-black-rectangles", "translucent-fill", "ellipse", "multipage-differing-physical-size-and-bleed"].includes(caseDefinition.name)) {
    assert.doesNotMatch(pagesText, /\/Subtype\s*\/Image/u, `${caseDefinition.name}: native geometry must not rasterize`);
  }
  assert.ok(bytes.length > 0, `${caseDefinition.name}: nonempty serialized output`);
}

for (const caseDefinition of CASES) {
  test(`actual exportPdf PDF/X candidate ${caseDefinition.name}`, async () => {
    await assertPdfxCandidate(caseDefinition);
  });
}

test("negative control invalid glyph is rejected before PDF/X serialization", async () => {
  const ir = singlePage([node("missing-glyph", "text", { x: 20, y: 20, w: 200, h: 60 }, {}, {
    semantics: { content: "\u{10ffff}", runs: [{ from: 0, to: 2, fontFamily: "Inter", fontSize: 24 }] },
  })], { width: 240, height: 120 });
  await assert.rejects(() => exportPdf(ir, TEXT_OPTIONS), { code: "CANVAS_PDF_GLYPH_MISSING" });
});

test("negative control shaped text with a different embedded font identity is rejected", async () => {
  const ir = singlePage([node("font-identity", "text", { x: 20, y: 20, w: 200, h: 60 }, {}, {
    semantics: { content: "A", runs: [{ from: 0, to: 1, fontFamily: "Inter", fontSize: 24 }] },
    textLayout: {
      offsetY: 0,
      fontHashes: { "Inter|Regular": "not-the-embedded-font" },
      lines: [{ runs: [{ fakeBold: false, fakeItalic: false, glyphs: [36], positions: [0, 0], offsets: [0], size: 24 }] }],
    },
  })], { width: 240, height: 120 });
  await assert.rejects(() => exportPdf(ir, TEXT_OPTIONS), { code: "CANVAS_PDF_FONT_MISMATCH" });
});

test("negative control invalid physical page geometry is rejected before serialization", async () => {
  const ir = singlePage([node("rect", "rectangle", { x: 0, y: 0, w: 20, h: 20 }, { fill: "#168557" })], {
    width: 200,
    height: 100,
    physical: { w: 0, h: 100, unit: "px" },
  });
  await assert.rejects(() => exportPdf(ir, PDFX_OPTIONS), {
    code: "CANVAS_PDF_PROFILE_INVALID",
    message: "PDF page page must have finite positive dimensions.",
  });
});
