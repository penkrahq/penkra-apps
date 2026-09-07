import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDict, PDFName, PDFNumber, PDFString, PDFDocument } from "pdf-lib";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const srgb = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const printer = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const codes = (report) => report.issues.map((issue) => issue.code);
const contentCodes = new Set([
  "CONTENT_OPERATOR_OUTSIDE_SUBSET", "CONTENT_OPERANDS_INVALID", "CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED",
  "CONTENT_RESOURCE_UNRESOLVED", "CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_SUBTYPE_INVALID",
  "FORM_XOBJECT_OUTSIDE_SUBSET", "GRAPHICS_STATE_UNDERFLOW", "GRAPHICS_STATE_UNBALANCED",
  "TEXT_OBJECT_NESTED", "TEXT_OBJECT_UNDERFLOW", "TEXT_OBJECT_UNCLOSED", "TEXT_OPERATOR_OUTSIDE_TEXT",
  "MARKED_CONTENT_UNDERFLOW", "MARKED_CONTENT_UNCLOSED",
]);

function contentIssues(report) { return codes(report).filter((code) => contentCodes.has(code)); }

function addCategory(resources, category, pdf) {
  const dict = pdf.context.obj({});
  resources.set(PDFName.of(category), dict);
  return dict;
}

function addValidResources(pdf, page, { inherited = false, indirect = false } = {}) {
  const resources = pdf.context.obj({});
  const extGState = addCategory(resources, "ExtGState", pdf);
  const xObject = addCategory(resources, "XObject", pdf);
  const font = addCategory(resources, "Font", pdf);
  const properties = addCategory(resources, "Properties", pdf);
  const image = pdf.context.register(pdf.context.stream(new Uint8Array([0]), {
    Type: "XObject", Subtype: "Image", Width: 1, Height: 1, ColorSpace: "DeviceGray", BitsPerComponent: 8,
  }));
  extGState.set(PDFName.of("GS"), pdf.context.obj({}));
  xObject.set(PDFName.of("Im"), image);
  font.set(PDFName.of("F1"), pdf.context.obj({ Type: "Font" }));
  properties.set(PDFName.of("Prop"), pdf.context.obj({ MCID: 0 }));
  if (indirect) {
    for (const category of ["ExtGState", "XObject", "Font", "Properties"]) {
      const value = resources.lookup(PDFName.of(category), PDFDict);
      resources.set(PDFName.of(category), pdf.context.register(value));
    }
  }
  const resourceValue = indirect ? pdf.context.register(resources) : resources;
  if (inherited) {
    page.node.delete(PDFName.of("Resources"));
    page.node.Parent().set(PDFName.of("Resources"), indirect ? resourceValue : pdf.context.register(resources));
  } else page.node.set(PDFName.of("Resources"), resourceValue);
  return { resources, extGState, xObject, font, properties, image };
}

async function fixture(contents, { compressed = true, streams = false, resources = "valid", inherited = false, indirect = false } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  if (resources === "valid") addValidResources(pdf, page, { inherited, indirect });
  const sourceStreams = streams ? contents : [contents];
  const refs = sourceStreams.map((source) => {
    const bytes = new TextEncoder().encode(source);
    const stream = compressed ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes);
    return pdf.context.register(stream);
  });
  page.node.set(PDFName.of("Contents"), refs.length === 1 ? refs[0] : pdf.context.obj(refs));
  return pdf.save();
}

async function reportFor(contents, options = {}) { return preflightPdfx4(await fixture(contents, options)); }

const validByOperator = {
  q: "q", Q: "Q", h: "h", n: "n", f: "f", "f*": "f*", S: "S", B: "B", "B*": "B*", BT: "BT", ET: "ET", EMC: "EMC",
  cm: "1 0 0 1 0 0 cm", c: "1 2 3 4 5 6 c", Tm: "1 0 0 1 0 0 Tm", m: "1 2 m", l: "3 4 l", w: "0 w",
  rg: "0.1 0.2 0.3 rg", RG: "0.1 0.2 0.3 RG", g: "0.2 g", G: "0.2 G", k: "0.1 0.2 0.3 0.4 k", K: "0.1 0.2 0.3 0.4 K",
  gs: "/GS gs", Do: "/Im Do", BMC: "/Artifact BMC", Tf: "/F#31 12 Tf", Tj: "(literal) Tj", TJ: "[(literal) -20 <686578>] TJ",
  BDC: "/Span /Prop BDC",
};

