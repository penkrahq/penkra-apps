import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString } from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { PDFX4_OUTPUT_CONDITION } from "./pdfx-profile.mjs";

const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-document-negative-matrix-20260907/", import.meta.url);
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_DOCUMENT_NEGATIVE_RETAIN_EVIDENCE === "1";
const SERIALIZATIONS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const TARGET_CODES = new Set([
  "OUTPUT_CONDITION_UNSUPPORTED", "EXTERNAL_OUTPUT_PROFILE", "ICC_CHANNEL_COUNT_MISMATCH", "OUTPUT_PROFILE_UNREADABLE",
  "XMP_FILTER_FORBIDDEN", "TRAILER_ID_INVALID", "PAGES_MISSING", "PAGE_BOX_INVALID", "MEDIA_BOX_MISSING",
  "BOX_OUTSIDE_CROP", "CANVAS_SUBSET_UNSUPPORTED", "PRESENTATION_FORBIDDEN", "EXTERNAL_RESOURCE_FORBIDDEN",
  "DEFAULT_RGB_MISSING", "DEFAULT_RGB_PROFILE_UNREADABLE", "TRANSPARENCY_GROUP_INVALID",
  "TRANSPARENCY_GROUP_PROFILE_UNREADABLE", "ICC_HEADER_INVALID", "ICC_VERSION_UNSUPPORTED", "ICC_PCS_INVALID",
  "ICC_TAG_TABLE_TRUNCATED",
]);
const RESULTS = [];
if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (value) => PDFName.of(value);
const number = (value) => PDFNumber.of(value);
const string = (value) => PDFString.of(value);
const set = (dict, key, value) => dict.set(name(key), value);
const del = (dict, key) => dict.delete(name(key));
const resolve = (pdf, value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
const textEncoder = new TextEncoder();

const XMP = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:dc="http://purl.org/dc/elements/1.1/" pdfxid:GTS_PDFXVersion="PDF/X-4" pdf:Trapped="False" pdf:Keywords="document-matrix" pdf:Producer="Canvas PDF exporter" xmp:CreatorTool="Canvas" xmp:CreateDate="2026-09-07T12:00:00Z" xmp:ModifyDate="2026-09-07T12:00:00Z" xmp:MetadataDate="2026-09-07T12:00:00Z" xmpMM:DocumentID="uuid:document-negative-matrix" xmpMM:VersionID="1" xmpMM:RenditionClass="proof:pdfx"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Document matrix</rdf:li></rdf:Alt></dc:title><dc:description><rdf:Alt><rdf:li xml:lang="x-default">Document matrix</rdf:li></rdf:Alt></dc:description><dc:creator><rdf:Seq><rdf:li>Canvas</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

function infoFields(pdf) {
  return {
    Title: "Document matrix", Author: "Canvas", Subject: "Document matrix", Keywords: "document-matrix",
    Creator: "Canvas", Producer: "Canvas PDF exporter", CreationDate: "D:20260907120000Z",
    ModDate: "D:20260907120000Z", Trapped: name("False"), GTS_PDFXVersion: "PDF/X-4",
  };
}

function registeredStream(pdf, bytes, dictionary = {}) {
  return pdf.context.register(pdf.context.stream(bytes, dictionary));
}

function iccColorSpace(pdf, bytes, channels, filter = false) {
  const profile = filter
    ? pdf.context.register(pdf.context.stream(bytes, { Filter: name("FlateDecode"), N: number(channels) }))
    : pdf.context.register(pdf.context.stream(bytes, { N: number(channels) }));
  return { profile, colorSpace: pdf.context.obj([name("ICCBased"), profile]) };
}

function outputIntent(pdf, profile) {
  return pdf.context.obj({
    Type: name("OutputIntent"), S: name("GTS_PDFX"), OutputCondition: string(PDFX4_OUTPUT_CONDITION.condition),
    OutputConditionIdentifier: string(PDFX4_OUTPUT_CONDITION.identifier), RegistryName: string(PDFX4_OUTPUT_CONDITION.registryName),
    Info: string(PDFX4_OUTPUT_CONDITION.info), DestOutputProfile: profile,
  });
}

function pageParts(pdf) {
  const page = pdf.getPages()[0];
  const resources = resolve(pdf, page.node.Resources());
  const colorSpaces = resolve(pdf, resources.get(name("ColorSpace")));
  const group = resolve(pdf, page.node.get(name("Group")));
  return { page, resources, colorSpaces, group };
}

async function candidate() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setCropBox(0, 0, 200, 300);
  page.setBleedBox(0, 0, 200, 300);
  page.setTrimBox(9, 9, 191, 291);

  const printer = registeredStream(pdf, PRINTER_BYTES, { N: number(4), Alternate: name("DeviceCMYK") });
  set(pdf.catalog, "OutputIntents", pdf.context.obj([outputIntent(pdf, printer)]));
  const source = iccColorSpace(pdf, SRGB_BYTES, 3);
  set(page.node.Resources(), "ColorSpace", pdf.context.obj({ DefaultRGB: source.colorSpace }));
  set(page.node, "Group", pdf.context.obj({ S: name("Transparency"), CS: source.colorSpace }));

  const metadata = registeredStream(pdf, textEncoder.encode(XMP), { Type: name("Metadata"), Subtype: name("XML") });
  set(pdf.catalog, "Metadata", metadata);
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  for (const [key, value] of Object.entries(infoFields(pdf))) set(info, key, typeof value === "string" ? string(value) : value);
  pdf.context.trailerInfo.ID = pdf.context.obj([string("document-matrix-id-a"), string("document-matrix-id-b")]);
  return pdf;
}

