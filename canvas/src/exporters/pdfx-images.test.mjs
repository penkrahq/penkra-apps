import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib";
import test from "node:test";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const EVIDENCE_DIRECTORY = new URL("../../research/pdfx-image-correction-20260907/", import.meta.url);
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_IMAGE_CORRECTION_RETAIN_EVIDENCE === "1";
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const JPEG_BYTES = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AYf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IYf/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64"));
const SERIALIZATION_VARIANTS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const RETAINED_CASES = new Set([
  "valid-writer-baseline",
  "valid-jpeg-image",
  "missing-bits-per-component",
  "array-colorspace-outside-subset",
  "softmask-cycle-self",
  "truncated-flate-data",
]);
const RESULTS = [];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const imageIssues = (report) => report.issues.filter(({ code }) => code.startsWith("IMAGE_"));
const imageCodes = (report) => imageIssues(report).map(({ code }) => code);
const issueSummary = (report) => report.issues.map(({ code, object }) => ({ code, object }));

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
  for (let y = 0; y < 2; y += 1) rows.push(0, ...rgba.slice(y * 8, (y + 1) * 8).flatMap((channel, index) => index % 4 < channels ? channel : []));
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 2); view.setUint32(4, 2); header[8] = 8; header[9] = colorType;
  const chunks = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Uint8Array.from(rows))),
    pngChunk("IEND", new Uint8Array()),
  ];
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
}

const OPAQUE_PNG = makePng([230, 60, 40, 255, 40, 150, 90, 255, 35, 90, 180, 255, 250, 210, 50, 255], 2);
const ALPHA_PNG = makePng([230, 60, 40, 0, 40, 150, 90, 128, 35, 90, 180, 255, 250, 210, 50, 0], 6);

function writerIR() {
  return { outputs: [{ id: "image-page", width: 240, height: 160, physical: { w: 240, h: 160, unit: "px" }, nodes: [
    { id: "opaque", z: 0, type: "rectangle", capability: { verdict: "raster" }, geometry: { x: 10, y: 10, w: 80, h: 80 }, paint: {} },
    { id: "alpha", z: 1, type: "rectangle", capability: { verdict: "raster" }, geometry: { x: 110, y: 10, w: 80, h: 80 }, paint: {} },
  ] }] };
}

async function canonicalWriterPdf() {
  const raw = await exportPdf(writerIR(), {
    title: "PDF/X image correction baseline",
    outputIntent: SRGB_BYTES,
    rasterizeNode: async (id) => id === "opaque" ? OPAQUE_PNG : ALPHA_PNG,
  });
  const pdf = await PDFDocument.load(raw, { updateMetadata: false, throwOnInvalidObject: true });
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  info.set(PDFName.of("CreationDate"), PDFString.of("D:20000101000000Z"));
  info.set(PDFName.of("ModDate"), PDFString.of("D:20000101000000Z"));
  return pdf.save({ useObjectStreams: false });
}

const PNG_BASELINE_BYTES = await canonicalWriterPdf();

async function jpegPdf() {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(JPEG_BYTES);
  const page = pdf.addPage([40, 40]);
  page.drawImage(image, { x: 0, y: 0, width: 20, height: 20 });
  return pdf.save({ useObjectStreams: false });
}

const JPEG_BASELINE_BYTES = await jpegPdf();

function resolve(pdf, value) {
  return value instanceof PDFRef ? pdf.context.lookup(value) : value;
}

function images(pdf) {
  const page = pdf.getPages()[0];
  const resources = resolve(pdf, page.node.Resources());
  const xObjects = resources instanceof PDFDict ? resolve(pdf, resources.get(PDFName.of("XObject"))) : undefined;
  assert.ok(xObjects instanceof PDFDict, "fixture has XObject resources");
  return [...xObjects.entries()].map(([key, raw]) => ({ name: key.decodeText(), raw, object: resolve(pdf, raw) }))
    .filter(({ object }) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.decodeText?.() === "Image");
}

