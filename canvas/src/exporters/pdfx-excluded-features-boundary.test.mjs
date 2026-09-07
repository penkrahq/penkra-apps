import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { serializePdf16 } from "./pdf16-writer.mjs";

const GRAPH_KEYS = ["Annots", "EmbeddedFiles", "AcroForm", "XFA", "AlternatePresentations", "OCProperties"];
const CONTENT_VARIANTS = [
  { name: "raw-content", compressed: false },
  { name: "flate-content", compressed: true },
];
const GRAPH_VARIANTS = [
  { name: "absent-control", kind: "absent", expectsExclusion: false },
  { name: "direct-nonempty-object", kind: "direct", expectsExclusion: true },
  { name: "indirect-nonempty-object", kind: "indirect", expectsExclusion: true },
  { name: "reachable-nested-object", kind: "nested", expectsExclusion: true },
  { name: "unreachable-indirect-object", kind: "unreachable", expectsExclusion: true },
  { name: "empty-array", kind: "empty-array", expectsExclusion: false },
  { name: "empty-dictionary", kind: "empty-dict", expectsExclusion: true },
  { name: "null-value", kind: "null", expectsExclusion: false },
  { name: "false-value", kind: "false", expectsExclusion: true },
  { name: "zero-number-value", kind: "zero", expectsExclusion: true },
  { name: "empty-string-value", kind: "empty-string", expectsExclusion: true },
];

const GRAPH_CASES = GRAPH_KEYS.flatMap((key) => GRAPH_VARIANTS.flatMap((variant) => CONTENT_VARIANTS.map((content) => ({
  name: `graph-${key}-${variant.name}-${content.name}`,
  key,
  variant,
  content,
}))));

const BX_EX_CASES = [
  { name: "matched-known-operator", source: "BX q Q EX", operators: ["BX", "EX"] },
  { name: "matched-unknown-operator", source: "BX Unknown EX", operators: ["BX", "Unknown", "EX"] },
  { name: "unmatched-begin", source: "BX", operators: ["BX"] },
  { name: "unmatched-end", source: "EX", operators: ["EX"] },
].flatMap((definition) => CONTENT_VARIANTS.map((content) => ({ ...definition, content })));

const IMAGE_CASES = [
  { name: "ordinary-raw-image-used", resourceName: "Used", filter: undefined, source: "/Used Do", expected: [] },
  {
    name: "jpx-filter-used-image",
    resourceName: "Used",
    filter: "JPXDecode",
    source: "/Used Do",
    expected: ["Page[0]/Resources/XObject/Used/Filter"],
  },
  {
    name: "jpx-filter-unused-reachable-image",
    resourceName: "Unused",
    filter: "JPXDecode",
    source: "q Q",
    expected: ["Page[0]/Resources/XObject/Unused/Filter"],
  },
].flatMap((definition) => CONTENT_VARIANTS.map((content) => ({ ...definition, content })));

const ALL_CASE_COUNT = GRAPH_CASES.length + BX_EX_CASES.length + IMAGE_CASES.length;
assert.equal(GRAPH_CASES.length, 132);
assert.equal(BX_EX_CASES.length, 8);
assert.equal(IMAGE_CASES.length, 6);
assert.equal(ALL_CASE_COUNT, 146);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function issueProjection(report, predicate) {
  return report.issues
    .filter(predicate)
    .map(({ code, clause, object, detail }) => ({ code, clause, object, ...(detail ? { detail } : {}) }));
}

function subsetIssue(report, key) {
  return issueProjection(report, ({ code, object }) => code === "CANVAS_SUBSET_UNSUPPORTED" && object.endsWith(`/${key}`));
}

function contentIssue(report) {
  return issueProjection(report, ({ code }) => code === "CONTENT_OPERATOR_OUTSIDE_SUBSET");
}

function imageIssue(report) {
  return issueProjection(report, ({ code }) => code === "IMAGE_FILTER_OUTSIDE_SUBSET");
}

