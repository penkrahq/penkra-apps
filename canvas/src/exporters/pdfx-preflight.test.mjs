import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { inspectPdfxOutputProfile, preflightPdfx4 } from "./pdfx-preflight.mjs";
import { exportPdf } from "./pdf.mjs";

const srgb = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const codes = (report) => report.issues.map((issue) => issue.code);

test("a clean closed-subset writer publishes only after deterministic conformance", async () => {
  const printer = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
  const bytes = await exportPdf({ outputs: [{ id: "frame", width: 200, height: 300, nodes: [] }] }, {
    profile: "PDF/X-4", outputIntent: printer, sourceColorProfile: srgb,
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).subarray(0, 8).toString("latin1"), "%PDF-1.6");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  assert.equal(pdf.getPages().length, 1);
  assert.deepEqual(pdf.getPages()[0].getSize(), { width: 200, height: 300 });
  const report = await preflightPdfx4(bytes);
  assert.deepEqual(report.issues, []);
  assert.equal(report.canvasWriterSubset.verified, true);
  assert.equal(report.conformant, true);
  assert.deepEqual(report.uncovered, []);
});

test("preflight invokes the subset policy after parsing and preserves the closed baseline", async () => {
  const bytes = pdf16(await readFile(new URL("../../research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf", import.meta.url)));
  const baseline = await preflightPdfx4(bytes);
  assert.equal(baseline.status, "conformant");
  assert.equal(baseline.conformant, true);
  const parsed = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  parsed.catalog.set(PDFName.of("Perms"), parsed.context.obj({}));
  const report = await preflightPdfx4(pdf16(await parsed.save()));
  assert.ok(report.issues.some(({ code, clause, object }) => code === "CANVAS_SUBSET_UNSUPPORTED" && clause === "6.15" && object === "Catalog/Perms"));
  assert.equal(report.status, "invalid");
  assert.equal(report.conformant, false);
  assert.deepEqual(report.uncovered, baseline.uncovered);
});

function pdf16(input) {
  const bytes = new Uint8Array(input);
  bytes.set(new TextEncoder().encode("%PDF-1.6"), 0);
  return bytes;
}

test("PDF/X output profile inspection rejects the actual bundled monitor profile", () => {
  const report = inspectPdfxOutputProfile(srgb);
  assert.equal(report.deviceClass, "mntr");
  assert.equal(report.channels, 3);
  assert.deepEqual(codes(report), ["ICC_NOT_OUTPUT_DEVICE"]);
});

test("transparency blending checks embedded profile identity and channel count", async () => {
  for (const [profileBytes, channels, rejected] of [[srgb, 3, false], [srgb, 4, true], [new Uint8Array(132), 3, true]]) {
    const bytes = await fixture((pdf, page) => {
      const profile = pdf.context.register(pdf.context.flateStream(profileBytes, { N: channels }));
      page.node.set(PDFName.of("Group"), pdf.context.obj({ S: "Transparency", CS: ["ICCBased", profile] }));
    });
    assert.equal(codes(await preflightPdfx4(bytes)).includes("TRANSPARENCY_GROUP_PROFILE_UNSUPPORTED"), rejected);
  }
});

test("ICC inspection rejects truncated headers, tag ranges and invalid channels", () => {
  assert.deepEqual(codes(inspectPdfxOutputProfile(new Uint8Array(20))), ["ICC_TRUNCATED"]);
  const changed = new Uint8Array(srgb);
  changed.set(new TextEncoder().encode("CMY "), 16);
  new DataView(changed.buffer).setUint32(136, changed.length + 16);
  assert.ok(codes(inspectPdfxOutputProfile(changed)).includes("ICC_PROCESS_CHANNELS_INVALID"));
  assert.ok(codes(inspectPdfxOutputProfile(changed)).includes("ICC_TAG_RANGE_INVALID"));
});

test("font and separation names require UTF-8 after PDF name escapes are decoded", async () => {
  for (const [rawName, rejected] of [["Inter-Bold", false], ["Caf\xc3\xa9", false], ["Caf\xe9", true], ["Bad\xc0\xaf", true], ["Bad\xed\xa0\x80", true]]) {
    const bytes = await fixture((pdf) => {
      pdf.context.register(pdf.context.obj({ Type: "FontDescriptor", FontName: PDFName.of(rawName) }));
      pdf.context.register(pdf.context.obj(["Separation", PDFName.of(rawName), "DeviceCMYK", {}]));
      pdf.context.register(pdf.context.obj(["DeviceN", [PDFName.of(rawName)], "DeviceCMYK", {}]));
    });
    const report = await preflightPdfx4(bytes);
    assert.equal(report.issues.filter((issue) => issue.code === "FONT_OR_SEPARATION_NAME_UTF8_INVALID").length, rejected ? 3 : 0);
  }
  const invalidType = await fixture((pdf) => pdf.context.register(pdf.context.obj({ Type: "FontDescriptor", FontName: PDFString.of("Inter") })));
  assert.ok(codes(await preflightPdfx4(invalidType)).includes("FONT_OR_SEPARATION_NAME_TYPE_INVALID"));
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
  assert.deepEqual(report.uncovered, []);
  assert.equal((await preflightPdfx4(new Uint8Array([1, 2, 3]))).status, "invalid");
});

