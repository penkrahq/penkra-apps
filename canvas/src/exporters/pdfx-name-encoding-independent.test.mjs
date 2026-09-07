import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { inspectCanvasPdfEnvelope } from "./pdf-serialization-envelope.mjs";
import { readPdfContent } from "./pdf-content.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const latin1 = (value) => Buffer.from(value, "latin1");

function classicPdf(bodies) {
  const chunks = [latin1("%PDF-1.6\n%\x81\x81\x81\x81\n")];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    const bytes = Buffer.isBuffer(body) ? body : latin1(body);
    chunks.push(Buffer.concat([latin1(`${index + 1} 0 obj\n`), bytes, latin1("\nendobj\n")]));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(latin1([
    `xref\n0 ${offsets.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("")));
  return Buffer.concat(chunks);
}

function objectNamePdf(name, extra = "") {
  return classicPdf([
    `<< /Type /Catalog /Pages 2 0 R /Probe ${name} ${extra}>>`,
    "<< /Type /Pages /Kids [] /Count 0 >>",
  ]);
}

function contentPdf(content, resources = "<< >>") {
  const payload = latin1(content);
  return classicPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /Resources ${resources} /MediaBox [ 0 0 200 300 ] /Contents 4 0 R >>`,
    Buffer.concat([latin1(`<< /Length ${payload.length} >>\nstream\n`), payload, latin1("\nendstream")]),
  ]);
}

function streamBytes(bytes) {
  const payload = Buffer.from(bytes);
  return Buffer.concat([latin1(`<< /Length ${payload.length} >>\nstream\n`), payload, latin1("\nendstream")]);
}

const invalidUtf8 = [
  ["overlong-2", "/#C0#AF"],
  ["overlong-3", "/#E0#80#80"],
  ["overlong-4", "/#F0#80#80#80"],
  ["surrogate", "/#ED#A0#80"],
  ["out-of-range", "/#F4#90#80#80"],
  ["truncated-2", "/#C2"],
  ["truncated-3", "/#E0#A0"],
  ["truncated-4", "/#F0#90#80"],
  ["lone-continuation-80", "/#80"],
  ["lone-continuation-BF", "/#BF"],
];

test("object envelope accepts valid UTF-8 scalar edge names after # expansion", () => {
  const cases = [
    ["U+007F", "/#7F"],
    ["U+0080", "/#C2#80"],
    ["U+07FF", "/#DF#BF"],
    ["U+0800", "/#E0#A0#80"],
    ["U+D7FF", "/#ED#9F#BF"],
    ["U+E000", "/#EE#80#80"],
    ["U+10FFFF", "/#F4#8F#BF#BF"],
  ];
  for (const [label, name] of cases) {
    const result = inspectCanvasPdfEnvelope(objectNamePdf(name));
    assert.equal(result.verified, true, label);
    assert.deepEqual(result.issues, [], label);
  }
});

test("object envelope rejects invalid UTF-8 sequences after # expansion", () => {
  for (const [label, name] of invalidUtf8) {
    const bytes = objectNamePdf(name);
    const result = inspectCanvasPdfEnvelope(bytes);
    assert.equal(result.verified, false, label);
    assert.deepEqual(result.issues, [{
      code: "PDF_SERIALIZATION_OUTSIDE_SUBSET",
      clause: "6.1",
      object: `file@${bytes.indexOf(latin1(name))}`,
      detail: "name-utf8-outside-writer-subset",
    }], label);
  }
});

test("escaped controls and duplicate decoded names retain the current envelope boundary", () => {
  for (const name of ["/#01", "/#7F", "/#20", "/#2F"]) {
    assert.deepEqual(inspectCanvasPdfEnvelope(objectNamePdf(name)).issues, [], name);
  }
  const nullByte = inspectCanvasPdfEnvelope(objectNamePdf("/#00"));
  assert.equal(nullByte.issues[0].detail, "null-name-byte");
  const duplicateBytes = objectNamePdf("/#C3#A9 1 /#c3#a9 2 /Extra");
  const duplicate = inspectCanvasPdfEnvelope(duplicateBytes);
  assert.equal(duplicate.issues.length, 1);
  assert.equal(duplicate.issues[0].code, "PDF_SERIALIZATION_INVALID");
  assert.equal(duplicate.issues[0].clause, "6.1");
  assert.match(duplicate.issues[0].object, /^file@\d+$/u);
  assert.equal(duplicate.issues[0].detail, "dictionary-key-invalid-or-duplicate");
});

test("binary stream payload shields name-looking bytes from object parsing", () => {
  const payload = Buffer.from("/#FF endobj startxref trailer %%EOF\n\x00\xFF", "latin1");
  const bytes = classicPdf([
    "<< /Type /Catalog /Pages 2 0 R /Contents 3 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
    streamBytes(payload),
  ]);
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, []);
});

test("content-stream resource, tag, and inline-dictionary names bypass object-name UTF-8 validation", async () => {
  const cases = [
    ["resource-name", "/#FF Do\n", ["CONTENT_RESOURCE_UNRESOLVED"]],
    ["tag-name", "/#FF BMC EMC\n", []],
    ["inline-dictionary-key", "/#FF << /#80 1 >> BDC EMC\n", []],
  ];
  for (const [label, content, expectedCodes] of cases) {
    const bytes = contentPdf(content);
    assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, [], `${label} envelope`);
    const operations = readPdfContent(latin1(content));
    assert.ok(operations.length > 0, `${label} tokenizer output`);
    const report = await preflightPdfx4(bytes);
    assert.deepEqual(report.issues.filter(({ code }) => code.startsWith("PDF_SERIALIZATION_")), [], `${label} serialization issues`);
    assert.deepEqual(report.issues.filter(({ code }) => expectedCodes.includes(code)).map(({ code }) => code), expectedCodes, label);
    assert.equal(report.conformant, false, label);
  }
  await PDFDocument.load(contentPdf("/#FF BMC EMC\n"), { updateMetadata: false, throwOnInvalidObject: true });
});
