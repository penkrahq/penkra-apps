import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { inspectCanvasPdfEnvelope } from "./pdf-serialization-envelope.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { serializePdf16 } from "./pdf16-writer.mjs";

const serializationCodes = (report) => report.issues
  .filter(({ code }) => code.startsWith("PDF_SERIALIZATION_"))
  .map(({ code }) => code);

function classicPdf(catalogExtra = "") {
  const bodies = [
    `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>`,
    "<< /Type /Pages /Kids [] /Count 0 >>",
  ];
  const chunks = [Buffer.from("%PDF-1.6\n%\x81\x81\x81\x81\n", "latin1")];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from([
    `xref\n0 ${offsets.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join(""), "latin1"));
  return Buffer.concat(chunks);
}

test("actual serializePdf16 output and retained writer candidate pass the envelope", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  const generated = await serializePdf16(document);
  assert.equal(inspectCanvasPdfEnvelope(generated).verified, true);

  const retained = await readFile(new URL("../../research/pdfx-image-correction-20260907/valid-writer-baseline-classic-xref.pdf", import.meta.url));
  const loaded = await PDFDocument.load(retained, { updateMetadata: false, throwOnInvalidObject: true });
  const resaved = await serializePdf16(loaded);
  const envelope = inspectCanvasPdfEnvelope(resaved);
  assert.equal(envelope.verified, true);
  assert.deepEqual(envelope.issues, []);
});

test("preflight reports a broken xref before semantic parsing even when pdf-lib repairs it", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  const classic = await document.save({ useObjectStreams: false });
  classic.set(Buffer.from("%PDF-1.6", "latin1"), 0);
  const text = Buffer.from(classic).toString("latin1");
  const broken = Buffer.from(text.replace(/startxref\n\d+/u, "startxref\n1"), "latin1");
  const report = await preflightPdfx4(broken);
  assert.deepEqual(serializationCodes(report), ["PDF_SERIALIZATION_OUTSIDE_SUBSET"]);
  assert.ok(!report.issues.some(({ code }) => code === "PDF_PARSE_FAILED"), "pdf-lib should repair this input for the semantic pass");
  assert.equal(report.conformant, false);
  assert.equal(report.canvasWriterSubset.verified, false);
});

test("raw object integer and real spellings remain distinct at the preflight boundary", async () => {
  const integer = classicPdf("/Probe 2147483648 ");
  const real = classicPdf("/Probe 2147483648.0 ");
  const integerEnvelope = inspectCanvasPdfEnvelope(integer);
  const realEnvelope = inspectCanvasPdfEnvelope(real);
  assert.equal(integerEnvelope.verified, false);
  assert.equal(integerEnvelope.issues[0].detail, "integer-range");
  assert.deepEqual(realEnvelope.issues, []);

  const integerReport = await preflightPdfx4(integer);
  const realReport = await preflightPdfx4(real);
  assert.ok(serializationCodes(integerReport).includes("PDF_SERIALIZATION_INVALID"));
  assert.deepEqual(serializationCodes(realReport), []);
  assert.equal(integerReport.conformant, false);
  assert.equal(realReport.conformant, false);
});

test("literal strings shield fake delimiters from the serialized envelope scanner", async () => {
  const bytes = classicPdf("/Literal (endobj startxref trailer %%EOF) /Binary <656e6473747265616d00ff> ");
  const envelope = inspectCanvasPdfEnvelope(bytes);
  assert.equal(envelope.verified, true);
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.deepEqual(serializationCodes(first), []);
  assert.deepEqual(first.issues, second.issues);
  assert.equal(first.conformant, false);
});

test("object-stream serialization is explicitly outside the envelope subset and deterministic", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 300]);
  const bytes = await document.save({ useObjectStreams: true });
  bytes.set(Buffer.from("%PDF-1.6", "latin1"), 0);
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.deepEqual(serializationCodes(first), ["PDF_SERIALIZATION_OUTSIDE_SUBSET"]);
  assert.deepEqual(first.issues, second.issues);
  assert.equal(first.conformant, false);
  assert.equal(first.canvasWriterSubset.verified, false);
  assert.ok(first.issues.some(({ code }) => code === "PAGES_MISSING" || code === "XMP_MISSING" || code === "OUTPUT_INTENT_COUNT"));
});
