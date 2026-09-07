import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib";
import test from "node:test";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-image-matrix-20260907/", import.meta.url);
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_IMAGE_MATRIX_RETAIN_EVIDENCE === "1";
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SERIALIZATION_VARIANTS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const RETAINED_CASES = new Set([
  "valid-rgb-baseline",
  "transparent-baseline",
  "invalid-dimensions-width-zero",
  "bits-missing",
  "array-colorspace-empty",
  "truncated-image-stream",
]);
const RESULTS = [];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const imageCodes = (report) => report.issues.filter(({ code }) => code.startsWith("IMAGE_")).map(({ code }) => code);
const issueSummary = (report) => report.issues.map(({ code, object }) => ({ code, object }));
const issueCodes = (report) => report.issues.map(({ code }) => code);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, bytes) {
  const typeBytes = new TextEncoder().encode(type);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length);
  const body = new Uint8Array(typeBytes.length + bytes.length);
  body.set(typeBytes);
  body.set(bytes, typeBytes.length);
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, crc32(body));
  return new Uint8Array([...length, ...body, ...checksum]);
}

function makePng(rgba, colorType) {
  const channels = colorType === 6 ? 4 : 3;
  const rows = [];
  for (let y = 0; y < 2; y += 1) rows.push(0, ...rgba.slice(y * 2 * 4, (y + 1) * 2 * 4).flatMap((pixel, index) => index % 4 < channels ? pixel : []));
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 2);
  view.setUint32(4, 2);
  header[8] = 8;
  header[9] = colorType;
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = [signature, pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Uint8Array.from(rows))), pngChunk("IEND", new Uint8Array())];
  return Uint8Array.from(png.flatMap((part) => [...part]));
}

const OPAQUE_PNG = makePng([
  230, 60, 40, 255, 40, 150, 90, 255,
  35, 90, 180, 255, 250, 210, 50, 255,
], 2);
const TRANSPARENT_PNG = makePng([
  230, 60, 40, 0, 40, 150, 90, 128,
  35, 90, 180, 255, 250, 210, 50, 0,
], 6);

function imageIR() {
  return {
    outputs: [{
      id: "image-page",
      width: 240,
      height: 160,
      physical: { w: 240, h: 160, unit: "px" },
      nodes: [
        { id: "opaque-image", z: 0, type: "rectangle", capability: { verdict: "raster" }, geometry: { x: 20, y: 20, w: 80, h: 80 }, paint: {} },
        { id: "transparent-image", z: 1, type: "rectangle", capability: { verdict: "raster" }, geometry: { x: 120, y: 20, w: 80, h: 80 }, paint: {} },
      ],
    }],
  };
}

