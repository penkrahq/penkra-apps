import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import test from "node:test";

const importRoot = process.env.PDF_RESOURCE_NAME_IMPORT_ROOT || fileURLToPath(new URL(".", import.meta.url));
const fromFixed = (file) => import(pathToFileURL(resolve(importRoot, file)).href);
const [{ decodePDFRawStream, PDFDocument, PDFName, PDFRawStream, PDFString }, { readPdfContent }, { serializePdf16 }, { preflightPdfx4 }, { lookupPdfResourceName }, { inspectCanvasPdfEnvelope }] = await Promise.all([
  fromFixed("../../node_modules/pdf-lib/cjs/index.js"), fromFixed("pdf-content.mjs"), fromFixed("pdf16-writer.mjs"),
  fromFixed("pdfx-preflight.mjs"), fromFixed("pdf-resource-name.mjs"), fromFixed("pdf-serialization-envelope.mjs"),
]);

const OPERATORS = Object.freeze([
  { name: "gs", category: "ExtGState", content: ({ token }) => `q /${token} gs Q` },
  { name: "Tf", category: "Font", content: ({ token }) => `BT /${token} 12 Tf <0001> Tj ET` },
  { name: "Do", category: "XObject", content: ({ token }) => `/${token} Do` },
  { name: "BDC", category: "Properties", content: ({ token }) => `/Tag /${token} BDC EMC` },
]);
const NAME_CASES = Object.freeze([
  { id: "ordinary-ascii", token: "Plain" }, { id: "literal-hash-followed-by-hex", token: "A#2342" },
  { id: "repeated-hash-escapes", token: "A#2342#2343" }, { id: "escaped-delimiter", token: "A#2FB" },
  { id: "utf8-multibyte-escapes", token: "A#C3#A9" }, { id: "uppercase-hex-escape", token: "A#234A" },
  { id: "lowercase-hex-escape", token: "A#234a" },
]);
const RESOURCE_CODES = new Set(["CONTENT_RESOURCE_UNRESOLVED", "CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_SUBTYPE_INVALID"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const textBytes = (value) => new TextEncoder().encode(value);

function fixture(bodies) {
  const chunks = [Buffer.from("%PDF-1.6\n%\x81\x81\x81\x81\n", "latin1")];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from([`xref\n0 ${offsets.length}\n`, "0000000000 65535 f \n", ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`), `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`].join(""), "latin1"));
  return Uint8Array.from(Buffer.concat(chunks));
}

function oneObject(probe) {
  return fixture([`<< /Type /Catalog /Pages 2 0 R /Probe ${probe} >>`, "<< /Type /Pages /Kids [] /Count 0 >>"]);
}

function parsedOperand(token, operator) {
  const operation = readPdfContent(textBytes(operator.content({ token }))).find(({ operator: name }) => name === operator.name);
  assert.ok(operation);
  return operator.name === "BDC" ? operation.operands[1].value : operation.operands[0].value;
}

function resourceValues(pdf, operator, token) {
  const parsed = parsedOperand(token, operator);
  const actualKey = PDFName.of(token);
  const checkerKey = PDFName.of(parsed);
  const decoyKey = checkerKey.toString() === actualKey.toString() ? PDFName.of("Decoy") : checkerKey;
  const actual = operator.name === "Tf"
    ? pdf.context.obj({ Marker: PDFName.of("Actual"), Type: PDFName.of("Font"), Subtype: PDFName.of("Type0"), Encoding: PDFName.of("Identity-H") })
    : pdf.context.obj({ Marker: PDFName.of("Actual") });
  let decoy;
  if (operator.name === "gs") decoy = pdf.context.obj({ Type: PDFName.of("NotExtGState") });
  else if (operator.name === "Tf") decoy = pdf.context.obj({ Type: PDFName.of("NotFont") });
  else if (operator.name === "Do") decoy = pdf.context.obj({ Type: PDFName.of("XObject"), Subtype: PDFName.of("Form") });
  else decoy = PDFString.of("not-a-properties-dictionary");
  const map = pdf.context.obj({});
  map.set(actualKey, actual);
  map.set(decoyKey, decoy);
  return { map, parsed };
}

async function canonicalCandidate(operator, nameCase, compressed) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  const values = resourceValues(pdf, operator, nameCase.token);
  if (operator.name === "Do") {
    const image = pdf.context.stream(Uint8Array.of(255, 0, 0), { Type: PDFName.of("XObject"), Subtype: PDFName.of("Image"), Marker: PDFName.of("Actual"), Width: 1, Height: 1, ColorSpace: PDFName.of("DeviceRGB"), BitsPerComponent: 8 });
    values.map.set(PDFName.of(nameCase.token), pdf.context.register(image));
  }
  const resources = pdf.context.obj({});
  resources.set(PDFName.of(operator.category), values.map);
  page.node.set(PDFName.of("Resources"), resources);
  const content = textBytes(operator.content(nameCase));
  page.node.set(PDFName.of("Contents"), pdf.context.register(compressed ? pdf.context.flateStream(content) : pdf.context.stream(content)));
  const serialized = await serializePdf16(pdf);
  const reparsed = await PDFDocument.load(serialized, { updateMetadata: false, throwOnInvalidObject: true });
  const category = reparsed.context.lookup(reparsed.getPage(0).node.Resources().get(PDFName.of(operator.category)));
  return { serialized, reparsed, category, parsed: parsedOperand(nameCase.token, operator) };
}

function resourceIssues(report, operator) {
  const suffix = `/Contents[0]/${operator.name}`;
  return report.issues.filter(({ code, object }) => RESOURCE_CODES.has(code) && object?.endsWith(suffix)).map(({ code }) => code);
}

export function rawLiteralPair() {
  const content = "q /A#234a gs Q";
  return fixture([
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /ExtGState << /A#4a 6 0 R /AJ 7 0 R >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /ExtGState /ca 0.5 /Marker /RawLowercaseKey >>", "<< /Type /NotExtGState /Marker /SemanticAJ >>",
  ]);
}

export function rawLiteralSingle() {
  const content = "q /A#234a gs Q";
  return fixture([
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /ExtGState << /A#4a 6 0 R >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /ExtGState /ca 0.5 /Marker /RawLowercaseKey >>",
  ]);
}

test("guard rejects paired and single raw lowercase key spellings with the exact boundary detail", async () => {
  for (const bytes of [rawLiteralPair(), rawLiteralSingle()]) {
    const envelope = inspectCanvasPdfEnvelope(bytes);
    assert.equal(envelope.verified, false);
    assert.deepEqual(envelope.issues.map(({ code, detail }) => ({ code, detail })), [{ code: "PDF_SERIALIZATION_OUTSIDE_SUBSET", detail: "name-lowercase-escape-parser-boundary" }]);
    const report = await preflightPdfx4(bytes);
    assert.equal(report.status, "invalid");
    assert.equal(report.conformant, false);
    assert.ok(report.issues.some(({ code, detail }) => code === "PDF_SERIALIZATION_OUTSIDE_SUBSET" && detail === "name-lowercase-escape-parser-boundary"));
  }
});

test("canonical decoded-byte lookup remains actual for all 56 rows and resource-clean for canonical 48", async () => {
  let rows = 0;
  let canonicalPasses = 0;
  for (const operator of OPERATORS) for (const nameCase of NAME_CASES) for (const compressed of [false, true]) {
    const candidate = await canonicalCandidate(operator, nameCase, compressed);
    const selected = lookupPdfResourceName(candidate.category, candidate.parsed);
    assert.ok(selected, `${operator.name}:${nameCase.id}`);
    const resolved = candidate.reparsed.context.lookup(selected);
    const dict = resolved instanceof PDFRawStream ? resolved.dict : resolved;
    assert.equal(dict.get(PDFName.of("Marker")).decodeText(), "Actual", `${operator.name}:${nameCase.id}:${compressed ? "Flate" : "raw"}`);
    rows += 1;
    if (nameCase.id !== "lowercase-hex-escape") {
      assert.deepEqual(resourceIssues(await preflightPdfx4(candidate.serialized), operator), []);
      canonicalPasses += 1;
    }
  }
  assert.equal(rows, 56);
  assert.equal(canonicalPasses, 48);
});

test("lowercase content escapes, ordinary lowercase names, strings/comments/hex, and Flate bytes are shielded", async () => {
  assert.equal(inspectCanvasPdfEnvelope(oneObject("<< /A#4A 1 >>")).verified, true);
  assert.equal(inspectCanvasPdfEnvelope(oneObject("<< /A#234a 1 >>")).verified, true);
  assert.equal(inspectCanvasPdfEnvelope(oneObject("/ordinarylowercase")).verified, true);
  const payload = deflateSync(Buffer.from("binary /A#4a endobj startxref % not a name", "latin1")).toString("latin1");
  const shielded = fixture([
    "<< /Type /Catalog % /A#4a\n/Pages 2 0 R /Text (literal /A#4a) /Hex <2F41233461> >>",
    `<< /Length ${Buffer.byteLength(payload, "latin1")} /Filter /FlateDecode >>\nstream\n${payload}\nendstream`,
  ]);
  assert.deepEqual(inspectCanvasPdfEnvelope(shielded).issues, []);
});

test("lowercase content escape resolves to an uppercase canonical dictionary key", async () => {
  const content = "q /A#4a gs Q";
  const bytes = fixture([
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /ExtGState << /AJ 6 0 R >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /ExtGState /ca 0.5 /Marker /CanonicalAJ >>",
  ]);
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, []);
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const page = pdf.getPage(0);
  const resources = pdf.context.lookup(page.node.Resources());
  const extGState = pdf.context.lookup(resources.get(PDFName.of("ExtGState")));
  const stream = pdf.context.lookup(page.node.Contents());
  const parsed = readPdfContent(decodePDFRawStream(stream).decode())[1].operands[0].value;
  assert.equal(parsed, "AJ");
  const selected = lookupPdfResourceName(extGState, parsed);
  assert.ok(selected);
  assert.equal(pdf.context.lookup(selected).get(PDFName.of("Marker")).decodeText(), "CanonicalAJ");
});
