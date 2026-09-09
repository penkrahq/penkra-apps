import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { inspectCanvasPdfEnvelope } from "./pdf-serialization-envelope.mjs";
import { readPdfContent } from "./pdf-content.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { serializePdf16 } from "./pdf16-writer.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(bodies) {
  const chunks = ["%PDF-1.6\n%\x81\x81\x81\x81\n"];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "latin1"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  chunks.push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "latin1");
}

function oneObject(probe) {
  return fixture([`<< /Type /Catalog /Pages 2 0 R /Probe ${probe} >>`, "<< /Type /Pages /Kids [] /Count 0 >>"]);
}

function expectLowercaseEscape(bytes) {
  const result = inspectCanvasPdfEnvelope(bytes);
  assert.equal(result.verified, false);
  assert.deepEqual(result.issues.map(({ code, detail }) => ({ code, detail })), [{
    code: "PDF_SERIALIZATION_OUTSIDE_SUBSET",
    detail: "name-lowercase-escape-parser-boundary",
  }]);
  return result;
}

test("lowercase hex escapes in name keys, values, nested objects, and unreachable objects are boundary-rejected", () => {
  expectLowercaseEscape(oneObject("<< /A#4a 1 >>"));
  expectLowercaseEscape(oneObject("/A#4a"));
  expectLowercaseEscape(oneObject("<< /Nested << /A#4a 1 >> >>"));
  expectLowercaseEscape(fixture([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
    "<< /Unreachable /A#4a >>",
  ]));
});

test("uppercase escapes, literal-hash escapes, and ordinary lowercase name bytes remain accepted", () => {
  for (const bytes of [
    oneObject("<< /A#4A 1 >>"),
    oneObject("<< /A#234a 1 >>"),
    oneObject("/ordinarylowercase"),
  ]) {
    assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, []);
  }
});

test("strings, comments, and direct stream bytes shield lowercase escape-looking text", () => {
  const payload = "binary /A#4a endobj startxref % not a name";
  const bytes = fixture([
    "<< /Type /Catalog % /A#4a\n/Pages 2 0 R /Text (literal /A#4a) /Hex <2F41233461> >>",
    `<< /Length ${Buffer.byteLength(payload, "latin1")} >>\nstream\n${payload}\nendstream`,
  ]);
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, []);
});

test("content lowercase escapes remain accepted and decode against canonical dictionary bytes", () => {
  const content = "q /A#4a gs Q";
  const bytes = fixture([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /ExtGState << /AJ 6 0 R >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /ExtGState /ca 0.5 >>",
  ]);
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes).issues, []);
  const parsed = readPdfContent(Buffer.from(content, "latin1"));
  assert.equal(parsed[1].operator, "gs");
  assert.equal(parsed[1].operands[0].value, "AJ");
});

test("a configured candidate with one lowered resource key is rejected before publication", async () => {
  const retained = await readFile(new URL("../../research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf", import.meta.url));
  const pdf = await PDFDocument.load(retained, { updateMetadata: false, throwOnInvalidObject: true });
  const page = pdf.getPages()[0];
  const resources = page.node.Resources();
  const extGState = pdf.context.obj({});
  const state = pdf.context.register(pdf.context.obj({ Type: "ExtGState", ca: 0.5 }));
  extGState.set(PDFName.of("A#4a"), state);
  resources.set(PDFName.of("ExtGState"), extGState);
  const content = pdf.context.register(pdf.context.stream(Buffer.from("q /A#234a gs Q", "latin1")));
  page.node.set(PDFName.of("Contents"), content);
  const canonical = await serializePdf16(pdf);
  assert.equal(inspectCanvasPdfEnvelope(canonical).verified, true);
  const canonicalReport = await preflightPdfx4(canonical);
  assert.deepEqual(canonicalReport.issues, []);
  assert.equal(canonicalReport.status, "conformant");
  assert.equal(canonicalReport.conformant, true);
  const canonicalText = Buffer.from(canonical).toString("latin1");
  const occurrences = canonicalText.match(/\/A#234a/g) ?? [];
  assert.equal(occurrences.length, 2);

  const keyOffset = canonicalText.indexOf("/A#234a");
  assert.ok(keyOffset >= 0);
  const loweredText = `${canonicalText.slice(0, keyOffset)}/A#4a  ${canonicalText.slice(keyOffset + "/A#234a".length)}`;
  const lowered = Buffer.from(loweredText, "latin1");
  assert.equal(lowered.length, canonical.length);
  const before = sha256(lowered);
  expectLowercaseEscape(lowered);
  const first = await preflightPdfx4(lowered);
  const second = await preflightPdfx4(lowered);
  assert.equal(sha256(lowered), before);
  assert.deepEqual(first.issues, second.issues);
  assert.ok(first.issues.some(({ code, detail }) => code === "PDF_SERIALIZATION_OUTSIDE_SUBSET" && detail === "name-lowercase-escape-parser-boundary"));
  assert.equal(first.canvasWriterSubset.verified, false);
  assert.equal(first.conformant, false);
});
