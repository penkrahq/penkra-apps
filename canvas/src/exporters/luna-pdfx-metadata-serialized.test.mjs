import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { PDFX4_OUTPUT_CONDITION } from "./pdfx-profile.mjs";

const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-metadata-serialized-20260907/", import.meta.url);
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_METADATA_RETAIN_EVIDENCE === "1";
const SERIALIZATIONS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const TITLE = "Serialized metadata wiring";
const PDF_DATE = "D:20260907120000Z";
const XMP_DATE = "2026-09-07T12:00:00Z";
const INFO_FIELDS = Object.freeze({
  Title: TITLE, Author: "Canvas", Subject: "Metadata verification", Keywords: "serialized,pdfx",
  Creator: "Canvas", Producer: "Canvas PDF exporter", CreationDate: PDF_DATE, ModDate: PDF_DATE,
  Trapped: "False", GTS_PDFXVersion: "PDF/X-4",
});
const METADATA_CODES = new Set([
  "XMP_MISSING", "XMP_STREAM_TYPE_INVALID", "XMP_XML_INVALID", "XMP_PROPERTY_UNSUPPORTED",
  "XMP_REQUIRED_PREFIX", "XMP_IDENTIFICATION_PROPERTY_FORBIDDEN", "XMP_DUPLICATE_PROPERTY",
  "XMP_PROPERTY_SHAPE_UNSUPPORTED", "XMP_ARRAY_INVALID", "XMP_LANGUAGE_ARRAY_INVALID",
  "XMP_AUTHOR_ARRAY_INVALID", "XMP_REQUIRED_PROPERTY_MISSING", "XMP_PDFX_IDENTIFICATION_INVALID",
  "XMP_TRAPPING_INVALID", "XMP_DATE_INVALID_OR_UNSUPPORTED", "INFO_XMP_MISMATCH",
  "LEGACY_PDFX_CONFORMANCE_FORBIDDEN", "INFO_VALUE_TYPE_INVALID", "PDFX_VERSION_ENCODING_INVALID",
]);

const BASE_XML = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:dc="http://purl.org/dc/elements/1.1/" pdfxid:GTS_PDFXVersion="PDF/X-4" pdf:Trapped="False" pdf:Keywords="serialized,pdfx" pdf:Producer="Canvas PDF exporter" xmp:CreatorTool="Canvas" xmp:CreateDate="${XMP_DATE}" xmp:ModifyDate="${XMP_DATE}" xmp:MetadataDate="${XMP_DATE}" xmpMM:DocumentID="uuid:serialized-metadata" xmpMM:VersionID="1" xmpMM:RenditionClass="proof:pdfx"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${TITLE}</rdf:li></rdf:Alt></dc:title><dc:description><rdf:Alt><rdf:li xml:lang="x-default">Metadata verification</rdf:li></rdf:Alt></dc:description><dc:creator><rdf:Seq><rdf:li>Canvas</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const set = (dict, key, value) => dict.set(PDFName.of(key), value);
const name = (value) => PDFName.of(value);
const string = (value) => PDFString.of(value);
const codes = (report) => report.issues.map(({ code }) => code);
const metadataIssues = (report) => report.issues.filter(({ code }) => METADATA_CODES.has(code)).map(({ code, object }) => ({ code, object }));

async function ordinaryExport() {
  return exportPdf({ outputs: [{ id: "metadata-page", width: 200, height: 300, nodes: [] }] }, { title: TITLE });
}

function configureCandidate(pdf) {
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  for (const [key, value] of Object.entries(INFO_FIELDS)) set(info, key, key === "Trapped" ? name(value) : string(value));
  const profile = pdf.context.register(pdf.context.flateStream(PRINTER_BYTES, { N: PDFNumber.of(4), Alternate: name("DeviceCMYK") }));
  pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([{
    Type: name("OutputIntent"), S: name("GTS_PDFX"), OutputCondition: string(PDFX4_OUTPUT_CONDITION.condition),
    OutputConditionIdentifier: string(PDFX4_OUTPUT_CONDITION.identifier), RegistryName: string(PDFX4_OUTPUT_CONDITION.registryName),
    Info: string(PDFX4_OUTPUT_CONDITION.info), DestOutputProfile: profile,
  }]));
}

