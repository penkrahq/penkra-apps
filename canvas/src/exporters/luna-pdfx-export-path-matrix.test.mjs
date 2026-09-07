import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { vectorForNode } from "../vector-path.mjs";
import { exportPdf } from "./pdf.mjs";

const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const INTER_BYTES = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));

const PDFX_OPTIONS = Object.freeze({
  profile: "PDF/X-4",
  outputIntent: PRINTER_BYTES,
  sourceColorProfile: SRGB_BYTES,
  fonts: { "Inter:400": INTER_BYTES },
});

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
  let returned;
  try {
    returned = await exportPdf(caseDefinition.ir(), options);
  } catch (error) {
    assert.equal(error.code, "CANVAS_PDF_PROFILE_UNVERIFIED", `${caseDefinition.name}: unexpected early error ${error.code}: ${error.message}`);
    assert.ok(error.preflight, `${caseDefinition.name}: missing preflight report`);
    assert.equal(error.preflight.status, "verified-canvas-writer-subset", caseDefinition.name);
    assert.deepEqual(error.preflight.issues, [], caseDefinition.name);
    assert.equal(error.preflight.canvasWriterSubset?.verified, true, caseDefinition.name);
    assert.equal(error.preflight.conformant, false, caseDefinition.name);
    assert.ok(error.preflight.uncovered.length > 0, `${caseDefinition.name}: gate coverage must remain incomplete`);
    return {
      name: caseDefinition.name,
      errorCode: error.code,
      status: error.preflight.status,
      issues: error.preflight.issues,
      conformant: error.preflight.conformant,
    };
  }
  assert.fail(`${caseDefinition.name}: exportPdf returned ${returned?.length ?? 0} bytes instead of closing the PDF/X gate`);
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
  await assert.rejects(() => exportPdf(ir, PDFX_OPTIONS), { code: "CANVAS_PDF_GLYPH_MISSING" });
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
  await assert.rejects(() => exportPdf(ir, PDFX_OPTIONS), { code: "CANVAS_PDF_FONT_MISMATCH" });
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
