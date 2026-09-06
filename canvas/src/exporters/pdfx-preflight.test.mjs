import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { inspectPdfxOutputProfile, preflightPdfx4 } from "./pdfx-preflight.mjs";
import { exportPdf } from "./pdf.mjs";

const srgb = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const codes = (report) => report.issues.map((issue) => issue.code);

test("PDF/X output profile inspection rejects the actual bundled monitor profile", () => {
  const report = inspectPdfxOutputProfile(srgb);
  assert.equal(report.deviceClass, "mntr");
  assert.equal(report.channels, 3);
  assert.deepEqual(codes(report), ["ICC_NOT_OUTPUT_DEVICE"]);
});

test("ICC inspection rejects truncated headers, tag ranges and invalid channels", () => {
  assert.deepEqual(codes(inspectPdfxOutputProfile(new Uint8Array(20))), ["ICC_TRUNCATED"]);
  const changed = new Uint8Array(srgb);
  changed.set(new TextEncoder().encode("CMY "), 16);
  new DataView(changed.buffer).setUint32(136, changed.length + 16);
  assert.ok(codes(inspectPdfxOutputProfile(changed)).includes("ICC_PROCESS_CHANNELS_INVALID"));
  assert.ok(codes(inspectPdfxOutputProfile(changed)).includes("ICC_TAG_RANGE_INVALID"));
});

async function fixture(change = () => {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  await change(pdf, page);
  return pdf.save();
}

test("preflight reads serialized bytes and reports missing profile and XMP", async () => {
  const report = await preflightPdfx4(await fixture());
  assert.ok(codes(report).includes("OUTPUT_INTENT_COUNT"));
  assert.ok(codes(report).includes("XMP_MISSING"));
  assert.equal(report.conformant, false);
  assert.ok(report.uncovered.length > 0);
  assert.equal((await preflightPdfx4(new Uint8Array([1, 2, 3]))).status, "invalid");
});

test("negative serialized fixtures exercise boxes, actions, font embedding and stream filters", async () => {
  const cases = [
    ["TRIM_OR_ART_REQUIRED", (pdf, page) => page.setArtBox(10, 10, 100, 100)],
    ["BOX_OUTSIDE_MEDIA", (pdf, page) => page.setBleedBox(-1, 0, 201, 300)],
    ["TRIM_OUTSIDE_BLEED", (pdf, page) => page.setBleedBox(20, 20, 100, 100)],
    ["ACTION_FORBIDDEN", (pdf) => pdf.catalog.set(PDFName.of("OpenAction"), pdf.context.obj({ S: "JavaScript", JS: PDFString.of("void 0") }))],
    ["FONT_NOT_EMBEDDED", (pdf) => pdf.context.register(pdf.context.obj({ Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" }))],
    ["STREAM_FILTER_FORBIDDEN", (pdf) => pdf.context.register(pdf.context.stream(new Uint8Array(), { Filter: "LZWDecode" }))],
    ["EXTERNAL_STREAM_FORBIDDEN", (pdf) => pdf.context.register(pdf.context.stream(new Uint8Array(), { F: PDFString.of("outside.dat") }))],
    ["POSTSCRIPT_FORBIDDEN", (pdf) => pdf.context.register(pdf.context.stream(new Uint8Array(), { Type: "XObject", Subtype: "PS" }))],
  ];
  for (const [expected, change] of cases) assert.ok(codes(await preflightPdfx4(await fixture(change))).includes(expected), expected);
});

test("serialized output intent resolves its compressed ICC bytes, not its label", async () => {
  const bytes = await fixture((pdf) => {
    const profile = pdf.context.register(pdf.context.flateStream(srgb, { N: 3 }));
    pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([{ S: "GTS_PDFX", OutputConditionIdentifier: PDFString.of("Claimed printer"), DestOutputProfile: profile }]));
  });
  assert.ok(codes(await preflightPdfx4(bytes)).includes("ICC_NOT_OUTPUT_DEVICE"));
});

test("preflight diagnoses actual Canvas exporter output without asserting conformance", async () => {
  const bytes = await exportPdf({ outputs: [{ id: "page", width: 200, height: 300, physical: { w: 200, h: 300, unit: "px" }, bleed: 9, nodes: [] }] }, { outputIntent: srgb });
  const report = await preflightPdfx4(bytes);
  assert.ok(codes(report).includes("OUTPUT_INTENT_COUNT"));
  assert.ok(!codes(report).includes("TRIM_OR_ART_REQUIRED"));
  assert.equal(report.conformant, false);
});

test("a profile signature change plus fake metadata cannot pass preflight", async () => {
  // Deliberately fake: changing the class signature does NOT create a printer
  // profile. Its transform semantics belong to the reported uncovered checks.
  const fake = new Uint8Array(srgb);
  fake.set(new TextEncoder().encode("prtr"), 12);
  const bytes = await fixture((pdf) => {
    const profile = pdf.context.register(pdf.context.flateStream(fake, { N: 3 }));
    pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([{ S: "GTS_PDFX", OutputConditionIdentifier: PDFString.of("Synthetic negative fixture"), DestOutputProfile: profile }]));
    pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(pdf.context.stream(new TextEncoder().encode("<invalid-xmp/>"), { Type: "Metadata", Subtype: "XML" })));
  });
  const report = await preflightPdfx4(bytes);
  assert.ok(codes(report).includes("XMP_ROOT_UNSUPPORTED"));
  assert.equal(report.status, "invalid");
  assert.equal(report.conformant, false);
});