const fixedShapes = [
  ["cm", 6], ["c", 6], ["Tm", 6], ["m", 2], ["l", 2], ["w", 1], ["rg", 3], ["RG", 3], ["g", 1], ["G", 1], ["k", 4], ["K", 4],
];

test("every emitted operator accepts its authoritative serialized operand shape", async () => {
  for (const [operator, content] of Object.entries(validByOperator)) {
    for (const compressed of [true, false]) {
      const report = await reportFor(content, { compressed });
      assert.ok(!contentIssues(report).includes("CONTENT_OPERANDS_INVALID"), `${operator} compressed=${compressed}`);
    }
  }
});

test("known operators reject missing, extra, and wrong-position operands", async () => {
  const zero = ["q", "Q", "h", "n", "f", "f*", "S", "B", "B*", "BT", "ET", "EMC"];
  for (const operator of zero) {
    const content = `1 ${operator}`;
    assert.ok(contentIssues(await reportFor(content, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), content);
  }
  for (const [operator, count] of fixedShapes) {
    assert.ok(contentIssues(await reportFor(`${Array(count - 1).fill("1").join(" ")} ${operator}`, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), `${operator} missing`);
    assert.ok(contentIssues(await reportFor(`${Array(count + 1).fill("1").join(" ")} ${operator}`, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), `${operator} extra`);
    for (let position = 0; position < count; position += 1) {
      const operands = Array(count).fill("1");
      operands[position] = "/wrong";
      assert.ok(contentIssues(await reportFor(`${operands.join(" ")} ${operator}`, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), `${operator} wrong ${position}`);
    }
  }
  for (const [operator, valid] of [["gs", "/GS gs"], ["Do", "/Im Do"], ["BMC", "/Artifact BMC"]]) {
    for (const content of [operator, `1 ${operator}`, `(wrong) ${operator}`]) {
      assert.ok(contentIssues(await reportFor(content, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), content);
    }
    assert.ok(!contentIssues(await reportFor(valid)).includes("CONTENT_OPERANDS_INVALID"));
  }
  for (const [content, label] of [
    ["12 /wrong Tf", "Tf name"], ["/F1 (wrong) Tf", "Tf size"], ["/F1 Tf", "Tf missing"], ["/F1 12 13 Tf", "Tf extra"],
    ["12 Tj", "Tj type"], ["(ok) 12 Tj", "Tj extra"], ["Tj", "Tj missing"],
    ["[/bad] TJ", "TJ nested name"], ["[(ok) [1]] TJ", "TJ nested array"], ["[(ok) << /x 1 >>] TJ", "TJ nested dictionary"], ["[(ok) true] TJ", "TJ nested literal"],
    ["/Span 1 BDC", "BDC property"], ["1 /Prop BDC", "BDC tag"], ["/Span BDC", "BDC missing"], ["/Span /Prop 1 BDC", "BDC extra"],
  ]) {
    assert.ok(contentIssues(await reportFor(content, { resources: "empty" })).includes("CONTENT_OPERANDS_INVALID"), label);
  }
});

test("literal and hex strings, escaped names, comments, and whitespace remain lexical data", async () => {
  const content = `% /Missing 99 Tf q Q\r\n /F#31\t12\nTf\nBT\n (q Q BT ET EMC) Tj\n[(literal) -20 <0054006a>] TJ\nET % /Missing Do\n`;
  for (const compressed of [true, false]) {
    const report = await reportFor(content, { compressed });
    assert.deepEqual(contentIssues(report), [], `compressed=${compressed}`);
  }
});

test("TL, T*, and d retain their special outside-subset machine distinction", async () => {
  for (const [content, accepted] of [["BT 24 TL T* ET", true], ["[] 0 d", true], ["BT /bad TL ET", false], ["BT 1 T* ET", false], ["[] 1 d", false], ["[1] 0 d", false]]) {
    const report = await reportFor(content);
    assert.equal(contentIssues(report).includes("CONTENT_OPERATOR_OUTSIDE_SUBSET"), !accepted, content);
    assert.equal(contentIssues(report).includes("CONTENT_OPERANDS_INVALID"), false, content);
  }
});

test("finite colors are type-valid outside the normalized color range and unknown operators stay outside the subset", async () => {
  for (const content of ["2 -1 9 rg", "2 -1 9 RG", "2 g", "2 G", "2 -1 9 4 k", "2 -1 9 4 K", "BT /F1 0 Tf /F1 -2 Tf ET"]) {
    assert.ok(!contentIssues(await reportFor(content)).includes("CONTENT_OPERANDS_INVALID"), content);
  }
  const report = await reportFor("Unknown");
  assert.ok(contentIssues(report).includes("CONTENT_OPERATOR_OUTSIDE_SUBSET"));
  assert.ok(!contentIssues(report).includes("CONTENT_OPERANDS_INVALID"));
});

test("resource names resolve through direct, indirect, and inherited page Resources", async () => {
  const content = "/GS gs /Im Do BT /F1 12 Tf ET /Span /Prop BDC EMC";
  for (const options of [{}, { indirect: true }, { inherited: true }, { inherited: true, indirect: true }]) {
    const report = await reportFor(content, options);
    assert.equal(contentIssues(report).filter((code) => code.startsWith("CONTENT_RESOURCE_")).length, 0, JSON.stringify(options));
  }
});

test("missing resource categories are unresolved for every named resource operator", async () => {
  for (const content of ["/GS gs", "/Im Do", "BT /F1 12 Tf ET", "/Span /Prop BDC EMC"]) {
    const report = await reportFor(content, { resources: "empty" });
    assert.ok(contentIssues(report).includes("CONTENT_RESOURCE_UNRESOLVED"), content);
  }
});

async function resourceFixture(content, category, resourceName, value) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  const resources = pdf.context.obj({});
  const categoryDict = pdf.context.obj({});
  categoryDict.set(PDFName.of(resourceName), typeof value === "function" ? value(pdf) : value);
  resources.set(PDFName.of(category), categoryDict);
  page.node.set(PDFName.of("Resources"), pdf.context.register(resources));
  const stream = pdf.context.flateStream(new TextEncoder().encode(content));
  page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
  return pdf.save();
}

test("resolved resource object types and subtypes are checked per operator", async () => {
  const cases = [
    ["/GS gs", "ExtGState", "GS", [PDFString.of("bad"), pdf => pdf.context.obj([1]), PDFNumber.of(1), pdf => pdf.context.stream(new Uint8Array()), pdf => pdf.context.obj({ Type: "Font" })]],
    ["/Im Do", "XObject", "Im", [PDFString.of("bad"), pdf => pdf.context.obj([1]), PDFNumber.of(1), pdf => pdf.context.stream(new Uint8Array(), { Subtype: "NotImage" }), pdf => pdf.context.obj({ Type: "Font" })]],
    ["BT /F1 12 Tf ET", "Font", "F1", [PDFString.of("bad"), pdf => pdf.context.obj([1]), PDFNumber.of(1), pdf => pdf.context.stream(new Uint8Array()), pdf => pdf.context.obj({}), pdf => pdf.context.obj({ Type: "ExtGState" })]],
    ["/Span /Prop BDC EMC", "Properties", "Prop", [PDFString.of("bad"), pdf => pdf.context.obj([1]), PDFNumber.of(1), pdf => pdf.context.stream(new Uint8Array())]],
  ];
  for (const [content, category, resourceName, values] of cases) {
    for (const value of values) {
      const bytes = await resourceFixture(content, category, resourceName, value);
      const report = await preflightPdfx4(bytes);
      const relevant = contentIssues(report);
      const expected = content.startsWith("/Im")
        ? ["CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_SUBTYPE_INVALID"]
        : ["CONTENT_RESOURCE_TYPE_INVALID"];
      assert.ok(expected.some((code) => relevant.includes(code)), `${category} ${resourceName}`);
    }
  }
});

test("Form XObjects retain the explicit outside-subset error while non-images get subtype errors", async () => {
  const form = await resourceFixture("/Form Do", "XObject", "Form", (pdf) => pdf.context.stream(new Uint8Array(), { Type: "XObject", Subtype: "Form" }));
  const formReport = await preflightPdfx4(form);
  assert.ok(contentIssues(formReport).includes("FORM_XOBJECT_OUTSIDE_SUBSET"));
  const dictionaryForm = await resourceFixture("/Form Do", "XObject", "Form", (pdf) => pdf.context.obj({ Type: "XObject", Subtype: "Form" }));
  assert.ok(contentIssues(await preflightPdfx4(dictionaryForm)).includes("CONTENT_RESOURCE_TYPE_INVALID"));
  const nonImage = await resourceFixture("/Other Do", "XObject", "Other", (pdf) => pdf.context.stream(new Uint8Array(), { Type: "XObject", Subtype: "PS" }));
  assert.ok(contentIssues(await preflightPdfx4(nonImage)).includes("CONTENT_RESOURCE_SUBTYPE_INVALID"));
});

test("dangling indirect named resources remain unresolved after serialized lookup", async () => {
  const bytes = await resourceFixture("/GS gs", "ExtGState", "GS", (pdf) => pdf.context.nextRef());
  const report = await preflightPdfx4(bytes);
  assert.ok(contentIssues(report).includes("CONTENT_RESOURCE_UNRESOLVED"));
  assert.ok(!contentIssues(report).includes("CONTENT_RESOURCE_TYPE_INVALID"));
});

test("graphics, text, and marked-content state spans 2-3 content streams", async () => {
  const cases = [
    [["q /Artifact BMC", "BT /F1 12 Tf (one) Tj", "T* (two) Tj ET EMC Q"], []],
    [["Q"], ["GRAPHICS_STATE_UNDERFLOW"]],
    [["q"], ["GRAPHICS_STATE_UNBALANCED"]],
    [["BT BT ET"], ["TEXT_OBJECT_NESTED"]],
    [["ET"], ["TEXT_OBJECT_UNDERFLOW"]],
    [["BT"], ["TEXT_OBJECT_UNCLOSED"]],
    [["1 0 0 1 0 0 Tm"], ["TEXT_OPERATOR_OUTSIDE_TEXT"]],
    [["(text) Tj"], ["TEXT_OPERATOR_OUTSIDE_TEXT"]],
    [["[(text)] TJ"], ["TEXT_OPERATOR_OUTSIDE_TEXT"]],
    [["T*"], ["TEXT_OPERATOR_OUTSIDE_TEXT"]],
    [["EMC"], ["MARKED_CONTENT_UNDERFLOW"]],
    [["/Artifact BMC", "% EMC"], ["MARKED_CONTENT_UNCLOSED"]],
  ];
  for (const [streams, expected] of cases) {
    const report = await reportFor(streams, { streams: true });
    for (const code of expected) assert.ok(contentIssues(report).includes(code), `${streams.join("|")} -> ${code}`);
    if (!expected.length) assert.deepEqual(contentIssues(report), [], streams.join("|"));
  }
});

test("operators inside strings and comments do not alter cross-stream state", async () => {
  const report = await reportFor(["q BT /F1 12 Tf (q Q BT ET EMC /missing Do) Tj", "% Q ET EMC /missing 12 Tf", "ET Q"], { streams: true });
  assert.deepEqual(contentIssues(report), [], "serialized lexical data must not execute");
});

test("configured PDF/X exporter returns a writer-verified PDF with zero content subset issues", async () => {
  const bytes = await exportPdf({ outputs: [{ id: "page", width: 200, height: 300, physical: { w: 200, h: 300, unit: "px" }, nodes: [] }] }, {
    profile: "PDF/X-4", outputIntent: printer, sourceColorProfile: srgb,
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).subarray(0, 8).toString("latin1"), "%PDF-1.6");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  assert.equal(pdf.getPages().length, 1);
  const report = await preflightPdfx4(bytes);
  assert.deepEqual(report.issues.filter((issue) => contentCodes.has(issue.code)), []);
  assert.deepEqual(report.issues, []);
  assert.equal(report.canvasWriterSubset.verified, true);
  assert.equal(report.conformant, false);
});
