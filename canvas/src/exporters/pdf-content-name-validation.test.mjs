import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { readPdfContent } from "./pdf-content.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const latin1 = (value) => Buffer.from(value, "latin1");
const contentCodes = new Set(["CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED", "CONTENT_RESOURCE_UNRESOLVED", "CONTENT_OPERANDS_INVALID"]);
const relevantContentIssues = (report) => report.issues.filter(({ code }) => contentCodes.has(code));

async function serializedContent(content, compressed) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  const bytes = typeof content === "string" ? latin1(content) : Uint8Array.from(content);
  const stream = compressed ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes);
  page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
  return pdf.save({ useObjectStreams: false });
}

test("direct names reject raw non-printable bytes, NUL, and invalid escaped UTF-8", () => {
  for (const raw of [
    [0x1f, "raw-control"], [0x7f, "raw-del"], [0x80, "raw-high-byte"],
  ]) {
    assert.throws(() => readPdfContent(Uint8Array.from([0x2f, 0x41, raw[0], 0x20, 0x44, 0x6f])), /name|UTF-8/u, raw[1]);
  }
  for (const escaped of ["/#00", "/#C0#AF", "/#ED#A0#80", "/#F4#90#80#80", "/#C2", "/#80"]) {
    assert.throws(() => readPdfContent(latin1(`${escaped} Do`)), /name|UTF-8/u, escaped);
  }
});

test("escaped names validate UTF-8 but return the original Latin1 byte identity", () => {
  const utf8 = readPdfContent(latin1("/#C3#A9 Do"))[0].operands[0].value;
  assert.equal(utf8, "\xC3\xA9");
  assert.notEqual(utf8, "é");
  assert.equal(readPdfContent(latin1("/#41 Do"))[0].operands[0].value, "A");
  assert.equal(readPdfContent(latin1("/#01 Do"))[0].operands[0].value, "\x01");
  assert.equal(readPdfContent(latin1("/#7F Do"))[0].operands[0].value, "\x7F");
});

test("inline dictionaries reject duplicate decoded keys after escaped-name decoding", () => {
  assert.throws(
    () => readPdfContent(latin1("/Tag << /#C3#A9 1 /#c3#a9 2 >> BDC EMC")),
    /Duplicate PDF dictionary name/u,
  );
  assert.doesNotThrow(() => readPdfContent(latin1("/Tag << /#41 1 /#42 2 >> BDC EMC")));
});

test("literal strings, hex strings, and comments shield name-looking bytes", () => {
  const content = latin1([
    "BT (/#80 Do /#C0#AF BMC) Tj ",
    "<2F23803020446F> Tj ",
    "% /#80 Do /#C0#AF BMC\n",
    "ET",
  ].join(""));
  assert.doesNotThrow(() => readPdfContent(content));
});

test("serialized raw and Flate content streams reject malformed names with stable preflight syntax code", async () => {
  const cases = [
    ["Do-resource-name", "/#80 Do"],
    ["BMC-tag-name", "/#80 BMC EMC"],
    ["BDC-inline-dictionary-name", "/Tag << /#80 1 >> BDC EMC"],
  ];
  for (const compressed of [false, true]) {
    for (const [label, content] of cases) {
      const bytes = await serializedContent(content, compressed);
      const first = await preflightPdfx4(bytes);
      const second = await preflightPdfx4(bytes);
      const firstContent = relevantContentIssues(first);
      assert.ok(firstContent.length > 0, `${label} compressed=${compressed}`);
      assert.ok(firstContent.every(({ code }) => code === "CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED"), `${label} compressed=${compressed}`);
      assert.deepEqual(first.issues, second.issues, `${label} repeat compressed=${compressed}`);
      assert.equal(first.conformant, false, `${label} conformance`);
    }
  }
});

test("a binary image stream shields name-looking bytes while its content operator remains valid", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  const payload = Uint8Array.from([0x2f, 0xff, 0x23, 0x80, 0x44, 0x6f, 0x00, 0xc3]);
  const image = pdf.context.register(pdf.context.stream(payload, {
    Type: "XObject", Subtype: "Image", Width: 8, Height: 1, ColorSpace: "DeviceGray", BitsPerComponent: 8,
  }));
  page.node.set(PDFName.of("Resources"), pdf.context.obj({ XObject: { Im: image } }));
  page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(latin1("/Im Do"))));
  const bytes = await pdf.save({ useObjectStreams: false });
  bytes.set(Buffer.from("%PDF-1.6", "latin1"), 0);
  const report = await preflightPdfx4(bytes);
  assert.equal(relevantContentIssues(report).length, 0);
  assert.ok(!report.issues.some(({ code }) => code.startsWith("PDF_SERIALIZATION_")));
  assert.ok(!report.issues.some(({ code }) => code === "IMAGE_DATA_LENGTH_INVALID"));
});