const RAW_BASELINE_BYTES = await exportPdf(imageIR(), {
  title: "Canvas image matrix",
  outputIntent: SRGB_BYTES,
  rasterizeNode: async (id) => id === "opaque-image" ? OPAQUE_PNG : TRANSPARENT_PNG,
});
const baselineDocument = await PDFDocument.load(RAW_BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
const baselineInfo = baselineDocument.context.lookup(baselineDocument.context.trailerInfo.Info);
baselineInfo.set(PDFName.of("CreationDate"), PDFString.of("D:20000101000000Z"));
baselineInfo.set(PDFName.of("ModDate"), PDFString.of("D:20000101000000Z"));
const BASELINE_BYTES = await baselineDocument.save({ useObjectStreams: false });

function resolve(pdf, value) {
  return value instanceof PDFRef ? pdf.context.lookup(value) : value;
}

function dictGet(pdf, dict, key) {
  return dict instanceof PDFDict ? resolve(pdf, dict.get(PDFName.of(key))) : undefined;
}

function imageEntries(pdf) {
  const page = pdf.getPages()[0];
  const resources = resolve(pdf, page.node.Resources());
  const xObjects = dictGet(pdf, resources, "XObject");
  assert.ok(xObjects instanceof PDFDict, "configured writer baseline has XObject resources");
  const entries = [...xObjects.entries()].map(([name, raw]) => ({
    resourceName: name.decodeText(),
    raw,
    object: resolve(pdf, raw),
  })).filter(({ object }) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.decodeText?.() === "Image");
  assert.equal(entries.length, 2, "writer baseline contains opaque and transparent image XObjects");
  return entries;
}

function imageFixture(pdf) {
  const entries = imageEntries(pdf);
  const opaque = entries.find(({ object }) => !object.dict.has(PDFName.of("SMask")));
  const transparent = entries.find(({ object }) => object.dict.has(PDFName.of("SMask")));
  assert.ok(opaque && transparent, "writer baseline distinguishes opaque and alpha image resources");
  return { opaque, transparent };
}

function set(pdf, image, key, value) {
  image.dict.set(PDFName.of(key), value);
}

const number = (value) => PDFNumber.of(value);
const name = (value) => PDFName.of(value);

const CASES = [
  { name: "valid-rgb-baseline", classification: "fixed", mutate: () => {}, expectedCodes: [] },
  { name: "transparent-baseline", classification: "fixed", mutate: () => {}, expectedCodes: [] },
  { name: "width-missing", classification: "fixed", mutate: ({ image }) => image.dict.delete(PDFName.of("Width")), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "invalid-dimensions-width-zero", classification: "fixed", mutate: ({ image }) => set(null, image, "Width", number(0)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "width-negative", classification: "fixed", mutate: ({ image }) => set(null, image, "Width", number(-1)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "width-fraction", classification: "fixed", mutate: ({ image }) => set(null, image, "Width", number(1.5)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "width-string", classification: "fixed", mutate: ({ image }) => set(null, image, "Width", PDFString.of("2")), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "height-missing", classification: "fixed", mutate: ({ image }) => image.dict.delete(PDFName.of("Height")), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "height-zero", classification: "fixed", mutate: ({ image }) => set(null, image, "Height", number(0)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "height-negative", classification: "fixed", mutate: ({ image }) => set(null, image, "Height", number(-1)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "height-fraction", classification: "fixed", mutate: ({ image }) => set(null, image, "Height", number(1.5)), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "height-string", classification: "fixed", mutate: ({ image }) => set(null, image, "Height", PDFString.of("2")), expectedCodes: ["IMAGE_DIMENSION_INVALID"] },
  { name: "bits-missing", classification: "coordinator-review", mutate: ({ image }) => image.dict.delete(PDFName.of("BitsPerComponent")), expectedCodes: [] },
  { name: "bits-zero", classification: "fixed", mutate: ({ image }) => set(null, image, "BitsPerComponent", number(0)), expectedCodes: ["IMAGE_BITS_INVALID"] },
  { name: "bits-three", classification: "fixed", mutate: ({ image }) => set(null, image, "BitsPerComponent", number(3)), expectedCodes: ["IMAGE_BITS_INVALID"] },
  { name: "bits-eight", classification: "fixed", mutate: ({ image }) => set(null, image, "BitsPerComponent", number(8)), expectedCodes: [] },
  { name: "bits-sixteen", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "BitsPerComponent", number(16)), expectedCodes: [] },
  { name: "bits-string", classification: "fixed", mutate: ({ image }) => set(null, image, "BitsPerComponent", PDFString.of("8")), expectedCodes: ["IMAGE_BITS_INVALID"] },
  { name: "colorspace-missing", classification: "coordinator-review", mutate: ({ image }) => image.dict.delete(PDFName.of("ColorSpace")), expectedCodes: [] },
  { name: "colorspace-device-rgb", classification: "fixed", mutate: ({ image }) => set(null, image, "ColorSpace", name("DeviceRGB")), expectedCodes: [] },
  { name: "colorspace-device-gray", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "ColorSpace", name("DeviceGray")), expectedCodes: [] },
  { name: "colorspace-device-cmyk", classification: "fixed", mutate: ({ image }) => set(null, image, "ColorSpace", name("DeviceCMYK")), expectedCodes: ["IMAGE_COLOR_SPACE_OUTSIDE_SUBSET"] },
  { name: "colorspace-name-unknown", classification: "fixed", mutate: ({ image }) => set(null, image, "ColorSpace", name("UnknownColor")), expectedCodes: ["IMAGE_COLOR_SPACE_OUTSIDE_SUBSET"] },
  { name: "colorspace-number", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "ColorSpace", number(3)), expectedCodes: [] },
  { name: "array-colorspace-empty", classification: "coordinator-review", mutate: ({ pdf, image }) => set(null, image, "ColorSpace", pdf.context.obj([])), expectedCodes: [] },
  { name: "colorspace-iccbased-correct-srgb", classification: "coordinator-review", mutate: ({ pdf, image }) => {
    const profile = pdf.context.register(pdf.context.flateStream(SRGB_BYTES, { N: number(3) }));
    set(null, image, "ColorSpace", pdf.context.obj([name("ICCBased"), profile]));
  }, expectedCodes: [] },
  { name: "imagemask-absent", classification: "coordinator-review", mutate: ({ image }) => image.dict.delete(PDFName.of("ImageMask")), expectedCodes: [] },
  { name: "imagemask-false", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "ImageMask", PDFBool.False), expectedCodes: [] },
  { name: "imagemask-true-with-rgb", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "ImageMask", PDFBool.True), expectedCodes: [] },
  { name: "smask-absent", classification: "coordinator-review", mutate: ({ image }) => image.dict.delete(PDFName.of("SMask")), expectedCodes: [] },
  { name: "smask-none", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "SMask", name("None")), expectedCodes: [] },
  { name: "smask-dangling-reference", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "SMask", PDFRef.of(999999, 0)), expectedCodes: [] },
  { name: "smask-nonstream-dictionary", classification: "coordinator-review", mutate: ({ pdf, image }) => set(null, image, "SMask", pdf.context.obj({ Type: name("NotMask") })), expectedCodes: [] },
  { name: "smask-valid-actual-alpha", classification: "coordinator-review", mutate: ({ image, transparent }) => set(null, image, "SMask", transparent.object.dict.get(PDFName.of("SMask"))), expectedCodes: [] },
  { name: "filter-absent", classification: "coordinator-review", mutate: ({ image }) => image.dict.delete(PDFName.of("Filter")), expectedCodes: [] },
  { name: "filter-flate-decode", classification: "coordinator-review", mutate: ({ image }) => set(null, image, "Filter", name("FlateDecode")), expectedCodes: [] },
  { name: "filter-unknown-name", classification: "fixed", mutate: ({ image }) => set(null, image, "Filter", name("UnknownDecode")), expectedCodes: ["STREAM_FILTER_FORBIDDEN"] },
  { name: "truncated-image-stream", classification: "coordinator-review", mutate: ({ image }) => {
    const decoded = decodePDFRawStream(image).decode();
    image.contents = deflateSync(decoded.subarray(0, 1));
  }, expectedCodes: [] },
];

