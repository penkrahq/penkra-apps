import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { readPdfContent } from "./pdf-content.mjs";
import { inspectPdfxFonts } from "./pdfx-fonts.mjs";
import { exportPdf } from "./pdf.mjs";

const font = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
const codes = (report) => report.issues.map((issue) => issue.code);
async function fixture(text = "Canvas office affine 123") {
  const ir = { outputs: [{ id: "page", width: 400, height: 100, physical: { w: 400, h: 100, unit: "px" }, nodes: [{ id: "text", z: 0, type: "text", capability: { verdict: "native" }, geometry: { x: 10, y: 10, w: 380, h: 60 }, paint: {}, semantics: { content: text, runs: [{ from: 0, to: text.length, fontFamily: "Inter", fontSize: 24 }] } }] }] };
  return PDFDocument.load(await exportPdf(ir, { fonts: { "Inter:400": font } }), { updateMetadata: false });
}
async function reparse(pdf) { return PDFDocument.load(await pdf.save(), { updateMetadata: false }); }
function descendant(pdf) { return pdf.context.enumerateIndirectObjects().map(([, object]) => object).find((object) => object.get?.(PDFName.of("Subtype"))?.toString() === "/CIDFontType2"); }
function replaceContent(pdf, map) {
  const page = pdf.getPages()[0];
  const content = page.node.Contents();
  const stream = pdf.context.lookup(content.get(0));
  assert.ok(stream instanceof PDFRawStream);
  const text = new TextDecoder().decode(decodePDFRawStream(stream).decode());
  const replacement = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(map(text))));
  page.node.set(PDFName.of("Contents"), pdf.context.obj([replacement]));
}

test("PDF content lexer keeps strings and comments distinct from operators", () => {
  const content = "/F#31 12 Tf % /Missing 99 Tf\n [(Tj \\( text \\) \\101) -20 <00410042>] TJ /Span << /MCID 0 >> BDC EMC";
  const operations = readPdfContent(new TextEncoder().encode(content));
  assert.deepEqual(operations.map((item) => item.operator), ["Tf", "TJ", "BDC", "EMC"]);
  assert.equal(operations[0].operands[0].value, "F1");
  assert.equal(new TextDecoder().decode(operations[1].operands[0].value[0].value), "Tj ( text ) A");
  for (const invalid of ["<xx> Tj", "(unclosed", "[1 2", "/Name#zz 12 Tf", "BI /W 1 ID x EI", "12"]) assert.throws(() => readPdfContent(new TextEncoder().encode(invalid)));
});

test("actual Canvas embedded font programs agree with encoded glyph widths", async () => {
  const report = inspectPdfxFonts(await fixture());
  assert.deepEqual(report.issues, []);
  assert.equal(report.checkedFonts, 1);
  assert.ok(report.checkedGlyphs >= 10);
});

test("PDF export rejects missing glyphs instead of drawing a silent notdef box", async () => {
  await assert.rejects(fixture("\u{10ffff}"), { code: "CANVAS_PDF_GLYPH_MISSING" });
});

test("serialized font width tampering is detected against the embedded program", async () => {
  const pdf = await fixture("A");
  const fontDict = descendant(pdf);
  const widths = fontDict.lookup(PDFName.of("W"));
  // Change every explicitly declared width; at least the drawn A must disagree.
  for (let index = 1; index < widths.size(); index += 2) {
    const range = widths.lookup(index);
    for (let i = 0; i < range.size(); i += 1) range.set(i, PDFNumber.of(range.lookup(i).asNumber() + 100));
  }
  assert.ok(codes(inspectPdfxFonts(await reparse(pdf))).includes("FONT_WIDTH_MISMATCH"));
});

test("notdef, out-of-range glyph codes and odd code lengths cannot pass", async () => {
  for (const [hex, code] of [["0000", "FONT_NOTDEF_USED"], ["ffff", "FONT_GLYPH_MISSING"], ["00", "FONT_CODE_LENGTH_INVALID"]]) {
    const pdf = await fixture("A");
    replaceContent(pdf, (text) => text.replace(/<[0-9a-f]+>\s*Tj/iu, `<${hex}> Tj`));
    assert.ok(codes(inspectPdfxFonts(await reparse(pdf))).includes(code), code);
  }
});

test("missing embedded program and unresolved font resources are rejected", async () => {
  const pdf = await fixture("A");
  descendant(pdf).lookup(PDFName.of("FontDescriptor")).delete(PDFName.of("FontFile2"));
  assert.ok(codes(inspectPdfxFonts(await reparse(pdf))).includes("FONT_NOT_EMBEDDED"));
  const other = await fixture("A");
  replaceContent(other, (text) => text.replace(/\/[^\s]+\s+[\d.]+\s+Tf/u, "/Absent 24 Tf"));
  assert.ok(codes(inspectPdfxFonts(await reparse(other))).includes("TEXT_FONT_UNRESOLVED"));
});