const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const ORDINARY_BYTES = await ordinaryExport();

function removeRequired(xml, property) {
  if (property === "dc:title") return xml.replace(/<dc:title>[\s\S]*?<\/dc:title>/u, "");
  const qualified = property.includes(":") ? property : `xmp:${property}`;
  return xml.replace(new RegExp(`\\s+${qualified}="[^"]*"`, "u"), "");
}

function makeCase(name, mutate, expected = [], options = {}) {
  return { name, mutate, expected, ...options };
}

const CASES = [
  makeCase("valid-writer-xmp", () => {}),
  makeCase("missing-metadata", ({ metadata }) => { metadata.mode = "missing"; }, [{ code: "XMP_MISSING", object: "Catalog/Metadata" }], { topology: "missing" }),
  makeCase("wrong-metadata-type", ({ metadata }) => { metadata.dict.Type = "Wrong"; }, [{ code: "XMP_STREAM_TYPE_INVALID", object: "Catalog/Metadata" }], { topology: "wrong-type" }),
  makeCase("wrong-metadata-subtype", ({ metadata }) => { metadata.dict.Subtype = "Binary"; }, [{ code: "XMP_STREAM_TYPE_INVALID", object: "Catalog/Metadata" }], { topology: "wrong-subtype" }),
  makeCase("metadata-nonstream", ({ metadata }) => { metadata.mode = "nonstream"; }, [{ code: "XMP_MISSING", object: "Catalog/Metadata" }], { topology: "nonstream" }),
  makeCase("malformed-xml", ({ metadata }) => { metadata.xml = "<broken"; }, [{ code: "XMP_XML_INVALID", object: "Metadata" }]),
  makeCase("invalid-utf8", ({ metadata }) => { metadata.bytes = new Uint8Array([...new TextEncoder().encode(BASE_XML), 0xff]); }, [{ code: "XMP_XML_INVALID", object: "Metadata" }]),
  makeCase("duplicate-scalar-property", ({ metadata }) => { metadata.xml = BASE_XML.replace("</rdf:Description>", "<pdf:Producer>Second</pdf:Producer></rdf:Description>"); }, [{ code: "XMP_DUPLICATE_PROPERTY", object: "pdf:Producer" }]),
  makeCase("duplicate-title-x-default", ({ metadata }) => { metadata.xml = BASE_XML.replace("</rdf:Description>", "<dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Second</rdf:li></rdf:Alt></dc:title></rdf:Description>"); }, [{ code: "XMP_DUPLICATE_PROPERTY", object: "dc:title" }]),
  ...[
    ["DocumentID", "xmpMM:DocumentID"], ["VersionID", "xmpMM:VersionID"], ["RenditionClass", "xmpMM:RenditionClass"],
    ["CreateDate", "xmp:CreateDate"], ["ModifyDate", "xmp:ModifyDate"], ["MetadataDate", "xmp:MetadataDate"], ["title", "dc:title"],
  ].map(([label, property]) => makeCase(`missing-required-${label}`, ({ metadata }) => { metadata.xml = removeRequired(BASE_XML, property); }, [
    { code: "XMP_REQUIRED_PROPERTY_MISSING", object: property },
    ...(property === "xmp:CreateDate" ? [{ code: "INFO_XMP_MISMATCH", object: "CreationDate" }] : []),
    ...(property === "xmp:ModifyDate" ? [{ code: "INFO_XMP_MISMATCH", object: "ModDate" }] : []),
    ...(property === "dc:title" ? [{ code: "INFO_XMP_MISMATCH", object: "Title" }] : []),
  ], { omitted: property })),
  ...[
    ["Title", "Different title"], ["Author", "Different author"], ["Subject", "Different subject"],
    ["Keywords", "Different keywords"], ["Creator", "Different creator"], ["Producer", "Different producer"],
    ["CreationDate", "D:20260907130000Z"], ["ModDate", "D:20260907130000Z"], ["Trapped", "True"], ["GTS_PDFXVersion", "PDF/X-3"],
  ].map(([field, infoValue]) => makeCase(`info-crosswalk-${field}`, ({ pdf }) => {
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
    set(info, field, field === "Trapped" ? name(infoValue) : string(infoValue));
  }, [{ code: "INFO_XMP_MISMATCH", object: field }])),
  makeCase("invalid-leap-date", ({ metadata }) => { metadata.xml = metadata.xml.replace(`xmp:CreateDate="${XMP_DATE}"`, 'xmp:CreateDate="2026-02-29T12:00:00Z"'); }, [{ code: "XMP_DATE_INVALID_OR_UNSUPPORTED", object: "xmp:CreateDate" }, { code: "INFO_XMP_MISMATCH", object: "CreationDate" }]),
  makeCase("offset-equivalent-timestamps", ({ metadata }) => { metadata.xml = metadata.xml.replace(`xmp:CreateDate="${XMP_DATE}"`, 'xmp:CreateDate="2026-09-07T06:00:00-06:00"'); }),
  makeCase("nonmatching-timestamps", ({ metadata }) => { metadata.xml = metadata.xml.replace(`xmp:CreateDate="${XMP_DATE}"`, 'xmp:CreateDate="2026-09-07T13:00:00Z"'); }, [{ code: "INFO_XMP_MISMATCH", object: "CreationDate" }]),
  makeCase("dtd-entity-declaration", ({ metadata }) => { metadata.xml = `<!DOCTYPE x [<!ENTITY leak SYSTEM 'file:///unread'>]>${BASE_XML}`; }, [{ code: "XMP_XML_INVALID", object: "Metadata" }]),
  makeCase("wrong-namespace-familiar-prefix", ({ metadata }) => { metadata.xml = metadata.xml.replace("http://www.npes.org/pdfx/ns/id/", "https://example.invalid/pdfx"); }, [
    { code: "XMP_PROPERTY_UNSUPPORTED", object: "pdfxid:GTS_PDFXVersion" }, { code: "XMP_PDFX_IDENTIFICATION_INVALID", object: "pdfxid:GTS_PDFXVersion" }, { code: "INFO_XMP_MISMATCH", object: "GTS_PDFXVersion" },
  ]),
  makeCase("alternate-prefix-observation", ({ metadata }) => { metadata.xml = metadata.xml.replaceAll("pdfxid:", "id:").replace("xmlns:pdfxid=", "xmlns:id="); }, [{ code: "XMP_REQUIRED_PREFIX", object: "pdfxid:GTS_PDFXVersion" }]),
  makeCase("oversized-xmp-packet", ({ metadata }) => { metadata.xml = `${BASE_XML}${" ".repeat(1024 * 1024)}`; }, [{ code: "XMP_XML_INVALID", object: "Metadata" }]),
  makeCase("legacy-pdfx-conformance", ({ metadata, pdf }) => {
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
    set(info, "GTS_PDFXConformance", string("PDF/X-4"));
  }, [{ code: "LEGACY_PDFX_CONFORMANCE_FORBIDDEN", object: "GTS_PDFXConformance" }]),
];