function outputIntentObject(pdf) {
  const intents = resolve(pdf, pdf.catalog.get(name("OutputIntents")));
  assert.ok(intents instanceof PDFArray, "candidate has OutputIntents array");
  return resolve(pdf, intents.get(0));
}

function outputProfile(pdf) {
  return resolve(pdf, outputIntentObject(pdf).get(name("DestOutputProfile")));
}

function metadataStream(pdf) {
  const metadata = resolve(pdf, pdf.catalog.get(name("Metadata")));
  assert.ok(metadata instanceof PDFRawStream, "candidate has Metadata stream");
  return metadata;
}

function badProfile(pdf, channels = 3) {
  return iccColorSpace(pdf, Uint8Array.of(0, 1, 2), channels, true);
}

function topology(nameValue, pdf) {
  const { page, resources, colorSpaces, group } = pdf.getPageCount() ? pageParts(pdf) : {};
  switch (nameValue) {
    case "valid-candidate-control":
      assert.equal(pdf.getPageCount(), 1);
      assert.ok(outputProfile(pdf) instanceof PDFRawStream);
      assert.ok(metadataStream(pdf) instanceof PDFRawStream);
      break;
    case "output-condition-unsupported":
      assert.equal(outputIntentObject(pdf).get(name("OutputConditionIdentifier")).decodeText(), "Other condition");
      break;
    case "external-output-profile":
      assert.ok(outputIntentObject(pdf).get(name("DestOutputProfileRef")));
      break;
    case "icc-channel-count-mismatch":
      assert.equal(outputProfile(pdf).dict.get(name("N")).asNumber(), 3);
      break;
    case "output-profile-unreadable":
    case "icc-header-invalid":
    case "icc-version-unsupported":
    case "icc-pcs-invalid":
    case "icc-tag-table-truncated":
      assert.ok(outputProfile(pdf) instanceof PDFRawStream);
      break;
    case "xmp-filter-forbidden":
      assert.equal(metadataStream(pdf).dict.get(name("Filter")).decodeText(), "FlateDecode");
      break;
    case "trailer-id-invalid":
      assert.equal(resolve(pdf, pdf.context.trailerInfo.ID).size(), 0);
      break;
    case "pages-missing":
      assert.equal(pdf.getPageCount(), 0);
      break;
    case "page-box-invalid":
      assert.deepEqual(resolve(pdf, page.node.get(name("CropBox"))).asArray().map((value) => resolve(pdf, value).asNumber()), [100, 100, 0, 0]);
      break;
    case "media-box-missing":
      assert.equal(page.node.get(name("MediaBox")), undefined);
      break;
    case "box-outside-crop":
      assert.deepEqual(resolve(pdf, page.node.get(name("CropBox"))).asArray().map((value) => resolve(pdf, value).asNumber()), [0, 0, 100, 100]);
      break;
    case "canvas-subset-unsupported":
      assert.ok(pdf.catalog.get(name("AcroForm")));
      break;
    case "presentation-forbidden":
      assert.ok(pdf.catalog.get(name("PresSteps")));
      break;
    case "external-resource-forbidden":
      assert.ok(pdf.catalog.get(name("OPI")));
      break;
    case "default-rgb-missing":
      assert.equal(colorSpaces.get(name("DefaultRGB")), undefined);
      break;
    case "default-rgb-profile-unreadable":
      {
        const defaultRgb = resolve(pdf, colorSpaces.get(name("DefaultRGB")));
        assert.ok(defaultRgb instanceof PDFArray);
        assert.ok(resolve(pdf, defaultRgb.get(1)) instanceof PDFRawStream);
      }
      break;
    case "transparency-group-invalid":
      assert.equal(page.node.get(name("Group")), undefined);
      break;
    case "transparency-group-profile-unreadable":
      assert.ok(group instanceof PDFDict);
      assert.ok(resolve(pdf, group.get(name("CS"))) instanceof PDFArray);
      break;
    default:
      throw new Error(`Missing topology assertion for ${nameValue}`);
  }
}