assert.equal(CASES.length, 38);
assert.ok(CASES.every(({ name: caseName }) => caseName && !caseName.includes(" ")));
if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

async function serializeCase(caseDefinition, variant) {
  const pdf = await PDFDocument.load(BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
  const { opaque, transparent } = imageFixture(pdf);
  caseDefinition.mutate({ pdf, image: opaque.object, transparent });
  const bytes = await pdf.save({ useObjectStreams: variant.useObjectStreams });
  const beforeHash = sha256(bytes);
  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  const afterHash = sha256(bytes);
  assert.equal(afterHash, beforeHash, `${caseDefinition.name}/${variant.name} input bytes mutated by inspection`);
  assert.deepEqual(issueSummary(first), issueSummary(second), `${caseDefinition.name}/${variant.name} inspection is not deterministic`);
  assert.equal(first.conformant, false, `${caseDefinition.name}/${variant.name} cannot promote aggregate conformance`);
  assert.equal(first.status, first.issues.length ? "invalid" : "verified-canvas-writer-subset");
  assert.equal(imageEntries(reloaded).length, 2, `${caseDefinition.name}/${variant.name} retains both image XObjects after reload`);
  const record = {
    name: caseDefinition.name,
    serialization: variant.name,
    classification: caseDefinition.classification,
    sha256: beforeHash,
    bytes: bytes.length,
    issueCodes: issueCodes(first),
    issues: issueSummary(first),
    imageIssueCodes: imageCodes(first),
    expectedCodes: caseDefinition.expectedCodes,
  };
  for (const expected of caseDefinition.expectedCodes) assert.ok(record.issueCodes.includes(expected), `${caseDefinition.name}/${variant.name} missing ${expected}`);
  if (RETAIN_EVIDENCE && RETAINED_CASES.has(caseDefinition.name)) {
    await writeFile(new URL(`${caseDefinition.name}-${variant.name}.pdf`, EVIDENCE_DIRECTORY), bytes);
  }
  return { bytes, record };
}

for (const caseDefinition of CASES) {
  for (const variant of SERIALIZATION_VARIANTS) {
    test(`serialized image matrix ${caseDefinition.name} ${variant.name}`, async () => {
      const result = await serializeCase(caseDefinition, variant);
      RESULTS.push(result.record);
    });
  }
}

test("configured image baseline reports ordinary/helper/subset findings without conformance", async () => {
  const report = await preflightPdfx4(BASELINE_BYTES);
  assert.equal(report.conformant, false);
  assert.ok(Array.isArray(report.uncovered) && report.uncovered.length > 0);
  assert.ok(imageEntries(await PDFDocument.load(BASELINE_BYTES, { updateMetadata: false })).length === 2);
});

test("fully configured PDF/X image export keeps the closed gate and returns no artifact", async () => {
  await assert.rejects(
    () => exportPdf(imageIR(), {
      title: "Canvas configured image matrix",
      profile: "PDF/X-4",
      outputIntent: PRINTER_BYTES,
      sourceColorProfile: SRGB_BYTES,
      rasterizeNode: async (id) => id === "opaque-image" ? OPAQUE_PNG : TRANSPARENT_PNG,
    }),
    (error) => {
      assert.ok(["CANVAS_PDF_PROFILE_UNVERIFIED", "CANVAS_PDF_PROFILE_INVALID"].includes(error.code));
      assert.ok(error.preflight);
      assert.equal(error.preflight.conformant, false);
      assert.ok(Array.isArray(error.preflight.issues));
      assert.ok(Array.isArray(error.preflight.uncovered));
      return true;
    },
  );
});

test("successive image PDFs do not leak checker state", async () => {
  const valid = await serializeCase(CASES[0], SERIALIZATION_VARIANTS[0]);
  const invalid = await serializeCase(CASES.find(({ name }) => name === "invalid-dimensions-width-zero"), SERIALIZATION_VARIANTS[0]);
  assert.ok(invalid.record.issueCodes.includes("IMAGE_DIMENSION_INVALID"));
  const after = await preflightPdfx4(valid.bytes);
  assert.deepEqual(issueSummary(after), issueSummary(await preflightPdfx4(valid.bytes)));
  assert.deepEqual(issueCodes(after), valid.record.issueCodes);
});

async function evidenceSnapshot() {
  const files = (await readdir(EVIDENCE_DIRECTORY)).sort();
  return Promise.all(files.map(async (file) => {
    const info = await stat(new URL(file, EVIDENCE_DIRECTORY));
    return { file, bytes: info.size, mtimeMs: info.mtimeMs };
  }));
}

async function writeEvidence() {
  const retainedArtifacts = [];
  for (const caseDefinition of CASES.filter(({ name }) => RETAINED_CASES.has(name))) {
    for (const variant of SERIALIZATION_VARIANTS) {
      const result = RESULTS.find(({ name, serialization }) => name === caseDefinition.name && serialization === variant.name);
      const file = `${caseDefinition.name}-${variant.name}.pdf`;
      retainedArtifacts.push({ file, caseName: caseDefinition.name, serialization: variant.name, sha256: result.sha256, bytes: result.bytes });
    }
  }
  await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), JSON.stringify({
    caseCount: CASES.length,
    serializationVariantCount: SERIALIZATION_VARIANTS.length,
    executedResultCount: RESULTS.length,
    cases: RESULTS,
  }, null, 2));
  await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), JSON.stringify({
    caseCount: CASES.length,
    serializationVariantCount: SERIALIZATION_VARIANTS.length,
    generatedCaseCount: RESULTS.length,
    generatedCases: RESULTS.map(({ name, serialization, sha256: hash, bytes }) => ({ name, serialization, sha256: hash, bytes })),
    retainedArtifactCount: retainedArtifacts.length,
    retainedArtifacts,
  }, null, 2));
}