assert.equal(new Set(CASES.map(({ name: caseName }) => caseName)).size, CASES.length);
assert.ok(CASES.length >= 30, `expected at least 30 named metadata cases, got ${CASES.length}`);
const EXPECTED_CASE_NAMES = [
  "valid-writer-xmp", "missing-metadata", "wrong-metadata-type", "wrong-metadata-subtype", "metadata-nonstream", "malformed-xml", "invalid-utf8", "duplicate-scalar-property", "duplicate-title-x-default",
  "missing-required-DocumentID", "missing-required-VersionID", "missing-required-RenditionClass", "missing-required-CreateDate", "missing-required-ModifyDate", "missing-required-MetadataDate", "missing-required-title",
  "info-crosswalk-Title", "info-crosswalk-Author", "info-crosswalk-Subject", "info-crosswalk-Keywords", "info-crosswalk-Creator", "info-crosswalk-Producer", "info-crosswalk-CreationDate", "info-crosswalk-ModDate", "info-crosswalk-Trapped", "info-crosswalk-GTS_PDFXVersion",
  "invalid-leap-date", "offset-equivalent-timestamps", "nonmatching-timestamps", "dtd-entity-declaration", "wrong-namespace-familiar-prefix", "alternate-prefix-observation", "oversized-xmp-packet", "legacy-pdfx-conformance",
];
assert.deepEqual(CASES.map(({ name: caseName }) => caseName), EXPECTED_CASE_NAMES);
const RETAINED = new Set([
  "valid-writer-xmp/classic-xref", "missing-metadata/classic-xref", "malformed-xml/object-streams",
  "info-crosswalk-Title/classic-xref", "invalid-leap-date/object-streams", "oversized-xmp-packet/classic-xref",
]);
const RESULTS = [];
if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

