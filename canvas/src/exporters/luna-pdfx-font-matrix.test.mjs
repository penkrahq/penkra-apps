import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";
import test from "node:test";
import { exportPdf } from "./pdf.mjs";
import { inspectPdfxFonts } from "./pdfx-fonts.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { readPdfContent } from "./pdf-content.mjs";

const FONT_PATH = new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url);
const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-font-matrix-20260906/", import.meta.url);
const TEXT = "Canvas office affine 123";
const FONT_BYTES = await readFile(FONT_PATH);
const SERIALIZATION_VARIANTS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);

const fontCodes = (report) => report.issues.map(({ code }) => code);
const fontIssueObjects = (report) => report.issues.map(({ code, object }) => ({ code, object }));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const textEncoder = new TextEncoder();

function makeIR() {
  return {
    outputs: [{
      id: "page",
      width: 400,
      height: 100,
      physical: { w: 400, h: 100, unit: "px" },
      nodes: [{
        id: "text",
        z: 0,
        type: "text",
        capability: { verdict: "native" },
        geometry: { x: 10, y: 10, w: 380, h: 60 },
        paint: {},
        semantics: {
          content: TEXT,
          runs: [{ from: 0, to: TEXT.length, fontFamily: "Inter", fontSize: 24 }],
        },
      }],
    }],
  };
}

function resolve(pdf, value) {
  return value?.constructor?.name === "PDFRef" ? pdf.context.lookup(value) : value;
}

function dictGet(pdf, dict, key) {
  return dict instanceof PDFDict ? resolve(pdf, dict.get(PDFName.of(key))) : undefined;
}

function pageFont(pdf, pageIndex = 0) {
  const page = pdf.getPages()[pageIndex];
  const resources = resolve(pdf, page.node.Resources());
  const fonts = dictGet(pdf, resources, "Font");
  assert.ok(fonts instanceof PDFDict, `Page[${pageIndex}] has a Font resource dictionary`);
  const [entry] = fonts.entries();
  assert.ok(entry, `Page[${pageIndex}] has a named font resource`);
  const [key, raw] = entry;
  const type0 = resolve(pdf, raw);
  assert.ok(type0 instanceof PDFDict, "font resource resolves to a dictionary");
  const descendants = dictGet(pdf, type0, "DescendantFonts");
  assert.ok(descendants instanceof PDFArray, "baseline has DescendantFonts");
  const descendant = resolve(pdf, descendants.get(0));
  assert.ok(descendant instanceof PDFDict, "baseline descendant is a dictionary");
  const descriptor = dictGet(pdf, descendant, "FontDescriptor");
  assert.ok(descriptor instanceof PDFDict, "baseline FontDescriptor is a dictionary");
  const program = dictGet(pdf, descriptor, "FontFile2");
  assert.ok(program instanceof PDFRawStream, "baseline FontFile2 is a stream");
  return { page, resources, fonts, resourceName: key.decodeText(), type0, descendant, descriptor, program };
}

function pageContent(pdf, pageIndex = 0) {
  const page = pdf.getPages()[pageIndex];
  const contents = resolve(pdf, page.node.Contents());
  const streams = contents instanceof PDFArray ? contents.asArray().map((value) => resolve(pdf, value)) : [contents];
  return streams.filter((stream) => stream instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join("\n");
}

function baselineUsedCids(pdf) {
  const cids = [];
  const operations = readPdfContent(textEncoder.encode(pageContent(pdf)));
  for (const operation of operations) {
    if (operation.operator === "Tj" && operation.operands[0]?.kind === "string") {
      for (let index = 0; index + 1 < operation.operands[0].value.length; index += 2) {
        cids.push(operation.operands[0].value[index] * 256 + operation.operands[0].value[index + 1]);
      }
    }
  }
  assert.ok(cids.length > 1, "baseline contains multiple used encoded CIDs");
  return [...new Set(cids)];
}

function hexCid(cid) {
  return cid.toString(16).padStart(4, "0");
}

function setPageContents(pdf, contents, pageIndex = 0) {
  const streams = contents.map((content) => pdf.context.register(pdf.context.flateStream(textEncoder.encode(content))));
  pdf.getPages()[pageIndex].node.set(
    PDFName.of("Contents"),
    streams.length === 1 ? streams[0] : pdf.context.obj(streams),
  );
}

function setW(pdf, descendant, value) {
  descendant.set(PDFName.of("W"), pdf.context.obj(value));
}

function setFontProgram(pdf, descriptor, bytes, compression) {
  descriptor.set(
    PDFName.of("FontFile2"),
    compression === "flate" ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes),
  );
}