function fixtureImages(pdf) {
  const entries = images(pdf);
  const opaque = entries.find(({ object }) => !object.dict.has(PDFName.of("SMask")));
  const alpha = entries.find(({ object }) => object.dict.has(PDFName.of("SMask")));
  assert.ok(opaque && alpha, "writer fixture has opaque and alpha images");
  return { opaque, alpha };
}

const n = (value) => PDFNumber.of(value);
const name = (value) => PDFName.of(value);
const set = (dict, key, value) => dict.set(PDFName.of(key), value);
const del = (dict, key) => dict.delete(PDFName.of(key));

function grayMask(pdf, width = 1, height = 1, contents = [128]) {
  return pdf.context.register(pdf.context.flateStream(Uint8Array.from(contents), {
    Type: name("XObject"), Subtype: name("Image"), Width: n(width), Height: n(height), ColorSpace: name("DeviceGray"), BitsPerComponent: n(8),
  }));
}

const CASES = [
  { name: "valid-writer-baseline", base: "png", mutate: () => {}, expected: [] },
  { name: "valid-alpha-writer-baseline", base: "png", mutate: () => {}, expected: [] },
  { name: "valid-jpeg-image", base: "jpeg", mutate: () => {}, expected: [] },
  { name: "raw-valid-image", base: "png", mutate: ({ image }) => { const data = decodePDFRawStream(image).decode(); del(image.dict, "Filter"); image.contents = data; }, expected: [] },
  { name: "missing-bits-per-component", base: "png", mutate: ({ image }) => del(image.dict, "BitsPerComponent"), expected: ["IMAGE_BITS_INVALID"] },
  { name: "unsupported-bits-per-component", base: "png", mutate: ({ image }) => set(image.dict, "BitsPerComponent", n(3)), expected: ["IMAGE_BITS_INVALID"] },
  { name: "missing-color-space", base: "png", mutate: ({ image }) => del(image.dict, "ColorSpace"), expected: ["IMAGE_COLOR_SPACE_INVALID"] },
  { name: "malformed-color-space-number", base: "png", mutate: ({ image }) => set(image.dict, "ColorSpace", n(3)), expected: ["IMAGE_COLOR_SPACE_INVALID"] },
  { name: "array-colorspace-outside-subset", base: "png", mutate: ({ pdf, image }) => set(image.dict, "ColorSpace", pdf.context.obj([name("ICCBased"), grayMask(pdf)])), expected: ["IMAGE_COLOR_SPACE_OUTSIDE_SUBSET"] },
  { name: "named-colorspace-outside-subset", base: "png", mutate: ({ image }) => set(image.dict, "ColorSpace", name("DeviceCMYK")), expected: ["IMAGE_COLOR_SPACE_OUTSIDE_SUBSET"] },
  { name: "imagemask-true-outside-subset", base: "png", mutate: ({ image }) => set(image.dict, "ImageMask", PDFBool.True), expected: ["IMAGE_MASK_OUTSIDE_SUBSET"] },
  { name: "imagemask-nonboolean-invalid", base: "png", mutate: ({ image }) => set(image.dict, "ImageMask", name("True")), expected: ["IMAGE_MASK_INVALID"] },
  { name: "missing-softmask-invalid", base: "png", mutate: ({ image }) => set(image.dict, "SMask", name("None")), expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "dangling-softmask-invalid", base: "png", mutate: ({ image }) => set(image.dict, "SMask", PDFRef.of(888888, 0)), expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "nonstream-softmask-invalid", base: "png", mutate: ({ pdf, image }) => set(image.dict, "SMask", pdf.context.obj({ Subtype: name("Image") })), expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "wrong-subtype-softmask-invalid", base: "png", mutate: ({ pdf, image }) => set(image.dict, "SMask", pdf.context.register(pdf.context.stream(Uint8Array.of(128), { Type: name("XObject"), Subtype: name("Form") }))), expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "softmask-non-gray-invalid", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "ColorSpace", name("DeviceRGB")); }, expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "softmask-invalid-bits", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "BitsPerComponent", n(3)); }, expected: ["IMAGE_SOFT_MASK_INVALID", "IMAGE_BITS_INVALID"] },
  { name: "softmask-invalid-dimensions", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "Width", n(0)); }, expected: ["IMAGE_SOFT_MASK_INVALID", "IMAGE_DIMENSION_INVALID"] },
  { name: "softmask-nested-mask-invalid", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "Mask", name("None")); }, expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "softmask-nested-smask-invalid", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "SMask", name("None")); }, expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "softmask-matte-outside-subset", base: "png", mutate: ({ pdf, image, alpha }) => { const mask = resolveMask(pdf, image, alpha); set(mask.dict, "Matte", pdf.context.obj([n(0)])); }, expected: ["IMAGE_MATTE_OUTSIDE_SUBSET"] },
  { name: "softmask-independent-dimensions", base: "png", mutate: ({ image, pdf }) => set(image.dict, "SMask", grayMask(pdf, 1, 1, [255])), expected: [] },
  { name: "shared-softmask-reuse", base: "png", mutate: ({ image, alpha }) => set(image.dict, "SMask", alpha.object.dict.get(PDFName.of("SMask"))), expected: [] },
  { name: "softmask-cycle-self", base: "png", mutate: ({ image, pdf }) => { const mask = grayMask(pdf); const maskObject = resolve(pdf, mask); set(maskObject.dict, "SMask", mask); set(image.dict, "SMask", mask); }, expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "softmask-cycle-two-node", base: "png", mutate: ({ image, pdf }) => { const first = grayMask(pdf); const second = grayMask(pdf); set(resolve(pdf, first).dict, "SMask", second); set(resolve(pdf, second).dict, "SMask", first); set(image.dict, "SMask", first); }, expected: ["IMAGE_SOFT_MASK_INVALID"] },
  { name: "unknown-image-filter", base: "png", mutate: ({ image }) => set(image.dict, "Filter", name("UnknownDecode")), expected: ["IMAGE_FILTER_OUTSIDE_SUBSET"] },
  { name: "decode-parameters-outside-subset", base: "png", mutate: ({ image, pdf }) => set(image.dict, "DecodeParms", pdf.context.obj({ Predictor: n(1) })), expected: ["IMAGE_DECODE_PARAMS_OUTSIDE_SUBSET"] },
  { name: "truncated-raw-data", base: "png", mutate: ({ image }) => { const data = decodePDFRawStream(image).decode(); del(image.dict, "Filter"); image.contents = data.subarray(0, 1); }, expected: ["IMAGE_DATA_LENGTH_INVALID"] },
  { name: "truncated-flate-data", base: "png", mutate: ({ image }) => { const data = decodePDFRawStream(image).decode(); image.contents = deflateSync(data.subarray(0, 1)); }, expected: ["IMAGE_DATA_LENGTH_INVALID"] },
  { name: "malformed-flate-data", base: "png", mutate: ({ image }) => { image.contents = Uint8Array.of(0); }, expected: ["IMAGE_DATA_INVALID"] },
  { name: "unsafe-declared-dimensions", base: "png", mutate: ({ image }) => set(image.dict, "Width", n(1000000000000)), expected: ["IMAGE_DIMENSION_INVALID"] },
];