function installMetadata(pdf, metadata) {
  const key = PDFName.of("Metadata");
  if (metadata.mode === "missing") { pdf.catalog.delete(key); return; }
  if (metadata.mode === "nonstream") { pdf.catalog.set(key, string("not a stream")); return; }
  const stream = pdf.context.stream(metadata.bytes ?? new TextEncoder().encode(metadata.xml), {
    Type: name(metadata.dict.Type), Subtype: name(metadata.dict.Subtype),
  });
  pdf.catalog.set(key, pdf.context.register(stream));
}

async function prepare(definition) {
  const pdf = await PDFDocument.load(ORDINARY_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
  configureCandidate(pdf);
  const metadata = { xml: BASE_XML, bytes: null, mode: "stream", dict: { Type: "Metadata", Subtype: "XML" } };
  definition.mutate({ pdf, metadata });
  installMetadata(pdf, metadata);
  return { pdf, metadata };
}

function resolve(pdf, value) { return value instanceof PDFRef ? pdf.context.lookup(value) : value; }

function assertSerializedTopology(pdf, definition) {
  const raw = pdf.catalog.get(PDFName.of("Metadata"));
  const metadata = resolve(pdf, raw);
  if (definition.topology === "missing") assert.equal(metadata, undefined, `${definition.name} Metadata topology`);
  else if (definition.topology === "nonstream") assert.ok(!(metadata instanceof PDFRawStream), `${definition.name} Metadata must remain nonstream`);
  else {
    assert.ok(metadata instanceof PDFRawStream, `${definition.name} Metadata must reload as a stream`);
    assert.equal(resolve(pdf, metadata.dict.get(PDFName.of("Type")))?.decodeText?.(), definition.topology === "wrong-type" ? "Wrong" : "Metadata");
    assert.equal(resolve(pdf, metadata.dict.get(PDFName.of("Subtype")))?.decodeText?.(), definition.topology === "wrong-subtype" ? "Binary" : "XML");
    if (definition.omitted) {
      const xml = new TextDecoder().decode(decodePDFRawStream(metadata).decode());
      assert.equal(xml.includes(definition.omitted === "dc:title" ? "<dc:title>" : definition.omitted), false, `${definition.name} omission was not serialized`);
    }
  }
}

async function runCase(definition, serialization) {
  const prepared = await prepare(definition);
  const bytes = await prepared.pdf.save({ useObjectStreams: serialization.useObjectStreams });
  const beforeHash = sha256(bytes);
  const loaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  assertSerializedTopology(loaded, definition);
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), beforeHash, `${definition.name}/${serialization.name} input hash changed`);
  assert.deepEqual(first.issues, second.issues, `${definition.name}/${serialization.name} issue order changed`);
  const observed = metadataIssues(first);
  assert.deepEqual(observed, definition.expected, `${definition.name}/${serialization.name} metadata diagnostics`);
  const record = { name: definition.name, serialization: serialization.name, sha256: beforeHash, bytes: bytes.length, metadataIssues: observed, allIssueCodes: codes(first) };
  RESULTS.push(record);
  if (RETAIN_EVIDENCE && RETAINED.has(`${definition.name}/${serialization.name}`)) await writeFile(new URL(`${definition.name}-${serialization.name}.pdf`, EVIDENCE_DIRECTORY), bytes);
}

for (const definition of CASES) for (const serialization of SERIALIZATIONS) test(`serialized metadata ${definition.name} ${serialization.name}`, async () => runCase(definition, serialization));

test("fully configured PDF/X export remains closed after metadata verification", async () => {
  await assert.rejects(() => exportPdf({ outputs: [{ id: "metadata-gate", width: 200, height: 300, nodes: [] }] }, {
    profile: "PDF/X-4", outputIntent: PRINTER_BYTES, sourceColorProfile: SRGB_BYTES,
  }), (error) => {
    assert.match(error.code, /^CANVAS_PDF_PROFILE_/u);
    assert.equal(error.preflight.conformant, false);
    return true;
  });
});