function expectedWidth(font, cid) {
  const glyph = font.getGlyph(cid);
  return glyph.advanceWidth * 1000 / font.unitsPerEm;
}

function textWithFont(fontName, body) {
  return `BT\n/${fontName} 18 Tf\n${body}\nET`;
}

function expectedFontReport(codes, checkedGlyphs, checkedFonts = 1) {
  return { codes, checkedFonts, checkedGlyphs };
}

const rejectedFontReport = (code) => expectedFontReport([code, "TEXT_FONT_UNRESOLVED"], 0, 0);

const CASES = [
  { name: "baseline-identity-h-cidfonttype2", expected: expectedFontReport([], "used") },
  { name: "raw-fontfile2-stream", mutate: ({ pdf, descriptor, fontBytes }) => setFontProgram(pdf, descriptor, fontBytes, "raw"), expected: expectedFontReport([], "used") },
  { name: "flate-fontfile2-stream", mutate: ({ pdf, descriptor, fontBytes }) => setFontProgram(pdf, descriptor, fontBytes, "flate"), expected: expectedFontReport([], "used") },
  { name: "direct-fontdescriptor", mutate: ({ descendant, descriptor }) => descendant.set(PDFName.of("FontDescriptor"), descriptor), expected: expectedFontReport([], "used") },
  { name: "inherited-page-font-resources", mutate: ({ pdf, page, resources }) => { page.node.delete(PDFName.of("Resources")); pdf.catalog.Pages().set(PDFName.of("Resources"), resources); }, expected: expectedFontReport([], "used") },
  { name: "missing-fontfile2", mutate: ({ descriptor }) => descriptor.delete(PDFName.of("FontFile2")), expected: rejectedFontReport("FONT_NOT_EMBEDDED") },
  { name: "nonstream-fontfile2", mutate: ({ pdf, descriptor }) => descriptor.set(PDFName.of("FontFile2"), PDFString.of("not-a-stream")), expected: rejectedFontReport("FONT_NOT_EMBEDDED") },
  { name: "truncated-font-program", mutate: ({ pdf, descriptor, fontBytes }) => setFontProgram(pdf, descriptor, fontBytes.subarray(0, 64), "raw"), expected: rejectedFontReport("FONT_PROGRAM_INVALID") },
  { name: "random-font-program", mutate: ({ pdf, descriptor }) => setFontProgram(pdf, descriptor, Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), "raw"), expected: rejectedFontReport("FONT_PROGRAM_INVALID") },
  { name: "unsupported-font-encoding", mutate: ({ type0 }) => type0.set(PDFName.of("Encoding"), PDFName.of("WinAnsiEncoding")), expected: rejectedFontReport("FONT_ENCODING_OUTSIDE_SUBSET") },
  { name: "wrong-cid-subtype", mutate: ({ descendant }) => descendant.set(PDFName.of("Subtype"), PDFName.of("CIDFontType0")), expected: rejectedFontReport("FONT_CID_MAPPING_OUTSIDE_SUBSET") },
  { name: "nonidentity-cidtogidmap", mutate: ({ descendant }) => descendant.set(PDFName.of("CIDToGIDMap"), PDFName.of("CustomMap")), expected: rejectedFontReport("FONT_CID_MAPPING_OUTSIDE_SUBSET") },
  { name: "missing-descendantfonts", mutate: ({ type0 }) => type0.delete(PDFName.of("DescendantFonts")), expected: rejectedFontReport("FONT_CID_MAPPING_OUTSIDE_SUBSET") },
  { name: "empty-descendantfonts", mutate: ({ pdf, type0 }) => type0.set(PDFName.of("DescendantFonts"), pdf.context.obj([])), expected: rejectedFontReport("FONT_CID_MAPPING_OUTSIDE_SUBSET") },
  { name: "multiple-descendantfonts", mutate: ({ pdf, type0, descendant }) => type0.set(PDFName.of("DescendantFonts"), pdf.context.obj([descendant, descendant])), expected: rejectedFontReport("FONT_CID_MAPPING_OUTSIDE_SUBSET") },
  { name: "w-absent-correct-dw", mutate: ({ pdf, descendant, width, fontName, cid }) => { descendant.delete(PDFName.of("W")); descendant.set(PDFName.of("DW"), PDFNumber.of(width)); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)]); }, expected: expectedFontReport([], 1) },
  { name: "w-absent-wrong-dw", mutate: ({ pdf, descendant, width, fontName, cid }) => { descendant.delete(PDFName.of("W")); descendant.set(PDFName.of("DW"), PDFNumber.of(width + 100)); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)]); }, expected: expectedFontReport(["FONT_WIDTH_MISMATCH"], 1) },
  { name: "w-valid-range-form", mutate: ({ pdf, descendant, cid, width, fontName }) => { setW(pdf, descendant, [cid, cid, width]); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)]); }, expected: expectedFontReport([], 1) },
  { name: "w-valid-array-form", mutate: ({ pdf, descendant, cid, width, fontName }) => { setW(pdf, descendant, [cid, [width]]); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)]); }, expected: expectedFontReport([], 1) },
  { name: "w-duplicate-cid-entries", mutate: ({ pdf, descendant, cid, width }) => setW(pdf, descendant, [cid, [width], cid, [width]]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-descending-range", mutate: ({ pdf, descendant, cid, width }) => setW(pdf, descendant, [cid + 1, cid, width]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-negative-cid", mutate: ({ pdf, descendant, width }) => setW(pdf, descendant, [-1, [width]]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-cid-65536", mutate: ({ pdf, descendant, width }) => setW(pdf, descendant, [65536, [width]]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-missing-range-width", mutate: ({ pdf, descendant, cid }) => setW(pdf, descendant, [cid, cid]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-nonnumeric-width", mutate: ({ pdf, descendant, cid }) => setW(pdf, descendant, [cid, [PDFName.of("BadWidth")]]), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "w-nonarray", mutate: ({ descendant }) => descendant.set(PDFName.of("W"), PDFNumber.of(1)), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "dw-wrong-type", mutate: ({ descendant }) => descendant.set(PDFName.of("DW"), PDFName.of("BadWidth")), expected: rejectedFontReport("FONT_WIDTH_TABLE_INVALID") },
  { name: "tj-valid-used-glyph", mutate: ({ pdf, fontName, cid }) => setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)]), expected: expectedFontReport([], 1) },
  { name: "tj-valid-tj-array", mutate: ({ pdf, fontName, cid }) => setPageContents(pdf, [textWithFont(fontName, `[<${hexCid(cid)}> -20 <${hexCid(cid)}>] TJ`)]), expected: expectedFontReport([], 1) },
  { name: "tj-cid-zero", mutate: ({ pdf, fontName }) => setPageContents(pdf, [textWithFont(fontName, "<0000> Tj")]), expected: expectedFontReport(["FONT_NOTDEF_USED"], 1) },
  { name: "tj-out-of-range-cid", mutate: ({ pdf, fontName, font }) => setPageContents(pdf, [textWithFont(fontName, `<${hexCid(font.numGlyphs)}> Tj`)]), expected: expectedFontReport(["FONT_GLYPH_MISSING"], 1) },
  { name: "tj-odd-code-bytes", mutate: ({ pdf, fontName }) => setPageContents(pdf, [textWithFont(fontName, "<00> Tj")]), expected: expectedFontReport(["FONT_CODE_LENGTH_INVALID"], 0) },
  { name: "tj-number-only-array", mutate: ({ pdf, fontName }) => setPageContents(pdf, [textWithFont(fontName, "[-20 30] TJ")]), expected: expectedFontReport([], 0) },
  { name: "two-font-switches", mutate: ({ pdf, fontName, cid, secondCid }) => setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj /${fontName} 18 Tf <${hexCid(secondCid)}> Tj`)]), expected: expectedFontReport([], 2) },
  { name: "q-q-restores-prior-font", mutate: ({ pdf, fontName, cid, secondCid }) => setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj q /${fontName} 18 Tf <${hexCid(secondCid)}> Tj Q <${hexCid(cid)}> Tj`)]), expected: expectedFontReport([], 2) },
  { name: "active-font-across-content-streams", mutate: ({ pdf, fontName, cid }) => setPageContents(pdf, [`BT\n/${fontName} 18 Tf`, `<${hexCid(cid)}> Tj`, "ET"]), expected: expectedFontReport([], 1) },
  { name: "page-local-font-state-no-leak", mutate: ({ pdf, fontName, cid }) => { const second = pdf.addPage([400, 100]); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)], 0); setPageContents(pdf, ["BT\n<" + hexCid(cid) + "> Tj\nET"], 1); second.node.delete(PDFName.of("Resources")); }, expected: expectedFontReport(["TEXT_FONT_UNRESOLVED"], 1) },
  { name: "same-font-reused-across-pages", mutate: ({ pdf, resources, fontName, cid, secondCid }) => { const second = pdf.addPage([400, 100]); second.node.set(PDFName.of("Resources"), resources); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)], 0); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(secondCid)}> Tj`)], 1); }, expected: expectedFontReport([], 2) },
  { name: "repeat-distinct-documents-no-cache-leak", repeatDocuments: true, expected: expectedFontReport([], 1) },
];

assert.equal(CASES.length, 39);

const baseExportBytes = await exportPdf(makeIR(), { fonts: { "Inter:400": FONT_BYTES } });
const baseLoaded = await PDFDocument.load(baseExportBytes, { updateMetadata: false, throwOnInvalidObject: true });
const BASELINE_BYTES = await baseLoaded.save({ useObjectStreams: false });
const baselinePdf = await PDFDocument.load(BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
const baselineParts = pageFont(baselinePdf);
const fontBytes = decodePDFRawStream(baselineParts.program).decode();
const actualFont = fontkit.create(fontBytes);
const usedCids = baselineUsedCids(baselinePdf);
const [cid, secondCid] = usedCids;
const width = expectedWidth(actualFont, cid);
const fontName = baselineParts.resourceName;

async function prepareCase(caseDefinition) {
  const pdf = await PDFDocument.load(BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
  const parts = pageFont(pdf);
  const programBytes = decodePDFRawStream(parts.program).decode();
  const details = {
    pdf,
    page: parts.page,
    resources: parts.resources,
    type0: parts.type0,
    descendant: parts.descendant,
    descriptor: parts.descriptor,
    fontBytes: programBytes,
    font: fontkit.create(programBytes),
    resourceName: parts.resourceName,
    fontName: parts.resourceName,
    cid,
    secondCid,
    width,
  };
  caseDefinition.mutate?.(details);
  return details.pdf;
}

async function serializedCase(caseDefinition, variant) {
  const mutated = await prepareCase(caseDefinition);
  const bytes = await mutated.save({ useObjectStreams: variant.useObjectStreams });
  const beforeHash = sha256(bytes);
  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const first = inspectPdfxFonts(reloaded);
  const firstIssues = fontIssueObjects(first);
  const repeated = inspectPdfxFonts(reloaded);
  assert.deepEqual(fontIssueObjects(repeated), firstIssues, `${caseDefinition.name}/${variant.name}: repeat order`);
  assert.equal(sha256(bytes), beforeHash, `${caseDefinition.name}/${variant.name}: input bytes changed`);
  return { bytes, report: first, beforeHash, firstIssues };
}

const evidenceResults = [];
const manifest = [];
await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

for (const caseDefinition of CASES) {
  for (const variant of SERIALIZATION_VARIANTS) {
    test(`serialized font matrix ${caseDefinition.name} ${variant.name}`, async () => {
      if (caseDefinition.repeatDocuments) {
        const valid = await serializedCase(caseDefinition, variant);
        const invalid = await serializedCase({
          ...caseDefinition,
          name: `${caseDefinition.name}-invalid-width`,
          mutate: ({ pdf, descendant, width: caseWidth, fontName: caseFontName, cid: caseCid }) => {
            descendant.delete(PDFName.of("W"));
            descendant.set(PDFName.of("DW"), PDFNumber.of(caseWidth + 100));
            setPageContents(pdf, [textWithFont(caseFontName, `<${hexCid(caseCid)}> Tj`)]);
          },
        }, variant);
        const validAgain = await serializedCase(caseDefinition, variant);
        assert.deepEqual(fontIssueObjects(valid.report), []);
        assert.deepEqual(fontIssueObjects(validAgain.report), []);
        assert.deepEqual(fontCodes(invalid.report), ["FONT_WIDTH_MISMATCH"]);
      } else {
        const result = await serializedCase(caseDefinition, variant);
        assert.deepEqual(fontCodes(result.report), caseDefinition.expected.codes, caseDefinition.name);
        assert.equal(result.report.checkedFonts, caseDefinition.expected.checkedFonts, caseDefinition.name);
        const expectedGlyphs = caseDefinition.expected.checkedGlyphs === "used"
          ? usedCids.length
          : caseDefinition.expected.checkedGlyphs;
        assert.equal(result.report.checkedGlyphs, expectedGlyphs, caseDefinition.name);
        const record = {
          name: caseDefinition.name,
          serialization: variant.name,
          sha256: result.beforeHash,
          issueCodes: fontCodes(result.report),
          issueObjects: result.firstIssues,
          checkedFonts: result.report.checkedFonts,
          checkedGlyphs: result.report.checkedGlyphs,
        };
        evidenceResults.push(record);
        manifest.push({ name: `${caseDefinition.name}-${variant.name}`, sha256: result.beforeHash, bytes: result.bytes.length });
        if (["baseline-identity-h-cidfonttype2", "w-absent-wrong-dw", "missing-fontfile2", "tj-odd-code-bytes"].includes(caseDefinition.name)) {
          await writeFile(new URL(`${caseDefinition.name}-${variant.name}.pdf`, EVIDENCE_DIRECTORY), result.bytes);
        }
      }
    });
  }
}

test("aggregate configured PDF/X export keeps closed publication gate", async () => {
  const source = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const printer = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
  await assert.rejects(
    () => exportPdf(makeIR(), {
      profile: "PDF/X-4",
      outputIntent: printer,
      sourceColorProfile: source,
      fonts: { "Inter:400": FONT_BYTES },
    }),
    (error) => {
      assert.equal(error.code, "CANVAS_PDF_PROFILE_UNVERIFIED");
      assert.equal(error.preflight.conformant, false);
      assert.deepEqual(error.preflight.issues.filter(({ code }) => code.startsWith("FONT_") || code.startsWith("TEXT_FONT_")), []);
      assert.ok(error.preflight.uncovered.length > 0);
      return true;
    },
  );
});

test("font matrix has no skipped cases and writes machine-readable evidence", async () => {
  assert.equal(CASES.length, 39);
  assert.equal(SERIALIZATION_VARIANTS.length, 2);
  assert.equal(evidenceResults.length, (CASES.length - 1) * SERIALIZATION_VARIANTS.length);
  await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), `${JSON.stringify({
    caseCount: CASES.length,
    serializationVariantCount: SERIALIZATION_VARIANTS.length,
    executedResultCount: evidenceResults.length,
    cases: evidenceResults,
  }, null, 2)}\n`);
  await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), `${JSON.stringify({
    caseCount: CASES.length,
    serializationVariantCount: SERIALIZATION_VARIANTS.length,
    artifacts: manifest,
  }, null, 2)}\n`);
  assert.equal(new Set(manifest.map(({ sha256: hash }) => hash)).size, manifest.length);
});