function mutateIcc(bytes, kind) {
  const output = new Uint8Array(bytes);
  if (kind === "header") output.set(textEncoder.encode("bad!"), 36);
  if (kind === "version") output[8] = 1;
  if (kind === "pcs") output.set(textEncoder.encode("BAD!"), 20);
  if (kind === "tag-table") new DataView(output.buffer).setUint32(128, 0xffffffff);
  return output;
}

const CASES = [
  { name: "valid-candidate-control", expected: [], mutate: () => {} },
  { name: "output-condition-unsupported", expected: ["OUTPUT_CONDITION_UNSUPPORTED"], mutate: ({ pdf }) => set(outputIntentObject(pdf), "OutputConditionIdentifier", string("Other condition")) },
  { name: "external-output-profile", expected: ["EXTERNAL_OUTPUT_PROFILE"], mutate: ({ pdf }) => set(outputIntentObject(pdf), "DestOutputProfileRef", string("external.icc")) },
  { name: "icc-channel-count-mismatch", expected: ["ICC_CHANNEL_COUNT_MISMATCH"], mutate: ({ pdf }) => set(outputProfile(pdf).dict, "N", number(3)) },
  { name: "output-profile-unreadable", expected: ["OUTPUT_PROFILE_UNREADABLE"], mutate: ({ pdf }) => { const profile = outputProfile(pdf); set(profile.dict, "Filter", name("FlateDecode")); profile.contents = Uint8Array.of(0, 1, 2); } },
  { name: "xmp-filter-forbidden", expected: ["XMP_FILTER_FORBIDDEN"], mutate: ({ pdf }) => { const metadata = metadataStream(pdf); set(metadata.dict, "Filter", name("FlateDecode")); metadata.contents = deflateSync(textEncoder.encode(XMP)); } },
  { name: "trailer-id-invalid", expected: ["TRAILER_ID_INVALID"], mutate: ({ pdf }) => { pdf.context.trailerInfo.ID = pdf.context.obj([]); } },
  { name: "pages-missing", expected: ["PAGES_MISSING"], mutate: ({ pdf }) => { set(pdf.catalog.Pages(), "Kids", pdf.context.obj([])); set(pdf.catalog.Pages(), "Count", number(0)); } },
  { name: "page-box-invalid", expected: ["PAGE_BOX_INVALID"], mutate: ({ pdf }) => set(pdf.getPages()[0].node, "CropBox", pdf.context.obj([100, 100, 0, 0])) },
  { name: "media-box-missing", expected: ["MEDIA_BOX_MISSING"], mutate: ({ pdf }) => del(pdf.getPages()[0].node, "MediaBox") },
  { name: "box-outside-crop", expected: ["BOX_OUTSIDE_CROP"], mutate: ({ pdf }) => { const page = pdf.getPages()[0]; set(page.node, "CropBox", pdf.context.obj([0, 0, 100, 100])); set(page.node, "TrimBox", pdf.context.obj([0, 0, 200, 300])); } },
  { name: "canvas-subset-unsupported", expected: ["CANVAS_SUBSET_UNSUPPORTED"], mutate: ({ pdf }) => set(pdf.catalog, "AcroForm", pdf.context.obj({ Fields: pdf.context.obj([]) })) },
  { name: "presentation-forbidden", expected: ["PRESENTATION_FORBIDDEN"], mutate: ({ pdf }) => set(pdf.catalog, "PresSteps", number(1)) },
  { name: "external-resource-forbidden", expected: ["EXTERNAL_RESOURCE_FORBIDDEN"], mutate: ({ pdf }) => set(pdf.catalog, "OPI", pdf.context.obj({ Version: string("1.3") })) },
  { name: "default-rgb-missing", expected: ["DEFAULT_RGB_MISSING"], mutate: ({ pdf }) => del(resolve(pdf, pdf.getPages()[0].node.Resources()).get(name("ColorSpace")), "DefaultRGB") },
  { name: "default-rgb-profile-unreadable", expected: ["DEFAULT_RGB_PROFILE_UNREADABLE"], mutate: ({ pdf }) => { const { resources } = pageParts(pdf); const colors = resolve(pdf, resources.get(name("ColorSpace"))); const bad = badProfile(pdf); set(colors, "DefaultRGB", bad.colorSpace); } },
  { name: "transparency-group-invalid", expected: ["TRANSPARENCY_GROUP_INVALID"], mutate: ({ pdf }) => del(pdf.getPages()[0].node, "Group") },
  { name: "transparency-group-profile-unreadable", expected: ["TRANSPARENCY_GROUP_PROFILE_UNREADABLE"], mutate: ({ pdf }) => { const { page } = pageParts(pdf); const bad = badProfile(pdf); set(resolve(pdf, page.node.get(name("Group"))), "CS", bad.colorSpace); } },
  { name: "icc-header-invalid", expected: ["ICC_HEADER_INVALID"], mutate: ({ pdf }) => { const profile = outputProfile(pdf); profile.contents = mutateIcc(PRINTER_BYTES, "header"); } },
  { name: "icc-version-unsupported", expected: ["ICC_VERSION_UNSUPPORTED"], mutate: ({ pdf }) => { const profile = outputProfile(pdf); profile.contents = mutateIcc(PRINTER_BYTES, "version"); } },
  { name: "icc-pcs-invalid", expected: ["ICC_PCS_INVALID"], mutate: ({ pdf }) => { const profile = outputProfile(pdf); profile.contents = mutateIcc(PRINTER_BYTES, "pcs"); } },
  { name: "icc-tag-table-truncated", expected: ["ICC_TAG_TABLE_TRUNCATED"], mutate: ({ pdf }) => { const profile = outputProfile(pdf); profile.contents = mutateIcc(PRINTER_BYTES, "tag-table"); } },
];