function graphValue(pdf, kind) {
  if (kind === "null") return PDFNull;
  if (kind === "false") return PDFBool.False;
  if (kind === "zero") return PDFNumber.of(0);
  if (kind === "empty-string") return PDFString.of("");
  if (kind === "empty-array") return pdf.context.obj([]);
  if (kind === "empty-dict") return pdf.context.obj({});
  return pdf.context.obj({ Marker: PDFName.of("BoundaryProbe") });
}

function addContents(pdf, page, source, compressed) {
  const bytes = new TextEncoder().encode(source);
  const stream = compressed ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes);
  page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
}

function preparePage(pdf) {
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  return page;
}

async function graphFixture(definition) {
  const pdf = await PDFDocument.create();
  const page = preparePage(pdf);
  addContents(pdf, page, "q Q", definition.content.compressed);
  const rootPath = pdf.context.trailerInfo.Root.toString();
  let expectedObject;
  if (definition.variant.kind !== "absent") {
    const value = graphValue(pdf, definition.variant.kind);
    if (definition.variant.kind === "direct" || definition.variant.kind === "empty-array"
      || definition.variant.kind === "empty-dict" || ["null", "false", "zero", "empty-string"].includes(definition.variant.kind)) {
      pdf.catalog.set(PDFName.of(definition.key), value);
      expectedObject = `${rootPath}/${definition.key}`;
    } else if (definition.variant.kind === "indirect") {
      pdf.catalog.set(PDFName.of(definition.key), pdf.context.register(value));
      expectedObject = `${rootPath}/${definition.key}`;
    } else if (definition.variant.kind === "nested") {
      pdf.catalog.set(PDFName.of("Holder"), pdf.context.obj({ [definition.key]: value }));
      expectedObject = `${rootPath}/Holder/${definition.key}`;
    } else if (definition.variant.kind === "unreachable") {
      const unreachable = pdf.context.register(pdf.context.obj({ [definition.key]: value }));
      expectedObject = `${unreachable.toString()}/${definition.key}`;
    }
  }
  const bytes = await serializePdf16(pdf);
  return { bytes, expectedObject };
}

async function imageFixture(definition) {
  const pdf = await PDFDocument.create();
  const page = preparePage(pdf);
  const imageDictionary = {
    Type: PDFName.of("XObject"),
    Subtype: PDFName.of("Image"),
    Width: PDFNumber.of(1),
    Height: PDFNumber.of(1),
    ColorSpace: PDFName.of("DeviceRGB"),
    BitsPerComponent: PDFNumber.of(8),
  };
  if (definition.filter) imageDictionary.Filter = PDFName.of(definition.filter);
  const image = pdf.context.register(pdf.context.stream(Uint8Array.of(0, 0, 0), imageDictionary));
  const xObjects = pdf.context.obj({ [definition.resourceName]: image });
  page.node.set(PDFName.of("Resources"), pdf.context.obj({ XObject: xObjects }));
  addContents(pdf, page, definition.source, definition.content.compressed);
  return { bytes: await serializePdf16(pdf), expectedObject: definition.expected[0] };
}

async function contentFixture(definition) {
  const pdf = await PDFDocument.create();
  const page = preparePage(pdf);
  addContents(pdf, page, definition.source, definition.content.compressed);
  return {
    bytes: await serializePdf16(pdf),
    expectedObjects: definition.operators.map((operator) => `Page[0]/Contents[0]/${operator}`),
  };
}

async function assertStable(bytes, observe) {
  const before = sha256(bytes);
  const first = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), before, "preflight must not mutate input bytes");
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), before, "repeated preflight must not mutate input bytes");
  assert.deepEqual(first.issues, second.issues, "repeated preflight must preserve ordered issues");
  return { report: first, hash: before, observed: observe(first) };
}