function resolveMask(pdf, image, alpha) {
  const rawMask = image.dict.get(PDFName.of("SMask")) ?? alpha.object.dict.get(PDFName.of("SMask"));
  return resolve(pdf, rawMask);
}

assert.ok(CASES.length >= 25);
if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

async function prepare(caseDefinition) {
  const source = caseDefinition.base === "jpeg" ? JPEG_BASELINE_BYTES : PNG_BASELINE_BYTES;
  const pdf = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  const fixture = caseDefinition.base === "jpeg" ? { image: images(pdf)[0], alpha: null } : fixtureImages(pdf);
  const target = fixture.image ?? fixture.opaque;
  caseDefinition.mutate({ pdf, ...fixture, image: target.object, alpha: fixture.alpha, transparent: fixture.alpha });
  return pdf;
}

async function runCase(caseDefinition, variant) {
  const pdf = await prepare(caseDefinition);
  const bytes = await pdf.save({ useObjectStreams: variant.useObjectStreams });
  const beforeHash = sha256(bytes);
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), beforeHash, `${caseDefinition.name}/${variant.name} inspection mutated bytes`);
  assert.deepEqual(issueSummary(first), issueSummary(second), `${caseDefinition.name}/${variant.name} is nondeterministic`);
  const observed = imageCodes(first);
  for (const expected of caseDefinition.expected) assert.ok(observed.includes(expected), `${caseDefinition.name}/${variant.name} missing ${expected}`);
  if (caseDefinition.expected.length === 0) assert.deepEqual(observed, [], `${caseDefinition.name}/${variant.name} unexpected image issue`);
  const record = { name: caseDefinition.name, serialization: variant.name, base: caseDefinition.base, sha256: beforeHash, bytes: bytes.length, imageIssues: imageIssues(first), issueCodes: first.issues.map(({ code }) => code), expected: caseDefinition.expected };
  if (RETAIN_EVIDENCE && RETAINED_CASES.has(caseDefinition.name)) await writeFile(new URL(`${caseDefinition.name}-${variant.name}.pdf`, EVIDENCE_DIRECTORY), bytes);
  return { bytes, record };
}