assert.deepEqual(CASES.map(({ name: caseName }) => caseName), [
  "valid-candidate-control", "output-condition-unsupported", "external-output-profile", "icc-channel-count-mismatch", "output-profile-unreadable", "xmp-filter-forbidden", "trailer-id-invalid", "pages-missing", "page-box-invalid", "media-box-missing", "box-outside-crop", "canvas-subset-unsupported", "presentation-forbidden", "external-resource-forbidden", "default-rgb-missing", "default-rgb-profile-unreadable", "transparency-group-invalid", "transparency-group-profile-unreadable", "icc-header-invalid", "icc-version-unsupported", "icc-pcs-invalid", "icc-tag-table-truncated",
]);
assert.equal(new Set(CASES.map(({ name: caseName }) => caseName)).size, CASES.length);
assert.equal(CASES.filter(({ name: caseName }) => caseName !== "valid-candidate-control").length, 21);

async function serializedCase(definition, serialization) {
  const pdf = await candidate();
  definition.mutate({ pdf });
  const bytes = new Uint8Array(await pdf.save(serialization));
  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  topology(definition.name, reloaded);
  return { bytes, reloaded };
}

function targetIssues(report) {
  return report.issues.filter(({ code }) => TARGET_CODES.has(code)).map(({ code, object }) => ({ code, object }));
}