function assertReloadedTopology(bytes, definition) {
  return PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }).then((pdf) => {
    const key = PDFName.of(definition.key);
    const rootValue = pdf.catalog.get(key);
    if (definition.variant.kind === "absent") assert.equal(rootValue, undefined, `${definition.name}: absent topology`);
    if (definition.variant.kind === "nested") {
      const holder = pdf.catalog.get(PDFName.of("Holder"));
      assert.ok(holder instanceof PDFDict, `${definition.name}: nested holder topology`);
      assert.notEqual(holder.get(key), undefined, `${definition.name}: nested key topology`);
    }
    if (definition.variant.kind === "unreachable") {
      const found = [...pdf.context.enumerateIndirectObjects()].some(([, object]) => object instanceof PDFDict && object.has(key));
      assert.equal(found, true, `${definition.name}: unreachable key topology`);
    }
    if (definition.variant.kind === "indirect") assert.ok(rootValue instanceof PDFRef, `${definition.name}: indirect topology`);
  });
}

for (const definition of GRAPH_CASES) {
  test(`excluded graph feature ${definition.name}`, async () => {
    const { bytes, expectedObject } = await graphFixture(definition);
    await assertReloadedTopology(bytes, definition);
    const result = await assertStable(bytes, (report) => subsetIssue(report, definition.key));
    const expected = definition.variant.expectsExclusion
      ? [{ code: "CANVAS_SUBSET_UNSUPPORTED", clause: "6.1", object: expectedObject }]
      : [];
    assert.deepEqual(result.observed, expected, definition.name);
  });
}

for (const definition of BX_EX_CASES) {
  test(`BX/EX boundary ${definition.name}-${definition.content.name}`, async () => {
    const { bytes, expectedObjects } = await contentFixture(definition);
    const result = await assertStable(bytes, contentIssue);
    const expected = expectedObjects.map((object) => ({ code: "CONTENT_OPERATOR_OUTSIDE_SUBSET", clause: "6.1", object }));
    assert.deepEqual(result.observed, expected, definition.name);
  });
}

for (const definition of IMAGE_CASES) {
  test(`JPX image boundary ${definition.name}-${definition.content.name}`, async () => {
    const { bytes, expectedObject } = await imageFixture(definition);
    const result = await assertStable(bytes, imageIssue);
    const expected = expectedObject ? [{ code: "IMAGE_FILTER_OUTSIDE_SUBSET", clause: "6.8", object: expectedObject }] : [];
    assert.deepEqual(result.observed, expected, definition.name);
  });
}

test("excluded-feature boundary matrix has exact identity counts", () => {
  assert.equal(GRAPH_CASES.length, 132, "6 graph keys x 11 value/topology variants x 2 content encodings");
  assert.equal(BX_EX_CASES.length, 8, "4 BX/EX forms x 2 content encodings");
  assert.equal(IMAGE_CASES.length, 6, "3 image forms x 2 content encodings");
  assert.equal(ALL_CASE_COUNT, 146);
});

test("excluded-feature preflight state is isolated between negative and control documents", async () => {
  const negative = await graphFixture({
    name: "negative-state-control",
    key: "XFA",
    variant: GRAPH_VARIANTS.find(({ kind }) => kind === "direct"),
    content: CONTENT_VARIANTS[0],
  });
  const control = await graphFixture({
    name: "absent-state-control",
    key: "XFA",
    variant: GRAPH_VARIANTS.find(({ kind }) => kind === "absent"),
    content: CONTENT_VARIANTS[0],
  });
  const negativeFirst = await preflightPdfx4(negative.bytes);
  const controlAfterNegative = await preflightPdfx4(control.bytes);
  const controlFirst = await preflightPdfx4(control.bytes);
  const negativeAfterControl = await preflightPdfx4(negative.bytes);
  assert.deepEqual(subsetIssue(controlAfterNegative, "XFA"), []);
  assert.deepEqual(subsetIssue(controlFirst, "XFA"), []);
  assert.deepEqual(negativeAfterControl.issues, negativeFirst.issues);
  assert.ok(subsetIssue(negativeFirst, "XFA").length === 1);
});