for (const caseDefinition of CASES) for (const variant of SERIALIZATION_VARIANTS) {
  test(`image correction ${caseDefinition.name} ${variant.name}`, async () => RESULTS.push((await runCase(caseDefinition, variant)).record));
}

test("image correction matrix has complete identities and retains the baseline gate", async () => {
  assert.equal(RESULTS.length, CASES.length * SERIALIZATION_VARIANTS.length);
  const baseline = await preflightPdfx4(PNG_BASELINE_BYTES);
  assert.equal(baseline.conformant, false);
  assert.ok(baseline.uncovered.length > 0);
});

async function snapshot() {
  return Promise.all((await readdir(EVIDENCE_DIRECTORY)).sort().map(async (file) => ({ file, bytes: (await stat(new URL(file, EVIDENCE_DIRECTORY))).size })));
}

async function writeEvidence() {
  const retainedArtifacts = RESULTS.filter(({ name }) => RETAINED_CASES.has(name)).map(({ name, serialization, sha256: hash, bytes }) => ({ file: `${name}-${serialization}.pdf`, name, serialization, sha256: hash, bytes }));
  await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, executedResultCount: RESULTS.length, cases: RESULTS }, null, 2));
  await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, generatedCaseCount: RESULTS.length, generatedCases: RESULTS.map(({ name, serialization, sha256: hash, bytes }) => ({ name, serialization, sha256: hash, bytes })), retainedArtifactCount: retainedArtifacts.length, retainedArtifacts }, null, 2));
}

test("image correction evidence is explicitly gated", async () => {
  if (RETAIN_EVIDENCE) await writeEvidence();
});

if (!RETAIN_EVIDENCE) test("image correction default mode is read-only and verifies retained hashes", async () => {
  const before = await snapshot();
  const results = JSON.parse(await readFile(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(results.executedResultCount, CASES.length * 2);
  assert.equal(manifest.generatedCaseCount, CASES.length * 2);
  const current = new Map(RESULTS.map((record) => [`${record.name}/${record.serialization}`, record]));
  for (const historical of results.cases) {
    const fresh = current.get(`${historical.name}/${historical.serialization}`);
    assert.ok(fresh);
    assert.deepEqual(fresh.imageIssues, historical.imageIssues);
    assert.match(fresh.sha256, /^[0-9a-f]{64}$/u);
  }
  for (const artifact of manifest.retainedArtifacts) {
    const bytes = new Uint8Array(await readFile(new URL(artifact.file, EVIDENCE_DIRECTORY)));
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
    const report = await preflightPdfx4(bytes);
    const historical = results.cases.find(({ name, serialization }) => `${name}-${serialization}.pdf` === artifact.file);
    assert.deepEqual(imageIssues(report), historical.imageIssues, artifact.file);
  }
  assert.deepEqual(await snapshot(), before);
});
