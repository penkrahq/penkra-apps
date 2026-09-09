import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
const BOLD_FONT_PATH = new URL("../../vendor/open-pencil/fonts/Inter-Bold.ttf", import.meta.url);
const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-font-matrix-20260906/correction-20260907/", import.meta.url);
const TEXT = "Canvas office affine 123";
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_FONT_MATRIX_RETAIN_EVIDENCE === "1";
const FONT_BYTES = await readFile(FONT_PATH);
const BOLD_FONT_BYTES = await readFile(BOLD_FONT_PATH);
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

function makeDualFontIR() {
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
          content: "AB",
          runs: [
            { from: 0, to: 1, fontFamily: "Inter", fontSize: 24, weight: 400 },
            { from: 1, to: 2, fontFamily: "Inter", fontSize: 24, weight: 700 },
          ],
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

function pageFonts(pdf, pageIndex = 0) {
  const page = pdf.getPages()[pageIndex];
  const resources = resolve(pdf, page.node.Resources());
  const fonts = dictGet(pdf, resources, "Font");
  assert.ok(fonts instanceof PDFDict, `Page[${pageIndex}] has a Font resource dictionary`);
  const entries = [...fonts.entries()].map(([key, raw]) => {
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
    return { resourceName: key.decodeText(), type0, descendant, descriptor, program };
  });
  assert.ok(entries.length > 0, `Page[${pageIndex}] has a named font resource`);
  return { page, resources, fonts, entries };
}

function pageFont(pdf, pageIndex = 0) {
  const parts = pageFonts(pdf, pageIndex);
  return { page: parts.page, resources: parts.resources, fonts: parts.fonts, ...parts.entries[0] };
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

function usedCidsByFont(pdf) {
  const byFont = new Map();
  let active = null;
  for (const operation of readPdfContent(textEncoder.encode(pageContent(pdf)))) {
    if (operation.operator === "Tf" && operation.operands[0]?.kind === "name") {
      active = operation.operands[0].value;
      if (!byFont.has(active)) byFont.set(active, []);
    }
    if (operation.operator === "Tj" && active && operation.operands[0]?.kind === "string") {
      const values = byFont.get(active);
      for (let index = 0; index + 1 < operation.operands[0].value.length; index += 2) {
        values.push(operation.operands[0].value[index] * 256 + operation.operands[0].value[index + 1]);
      }
    }
  }
  return new Map([...byFont.entries()].map(([name, cids]) => [name, [...new Set(cids)]]));
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
  {
    name: "two-font-switches",
    base: "dual",
    mutate: ({ pdf, fontName, secondFontName, cid, secondCid }) => setPageContents(pdf, [`BT\n/${fontName} 18 Tf\n<${hexCid(cid)}> Tj\n/${secondFontName} 18 Tf\n<${hexCid(secondCid)}> Tj\nET`]),
    expected: expectedFontReport([], 2, 2),
  },
  {
    name: "q-q-restores-prior-font",
    base: "dual",
    mutate: ({ pdf, fontName, secondFontName, cid, secondCid }) => setPageContents(pdf, [
      `BT\n/${fontName} 18 Tf\n<${hexCid(cid)}> Tj\nET`,
      `q\nBT\n/${secondFontName} 18 Tf\n<${hexCid(secondCid)}> Tj\nET\nQ`,
      `BT\n<${hexCid(cid)}> Tj\nET`,
    ]),
    negative: ({ pdf, fontName, secondFontName, cid, secondCid }) => setPageContents(pdf, [
      "BT\n/Missing 18 Tf\nET",
      `q\nBT\n/${secondFontName} 18 Tf\n<${hexCid(secondCid)}> Tj\nET\nQ`,
      `BT\n<${hexCid(cid)}> Tj\nET`,
    ]),
    negativeExpected: expectedFontReport(["FONT_ENCODING_OUTSIDE_SUBSET", "TEXT_FONT_UNRESOLVED"], 1, 1),
    expected: expectedFontReport([], 2, 2),
  },
  { name: "active-font-across-content-streams", mutate: ({ pdf, fontName, cid }) => setPageContents(pdf, [`BT\n/${fontName} 18 Tf`, `<${hexCid(cid)}> Tj`, "ET"]), expected: expectedFontReport([], 1) },
  { name: "page-local-font-state-no-leak", mutate: ({ pdf, fontName, cid }) => { const second = pdf.addPage([400, 100]); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)], 0); setPageContents(pdf, ["BT\n<" + hexCid(cid) + "> Tj\nET"], 1); second.node.delete(PDFName.of("Resources")); }, expected: expectedFontReport(["TEXT_FONT_UNRESOLVED"], 1) },
  { name: "same-font-reused-across-pages", mutate: ({ pdf, resources, fontName, cid, secondCid }) => { const second = pdf.addPage([400, 100]); second.node.set(PDFName.of("Resources"), resources); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(cid)}> Tj`)], 0); setPageContents(pdf, [textWithFont(fontName, `<${hexCid(secondCid)}> Tj`)], 1); }, expected: expectedFontReport([], 2) },
  { name: "repeat-distinct-documents-no-cache-leak", repeatDocuments: true, expected: expectedFontReport([], 1) },
];

assert.equal(CASES.length, 39);

const baseExportBytes = await exportPdf(makeIR(), { fonts: { "Inter:400": FONT_BYTES } });
const baseLoaded = await PDFDocument.load(baseExportBytes, { updateMetadata: false, throwOnInvalidObject: true });
const BASELINE_BYTES = await baseLoaded.save({ useObjectStreams: false });
const dualExportBytes = await exportPdf(makeDualFontIR(), {
  fonts: { "Inter:400": FONT_BYTES, "Inter:700": BOLD_FONT_BYTES },
});
const dualLoaded = await PDFDocument.load(dualExportBytes, { updateMetadata: false, throwOnInvalidObject: true });
const DUAL_BASELINE_BYTES = await dualLoaded.save({ useObjectStreams: false });
const baselinePdf = await PDFDocument.load(BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
const baselineParts = pageFont(baselinePdf);
const fontBytes = decodePDFRawStream(baselineParts.program).decode();
const actualFont = fontkit.create(fontBytes);
const usedCids = baselineUsedCids(baselinePdf);
const [cid, secondCid] = usedCids;
const width = expectedWidth(actualFont, cid);
const fontName = baselineParts.resourceName;
const dualPdf = await PDFDocument.load(DUAL_BASELINE_BYTES, { updateMetadata: false, throwOnInvalidObject: true });
const dualParts = pageFonts(dualPdf);
assert.equal(dualParts.entries.length, 2, "dual baseline has two embedded font resources");
assert.notEqual(dualParts.entries[0].resourceName, dualParts.entries[1].resourceName, "dual resources are not aliases");
const dualUsedCids = usedCidsByFont(dualPdf);
const dualFirst = dualParts.entries[0];
const dualSecond = dualParts.entries[1];
const dualFirstCid = dualUsedCids.get(dualFirst.resourceName)?.[0];
const dualSecondCid = dualUsedCids.get(dualSecond.resourceName)?.[0];
assert.ok(Number.isInteger(dualFirstCid) && Number.isInteger(dualSecondCid), "dual baseline CIDs are derived from serialized content");

async function prepareCase(caseDefinition) {
  const baseBytes = caseDefinition.base === "dual" ? DUAL_BASELINE_BYTES : BASELINE_BYTES;
  const pdf = await PDFDocument.load(baseBytes, { updateMetadata: false, throwOnInvalidObject: true });
  const parts = pageFont(pdf);
  const programBytes = decodePDFRawStream(parts.program).decode();
  const secondParts = caseDefinition.base === "dual" ? pageFonts(pdf).entries[1] : null;
  const secondBytes = secondParts ? decodePDFRawStream(secondParts.program).decode() : null;
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
    secondFontName: secondParts?.resourceName,
    cid: caseDefinition.base === "dual" ? dualFirstCid : cid,
    secondCid: caseDefinition.base === "dual" ? dualSecondCid : secondCid,
    width: caseDefinition.base === "dual" ? expectedWidth(fontkit.create(programBytes), dualFirstCid) : width,
    secondFont: secondBytes ? fontkit.create(secondBytes) : null,
    secondFontBytes: secondBytes,
  };
  if (caseDefinition.base === "dual") {
    assert.notEqual(details.fontName, details.secondFontName, `${caseDefinition.name}: distinct font resource names`);
    assert.notEqual(sha256(programBytes), sha256(details.secondFontBytes), `${caseDefinition.name}: distinct embedded font programs`);
  }
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
const generatedCases = [];
const retainedArtifacts = [];
const RETAINED_CASES = new Set([
  "baseline-identity-h-cidfonttype2",
  "w-absent-wrong-dw",
  "missing-fontfile2",
  "tj-odd-code-bytes",
]);

if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

function resultSummary(name, serialization, result) {
  return {
    name,
    serialization,
    sha256: result.beforeHash,
    bytes: result.bytes.length,
    issueCodes: fontCodes(result.report),
    issueObjects: result.firstIssues,
    checkedFonts: result.report.checkedFonts,
    checkedGlyphs: result.report.checkedGlyphs,
  };
}

async function retainResult(caseDefinition, variant, result) {
  if (!RETAIN_EVIDENCE || !RETAINED_CASES.has(caseDefinition.name)) return;
  const file = `${caseDefinition.name}-${variant.name}.pdf`;
  await writeFile(new URL(file, EVIDENCE_DIRECTORY), result.bytes);
  retainedArtifacts.push({
    file,
    caseName: caseDefinition.name,
    serialization: variant.name,
    sha256: result.beforeHash,
    bytes: result.bytes.length,
  });
}

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
        evidenceResults.push({
          name: caseDefinition.name,
          serialization: variant.name,
          mode: "state-isolation",
          valid: resultSummary(`${caseDefinition.name}/valid`, variant.name, valid),
          invalid: resultSummary(`${caseDefinition.name}/invalid-width`, variant.name, invalid),
          validAgain: resultSummary(`${caseDefinition.name}/valid-again`, variant.name, validAgain),
        });
        generatedCases.push({
          name: caseDefinition.name,
          serialization: variant.name,
          retained: false,
          generatedHashes: {
            valid: valid.beforeHash,
            invalid: invalid.beforeHash,
            validAgain: validAgain.beforeHash,
          },
        });
      } else {
        const result = await serializedCase(caseDefinition, variant);
        assert.deepEqual(fontCodes(result.report), caseDefinition.expected.codes, caseDefinition.name);
        assert.equal(result.report.checkedFonts, caseDefinition.expected.checkedFonts, caseDefinition.name);
        const expectedGlyphs = caseDefinition.expected.checkedGlyphs === "used"
          ? usedCids.length
          : caseDefinition.expected.checkedGlyphs;
        assert.equal(result.report.checkedGlyphs, expectedGlyphs, caseDefinition.name);
        const record = resultSummary(caseDefinition.name, variant.name, result);
        if (caseDefinition.negative) {
          const negative = await serializedCase({
            ...caseDefinition,
            name: `${caseDefinition.name}-negative`,
            mutate: caseDefinition.negative,
          }, variant);
          assert.deepEqual(fontCodes(negative.report), caseDefinition.negativeExpected.codes, `${caseDefinition.name}: negative codes`);
          assert.equal(negative.report.checkedFonts, caseDefinition.negativeExpected.checkedFonts, `${caseDefinition.name}: negative fonts`);
          assert.equal(negative.report.checkedGlyphs, caseDefinition.negativeExpected.checkedGlyphs, `${caseDefinition.name}: negative glyphs`);
          record.negative = resultSummary(`${caseDefinition.name}-negative`, variant.name, negative);
        }
        evidenceResults.push(record);
        generatedCases.push({ name: caseDefinition.name, serialization: variant.name, retained: RETAIN_EVIDENCE && RETAINED_CASES.has(caseDefinition.name), generatedHashes: { primary: result.beforeHash, negative: record.negative?.sha256 } });
        await retainResult(caseDefinition, variant, result);
      }
    });
  }
}

test("aggregate configured PDF/X export returns a writer-verified embedded-font PDF", async () => {
  const source = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const printer = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
  const bytes = await exportPdf(makeIR(), {
    profile: "PDF/X-4",
    outputIntent: printer,
    sourceColorProfile: source,
    fonts: { "Inter:400": FONT_BYTES },
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).subarray(0, 8).toString("latin1"), "%PDF-1.6");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  assert.equal(pdf.getPages().length, 1);
  const report = await preflightPdfx4(bytes);
  assert.deepEqual(report.issues, []);
  assert.equal(report.canvasWriterSubset.verified, true);
  assert.equal(report.conformant, true);
  assert.ok(pageFonts(pdf).entries.length >= 1);
  assert.ok(pageFont(pdf).program);
});

test("font matrix has no skipped cases and writes machine-readable evidence", async () => {
  assert.equal(CASES.length, 39);
  assert.equal(SERIALIZATION_VARIANTS.length, 2);
  assert.equal(evidenceResults.length, CASES.length * SERIALIZATION_VARIANTS.length);
  assert.equal(generatedCases.length, CASES.length * SERIALIZATION_VARIANTS.length);
  assert.equal(new Set(generatedCases.map(({ name, serialization }) => `${name}/${serialization}`)).size, generatedCases.length);
  if (RETAIN_EVIDENCE) {
    await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), `${JSON.stringify({
      caseCount: CASES.length,
      serializationVariantCount: SERIALIZATION_VARIANTS.length,
      executedResultCount: evidenceResults.length,
      cases: evidenceResults,
    }, null, 2)}\n`);
    await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), `${JSON.stringify({
      caseCount: CASES.length,
      serializationVariantCount: SERIALIZATION_VARIANTS.length,
      generatedCaseCount: generatedCases.length,
      generatedCases,
      retainedArtifactCount: retainedArtifacts.length,
      retainedArtifacts,
    }, null, 2)}\n`);
  }
});

async function evidenceSnapshot() {
  const names = (await readdir(EVIDENCE_DIRECTORY)).sort();
  return Promise.all(names.map(async (name) => {
    const details = await stat(new URL(name, EVIDENCE_DIRECTORY));
    return { name, size: details.size, mtimeMs: details.mtimeMs };
  }));
}

async function verifyRetainedEvidence() {
  const results = JSON.parse(await readFile(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(results.caseCount, 39);
  assert.equal(results.serializationVariantCount, 2);
  assert.equal(results.executedResultCount, 78);
  assert.equal(results.cases.length, 78);
  assert.equal(manifest.generatedCaseCount, 78);
  assert.equal(manifest.generatedCases.length, 78);
  assert.ok(manifest.retainedArtifactCount >= 8);
  assert.equal(manifest.retainedArtifacts.length, manifest.retainedArtifactCount);
  for (const artifact of manifest.retainedArtifacts) {
    const bytes = await readFile(new URL(artifact.file, EVIDENCE_DIRECTORY));
    assert.equal(bytes.length, artifact.bytes, `${artifact.file}: retained byte length`);
    assert.equal(sha256(bytes), artifact.sha256, `${artifact.file}: retained hash`);
    const record = results.cases.find((item) => item.name === artifact.caseName && item.serialization === artifact.serialization);
    assert.ok(record, `${artifact.file}: case result exists`);
    const report = inspectPdfxFonts(await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }));
    assert.deepEqual(fontIssueObjects(report), record.issueObjects, `${artifact.file}: inspector issues`);
    assert.equal(report.checkedFonts, record.checkedFonts, `${artifact.file}: checked fonts`);
    assert.equal(report.checkedGlyphs, record.checkedGlyphs, `${artifact.file}: checked glyphs`);
  }
}

if (!RETAIN_EVIDENCE) {
  test("default matrix execution reads retained evidence without writing it", async () => {
    const before = await evidenceSnapshot();
    await verifyRetainedEvidence();
    const after = await evidenceSnapshot();
    assert.deepEqual(after, before, "default node --test evidence directory is unchanged");
  });
}