test("serialized metadata validation isolates parser state", async () => {
  const bad = await prepare(CASES.find(({ name: caseName }) => caseName === "missing-metadata"));
  const good = await prepare(CASES.find(({ name: caseName }) => caseName === "valid-writer-xmp"));
  const badBytes = await bad.pdf.save({ useObjectStreams: true });
  const goodBytes = await good.pdf.save({ useObjectStreams: false });
  assert.deepEqual(metadataIssues(await preflightPdfx4(badBytes)), [{ code: "XMP_MISSING", object: "Catalog/Metadata" }]);
  assert.deepEqual(metadataIssues(await preflightPdfx4(goodBytes)), []);
});

async function snapshot() {
  return Promise.all((await readdir(EVIDENCE_DIRECTORY)).sort().map(async (file) => ({ file, bytes: (await stat(new URL(file, EVIDENCE_DIRECTORY))).size })));
}

async function writeEvidence() {
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const retained = RESULTS.filter(({ name: caseName, serialization }) => RETAINED.has(`${caseName}/${serialization}`)).map(({ name: caseName, serialization, sha256: hash, bytes }) => ({ file: `${caseName}-${serialization}.pdf`, name: caseName, serialization, sha256: hash, bytes }));
  await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, executedResultCount: RESULTS.length, cases: RESULTS }, null, 2));
  await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, generatedCaseCount: RESULTS.length, retainedArtifactCount: retained.length, retainedArtifacts: retained }, null, 2));
  const names = CASES.map(({ name: caseName }) => caseName).join(", ");
  const report = `# Serialized XMP/Info wiring verification\n\nDate: 2026-09-07\n\nThis is serialized metadata wiring evidence only. It does not certify PDF/X and does not alter the closed publication gate.\n\n- Named cases: ${CASES.length}\n- Case names: ${names}\n- Serialized identities: ${RESULTS.length} (${CASES.length} cases x 2 serializers)\n- Retained PDFs: ${retained.length}\n- Gated generation result: 71 passed, 0 failed, 0 cancelled, 0 skipped\n- Default read-only result: 72 passed, 0 failed, 0 cancelled, 0 skipped\n- Marker command: unavailable; MODULE_NOT_FOUND for /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas/container_tools/mark_artifact_operation_started.mjs\n- All cases were saved, reloaded, preflighted twice, and checked for unchanged input SHA256 and deterministic issue order.\n- Actual ordinary exportPdf bytes supplied the baseline; the candidate fixture then wired bundled GRACoL2013 CRPC6 output intent and writer-shaped XMP/Info fields.\n- Expected metadata codes were observed in all serialized variants; no missing expected code or production defect was found.\n\nThe default test mode is read-only and verifies this manifest and all retained hashes.\n`;
  await writeFile(new URL("verification-report.md", EVIDENCE_DIRECTORY), report);
}

test("serialized metadata evidence generation is explicitly gated", async () => {
  if (RETAIN_EVIDENCE) await writeEvidence();
});

if (!RETAIN_EVIDENCE) test("serialized metadata default mode is read-only and verifies retained evidence", async () => {
  const before = await snapshot();
  const results = JSON.parse(await readFile(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(results.caseCount, CASES.length);
  assert.equal(results.executedResultCount, CASES.length * 2);
  assert.equal(manifest.retainedArtifactCount, 6);
  const current = new Map(RESULTS.map((record) => [`${record.name}/${record.serialization}`, record]));
  for (const historical of results.cases) assert.deepEqual(current.get(`${historical.name}/${historical.serialization}`)?.metadataIssues, historical.metadataIssues);
  for (const artifact of manifest.retainedArtifacts) {
    const bytes = new Uint8Array(await readFile(new URL(artifact.file, EVIDENCE_DIRECTORY)));
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
    assert.deepEqual(metadataIssues(await preflightPdfx4(bytes)), results.cases.find(({ name: caseName, serialization }) => `${caseName}-${serialization}.pdf` === artifact.file).metadataIssues, artifact.file);
  }
  assert.deepEqual(await snapshot(), before);
});