async function runCase(definition, serialization) {
  const { bytes } = await serializedCase(definition, serialization);
  const beforeHash = sha256(bytes);
  const first = await preflightPdfx4(bytes);
  const afterFirstHash = sha256(bytes);
  const second = await preflightPdfx4(bytes);
  const afterSecondHash = sha256(bytes);
  assert.equal(beforeHash, afterFirstHash, `${definition.name} mutated bytes during first inspection`);
  assert.equal(beforeHash, afterSecondHash, `${definition.name} mutated bytes during second inspection`);
  assert.deepEqual(first.issues.map(({ code, object }) => ({ code, object })), second.issues.map(({ code, object }) => ({ code, object })), `${definition.name} diagnostic ordering changed`);
  const observed = targetIssues(first);
  for (const expected of definition.expected) assert.ok(observed.some(({ code }) => code === expected), `${definition.name} missing ${expected}: ${JSON.stringify(observed)}`);
  if (!definition.expected.length) assert.deepEqual(observed, [], `${definition.name} positive control has target issue(s)`);
  const record = {
    name: definition.name, serialization: serialization.name, bytes: bytes.length, sha256: beforeHash,
    expected: definition.expected, targetIssues: observed, allIssues: first.issues.map(({ code, object }) => ({ code, object })),
    conformant: first.conformant, status: first.status,
  };
  RESULTS.push(record);
  if (RETAIN_EVIDENCE) await writeFile(new URL(`${definition.name}-${serialization.name}.pdf`, EVIDENCE_DIRECTORY), bytes);
  return record;
}

for (const definition of CASES) for (const serialization of SERIALIZATIONS) {
  test(`serialized document-negative ${definition.name} ${serialization.name}`, async () => runCase(definition, serialization));
}

test("document-negative matrix executes every named case and serializer", async () => {
  assert.equal(RESULTS.length, CASES.length * SERIALIZATIONS.length);
  assert.equal(new Set(RESULTS.map(({ name: caseName, serialization }) => `${caseName}/${serialization}`)).size, RESULTS.length);
  assert.equal(RESULTS.filter(({ name: caseName }) => caseName !== "valid-candidate-control").length, 21 * SERIALIZATIONS.length);
  if (RETAIN_EVIDENCE) {
    const retained = RESULTS.map(({ name: caseName, serialization, sha256: hash, bytes }) => ({ file: `${caseName}-${serialization}.pdf`, name: caseName, serialization, sha256: hash, bytes }));
    await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), `${JSON.stringify({ caseCount: CASES.length, serializationVariantCount: SERIALIZATIONS.length, executedResultCount: RESULTS.length, cases: RESULTS }, null, 2)}\n`);
    await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), `${JSON.stringify({ caseCount: CASES.length, serializationVariantCount: SERIALIZATIONS.length, generatedCaseCount: RESULTS.length, retainedArtifactCount: retained.length, retainedArtifacts: retained }, null, 2)}\n`);
  }
});

test("document-negative parser state isolation and repeatability", async () => {
  const valid = CASES[0];
  const invalid = CASES.find(({ name: caseName }) => caseName === "output-profile-unreadable");
  const first = await serializedCase(valid, SERIALIZATIONS[1]);
  const bad = await serializedCase(invalid, SERIALIZATIONS[0]);
  const validAgain = await serializedCase(valid, SERIALIZATIONS[1]);
  const validReport = await preflightPdfx4(first.bytes);
  const validAgainReport = await preflightPdfx4(validAgain.bytes);
  assert.deepEqual(validReport.issues.map(({ code, object }) => ({ code, object })), validAgainReport.issues.map(({ code, object }) => ({ code, object })));
  assert.ok(targetIssues(await preflightPdfx4(bad.bytes)).some(({ code }) => code === "OUTPUT_PROFILE_UNREADABLE"));
});

async function evidenceSnapshot() {
  return Promise.all((await readdir(EVIDENCE_DIRECTORY)).sort().map(async (file) => {
    const entry = await stat(new URL(file, EVIDENCE_DIRECTORY));
    return { file, size: entry.size, mtimeMs: entry.mtimeMs };
  }));
}

if (!RETAIN_EVIDENCE) test("document-negative default mode is read-only and verifies retained hashes", async () => {
  const before = await evidenceSnapshot();
  const resultManifest = JSON.parse(await readFile(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const hashManifest = JSON.parse(await readFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(resultManifest.caseCount, CASES.length);
  assert.equal(resultManifest.executedResultCount, CASES.length * SERIALIZATIONS.length);
  assert.equal(hashManifest.generatedCaseCount, CASES.length * SERIALIZATIONS.length);
  assert.equal(hashManifest.retainedArtifactCount, CASES.length * SERIALIZATIONS.length);
  for (const artifact of hashManifest.retainedArtifacts) {
    const bytes = new Uint8Array(await readFile(new URL(artifact.file, EVIDENCE_DIRECTORY)));
    assert.equal(bytes.length, artifact.bytes, artifact.file);
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
  }
  const after = await evidenceSnapshot();
  assert.deepEqual(after, before);
});