test("image matrix has every named serialized identity and gated evidence", async () => {
  assert.equal(RESULTS.length, CASES.length * SERIALIZATION_VARIANTS.length);
  assert.equal(new Set(RESULTS.map(({ name, serialization }) => `${name}/${serialization}`)).size, RESULTS.length);
  if (RETAIN_EVIDENCE) {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await writeEvidence();
  }
});

async function verifyRetainedEvidence() {
  const caseResults = JSON.parse(await readFile(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(caseResults.caseCount, CASES.length);
  assert.equal(caseResults.serializationVariantCount, SERIALIZATION_VARIANTS.length);
  assert.equal(caseResults.executedResultCount, CASES.length * SERIALIZATION_VARIANTS.length);
  assert.equal(manifest.generatedCaseCount, CASES.length * SERIALIZATION_VARIANTS.length);
  assert.equal(manifest.retainedArtifactCount, RETAINED_CASES.size * SERIALIZATION_VARIANTS.length);
  const currentByIdentity = new Map(RESULTS.map((record) => [`${record.name}/${record.serialization}`, record]));
  for (const record of caseResults.cases) {
    const current = currentByIdentity.get(`${record.name}/${record.serialization}`);
    assert.ok(current, `missing current result for ${record.name}/${record.serialization}`);
    assert.deepEqual(current.issueCodes, record.issueCodes);
    assert.deepEqual(current.issues, record.issues);
    assert.equal(current.sha256, record.sha256);
  }
  for (const artifact of manifest.retainedArtifacts) {
    const bytes = new Uint8Array(await readFile(new URL(artifact.file, EVIDENCE_DIRECTORY)));
    assert.equal(bytes.length, artifact.bytes, artifact.file);
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
    const report = await preflightPdfx4(bytes);
    const recorded = caseResults.cases.find(({ name, serialization }) => `${name}-${serialization}.pdf` === artifact.file);
    assert.deepEqual(issueSummary(report), recorded.issues, artifact.file);
    imageFixture(await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }));
  }
}

if (!RETAIN_EVIDENCE) {
  test("default image matrix reads retained evidence without writing it", async () => {
    const before = await evidenceSnapshot();
    await verifyRetainedEvidence();
    const after = await evidenceSnapshot();
    assert.deepEqual(after, before);
  });
}