test("PDF 1.6 header is recognized without treating following bytes as part of the version", async () => {
  const validHeader = await fixture();
  // Header parser fixture only: this does not establish document conformance.
  validHeader.set(Buffer.from("%PDF-1.6"));
  assert.ok(!codes(await preflightPdfx4(validHeader)).includes("PDF_VERSION_UNSUPPORTED"));
  const wrongVersion = await fixture();
  assert.ok(codes(await preflightPdfx4(wrongVersion)).includes("PDF_VERSION_UNSUPPORTED"));
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

test("content subset validates native dash arrays and phases", async () => {
  for (const [content, accepted] of [["[] 0 d", true], ["[2 3] 0 d", true], ["[] 1 d", true], ["[-1] 0 d", false], ["0 d", false], ["[] /zero d", false]]) {
    const bytes = await fixture((pdf, page) => {
      page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.flateStream(Buffer.from(content))));
    });
    assert.equal(codes(await preflightPdfx4(bytes)).includes("CONTENT_OPERANDS_INVALID"), !accepted, content);
  }
});

test("emitted text line operators require their exact operand shapes", async () => {
  for (const [content, accepted] of [["BT 24 TL T* ET", true], ["BT /bad TL ET", false], ["BT 24 30 TL ET", false], ["BT 1 T* ET", false]]) {
    const bytes = await fixture((pdf, page) => {
      page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.flateStream(Buffer.from(content))));
    });
    assert.equal(codes(await preflightPdfx4(bytes)).includes("CONTENT_OPERATOR_OUTSIDE_SUBSET"), !accepted, content);
  }
});

test("allowed content operators reject incorrect arity and operand types", async () => {
  const invalid = ["1 q", "1 Q", "1 0 0 1 cm", "/bad w", "-1 w", "0 m", "0 /bad l", "0 1 c", "1 h", "1 f", "0 0 rg", "[0] G", "0 0 0 K", "(state) gs", "12 Do", "1 BT", "1 ET", "12 /Font Tf", "1 0 0 1 Tm", "12 Tj", "[/bad] TJ", "(tag) BMC", "/tag 12 BDC", "1 EMC"];
  const valid = ["q Q", "1 0 0 1 0 0 cm", "0 w", "0 0 m 1 1 l 0 0 1 1 2 2 c h f", "0 0 0 rg 0 G 0 0 0 1 K", "/state gs /image Do", "BT /Font 12 Tf 1 0 0 1 0 0 Tm (text) Tj [(a) -20 <62>] TJ ET", "/Artifact BMC EMC /Span << /MCID 0 >> BDC EMC"];
  for (const [contents, rejected] of [...invalid.map((content) => [content, true]), ...valid.map((content) => [content, false])]) {
    const bytes = await fixture((pdf, page) => page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.flateStream(Buffer.from(contents)))));
    assert.equal(codes(await preflightPdfx4(bytes)).includes("CONTENT_OPERANDS_INVALID"), rejected, contents);
  }
});

test("serialized output intent resolves its compressed ICC bytes, not its label", async () => {
  const bytes = await fixture((pdf) => {
    const profile = pdf.context.register(pdf.context.flateStream(srgb, { N: 3 }));
    pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([{ S: "GTS_PDFX", OutputConditionIdentifier: PDFString.of("Claimed printer"), DestOutputProfile: profile }]));
  });
  assert.ok(codes(await preflightPdfx4(bytes)).includes("ICC_NOT_OUTPUT_DEVICE"));
});

test("content state and resource checks span the entire page Contents array", async () => {
  const cases = [
    ["Q", "GRAPHICS_STATE_UNDERFLOW"], ["q", "GRAPHICS_STATE_UNBALANCED"],
    ["BT BT ET", "TEXT_OBJECT_NESTED"], ["ET", "TEXT_OBJECT_UNDERFLOW"],
    ["BT", "TEXT_OBJECT_UNCLOSED"], ["(a) Tj", "TEXT_OPERATOR_OUTSIDE_TEXT"],
    ["EMC", "MARKED_CONTENT_UNDERFLOW"], ["/Artifact BMC", "MARKED_CONTENT_UNCLOSED"],
    ["/missing gs", "CONTENT_RESOURCE_UNRESOLVED"], ["/missing Do", "CONTENT_RESOURCE_UNRESOLVED"],
    ["BT /missing 12 Tf ET", "CONTENT_RESOURCE_UNRESOLVED"],
    ["/Span /missing BDC EMC", "CONTENT_RESOURCE_UNRESOLVED"],
  ];
  for (const [content, expected] of cases) {
    const bytes = await fixture((pdf, page) => page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.flateStream(Buffer.from(content)))));
    assert.ok(codes(await preflightPdfx4(bytes)).includes(expected), content);
  }
  const split = await fixture((pdf, page) => page.node.set(PDFName.of("Contents"), pdf.context.obj(["q /Artifact BMC BT", "ET EMC Q"].map((content) => pdf.context.register(pdf.context.flateStream(Buffer.from(content)))))));
  assert.ok(!codes(await preflightPdfx4(split)).some((code) => /UNDERFLOW|UNBALANCED|UNCLOSED|NESTED/u.test(code)));
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
