import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, decodePDFRawStream } from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const SERIALIZATIONS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const CONTEXT_CODES = new Set([
  "CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_UNRESOLVED", "GRAPHICS_STATE_KEY_FORBIDDEN",
  "TRANSPARENCY_ALPHA_INVALID", "BLEND_MODE_OUTSIDE_SUBSET", "SOFT_MASK_OUTSIDE_SUBSET",
  "TRANSFER_FUNCTION_FORBIDDEN", "RENDERING_INTENT_INVALID",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (value) => PDFName.of(value);
const number = (value) => PDFNumber.of(value);
const set = (dict, key, value) => dict.set(PDFName.of(key), value);

function addContents(pdf, page, source) {
  const stream = pdf.context.flateStream(new TextEncoder().encode(source));
  page.node.set(PDFName.of("Contents"), stream);
}

function configurePage(page) {
  page.setMediaBox(0, 0, 200, 300);
  page.setTrimBox(10, 10, 190, 290);
  page.setBleedBox(0, 0, 200, 300);
}

function contextIssues(report) {
  return report.issues
    .filter(({ code }) => CONTEXT_CODES.has(code))
    .map(({ code, object }) => ({ code, object }));
}

function resolveTopology(pdf, page) {
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const resources = resolve(page.node.Resources());
  assert.ok(resources instanceof PDFDict, "serialized page resources must resolve to a dictionary");
  const extGState = resolve(resources.get(PDFName.of("ExtGState")));
  assert.ok(extGState instanceof PDFDict, "serialized ExtGState category must resolve to a dictionary");
  const rawState = extGState.get(PDFName.of("State"));
  assert.notEqual(rawState, undefined, "serialized resource must retain /State");
  const state = resolve(rawState);
  assert.ok(state instanceof PDFDict, "serialized /State must resolve to a dictionary");
  return { resolve, resources, extGState, rawState, state };
}

async function makeFixture(definition) {
  const pdf = await PDFDocument.create();
  const pageCount = definition.topology === "shared-pages" ? 2 : 1;
  const pages = Array.from({ length: pageCount }, () => pdf.addPage([200, 300]));
  pages.forEach(configurePage);

  const state = pdf.context.obj({});
  if (definition.type === "present") set(state, "Type", name("ExtGState"));
  if (definition.type === "wrong") set(state, "Type", name("Font"));
  if (definition.field) set(state, definition.field, definition.value(pdf));
  const stateValue = definition.stateStorage === "direct" ? state : pdf.context.register(state);

  const extGState = pdf.context.obj({});
  set(extGState, "State", stateValue);
  const resources = pdf.context.obj({});
  set(resources, "ExtGState", extGState);
  const resourcesValue = definition.resourcesStorage === "indirect" ? pdf.context.register(resources) : resources;
  if (definition.inherited) {
    pages.forEach((page) => page.node.delete(PDFName.of("Resources")));
    pages[0].node.Parent().set(PDFName.of("Resources"), resourcesValue);
  } else pages.forEach((page) => page.node.set(PDFName.of("Resources"), resourcesValue));

  const content = definition.repeated ? "/State gs /State gs" : "/State gs";
  pages.forEach((page) => addContents(pdf, page, content));
  return { pdf, pages, state };
}

const CASES = [
  { name: "valid-omitted-direct", type: "omitted", stateStorage: "direct", resourcesStorage: "direct" },
  { name: "valid-omitted-indirect", type: "omitted", stateStorage: "indirect", resourcesStorage: "indirect" },
  { name: "valid-omitted-inherited", type: "omitted", inherited: true, stateStorage: "indirect", resourcesStorage: "direct" },
  { name: "valid-omitted-inherited-indirect", type: "omitted", inherited: true, stateStorage: "direct", resourcesStorage: "indirect" },
  { name: "invalid-ca-omitted-direct", type: "omitted", field: "ca", value: () => number(-0.1), stateStorage: "direct", resourcesStorage: "direct", expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", object: "Page[0]/Contents[0]/gs/ca" }] },
  { name: "invalid-CA-omitted-indirect", type: "omitted", field: "CA", value: () => number(1.1), stateStorage: "indirect", resourcesStorage: "indirect", expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", object: "Page[0]/Contents[0]/gs/CA" }] },
  { name: "invalid-BM-omitted-inherited", type: "omitted", inherited: true, field: "BM", value: () => name("Multiply"), stateStorage: "indirect", resourcesStorage: "direct", expected: [{ code: "BLEND_MODE_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/gs/BM" }] },
  { name: "invalid-SMask-omitted-inherited-indirect", type: "omitted", inherited: true, field: "SMask", value: (pdf) => pdf.context.obj({ Type: name("Mask") }), stateStorage: "direct", resourcesStorage: "indirect", expected: [{ code: "SOFT_MASK_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/gs/SMask" }] },
  { name: "forbidden-key-omitted-indirect", type: "omitted", field: "TR", value: () => number(1), stateStorage: "indirect", resourcesStorage: "direct", expected: [{ code: "GRAPHICS_STATE_KEY_FORBIDDEN", object: "Page[0]/Contents[0]/gs/TR" }] },
  { name: "invalid-BM-omitted-repeated-gs", type: "omitted", repeated: true, field: "BM", value: () => name("Multiply"), stateStorage: "indirect", resourcesStorage: "indirect", expected: [
    { code: "BLEND_MODE_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/gs/BM" },
    { code: "BLEND_MODE_OUTSIDE_SUBSET", object: "Page[0]/Contents[0]/gs/BM" },
  ] },
  { name: "invalid-ca-omitted-shared-pages", type: "omitted", topology: "shared-pages", field: "ca", value: () => number(-0.1), stateStorage: "indirect", resourcesStorage: "indirect", expected: [
    { code: "TRANSPARENCY_ALPHA_INVALID", object: "Page[0]/Contents[0]/gs/ca" },
    { code: "TRANSPARENCY_ALPHA_INVALID", object: "Page[1]/Contents[0]/gs/ca" },
  ] },
  { name: "wrong-type-still-invalid", type: "wrong", stateStorage: "indirect", resourcesStorage: "indirect", expected: [{ code: "CONTENT_RESOURCE_TYPE_INVALID", object: "Page[0]/Contents[0]/gs" }] },
  { name: "type-present-invalid-ca-no-duplicate", type: "present", field: "ca", value: () => number(-0.1), stateStorage: "indirect", resourcesStorage: "indirect", expected: [{ code: "TRANSPARENCY_ALPHA_INVALID" }], typePresent: true },
  { name: "type-present-valid", type: "present", stateStorage: "indirect", resourcesStorage: "direct", expected: [], typePresent: true },
];

assert.equal(new Set(CASES.map(({ name: caseName }) => caseName)).size, CASES.length);

async function runCase(definition, serialization) {
  const fixture = await makeFixture(definition);
  const bytes = await fixture.pdf.save({ useObjectStreams: serialization.useObjectStreams });
  const beforeHash = sha256(bytes);
  const loaded = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const firstTopology = resolveTopology(loaded, loaded.getPages()[0]);
  if (definition.type === "omitted") assert.equal(firstTopology.state.has(PDFName.of("Type")), false, `${definition.name} unexpectedly has /Type`);
  if (definition.type === "present") assert.equal(firstTopology.state.get(PDFName.of("Type"))?.decodeText?.(), "ExtGState");
  if (definition.type === "wrong") assert.equal(firstTopology.state.get(PDFName.of("Type"))?.decodeText?.(), "Font");
  if (definition.topology === "shared-pages") {
    const refs = loaded.getPages().map((page) => resolveTopology(loaded, page).rawState);
    assert.ok(refs.every((value) => value instanceof PDFRef), `${definition.name} state refs must remain indirect`);
    assert.equal(new Set(refs.map((value) => value.toString())).size, 1, `${definition.name} pages must share one state ref`);
  }
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), beforeHash, `${definition.name}/${serialization.name} input bytes changed`);
  assert.deepEqual(contextIssues(first), contextIssues(second), `${definition.name}/${serialization.name} issue order changed`);
  const observed = contextIssues(first);
  if (definition.typePresent) {
    assert.deepEqual(observed.map(({ code }) => code), definition.expected.map(({ code }) => code));
    assert.ok(observed.every(({ object }) => !object.startsWith("Page[0]/Contents[0]/gs/")), `${definition.name} duplicated resource-context field issue`);
  } else assert.deepEqual(observed, definition.expected ?? [], `${definition.name}/${serialization.name} context issues`);
}

for (const definition of CASES) for (const serialization of SERIALIZATIONS) {
  test(`ExtGState resource context ${definition.name} ${serialization.name}`, async () => runCase(definition, serialization));
}

test("ExtGState resource context does not leak between serialized documents", async () => {
  const invalid = await makeFixture({ name: "isolated-invalid", type: "omitted", field: "ca", value: () => number(-0.1), stateStorage: "indirect", resourcesStorage: "indirect" });
  const valid = await makeFixture({ name: "isolated-valid", type: "omitted", stateStorage: "direct", resourcesStorage: "direct" });
  const invalidBytes = await invalid.pdf.save({ useObjectStreams: true });
  const validBytes = await valid.pdf.save({ useObjectStreams: false });
  const invalidReport = await preflightPdfx4(invalidBytes);
  const validReport = await preflightPdfx4(validBytes);
  assert.deepEqual(contextIssues(invalidReport), [{ code: "TRANSPARENCY_ALPHA_INVALID", object: "Page[0]/Contents[0]/gs/ca" }]);
  assert.deepEqual(contextIssues(validReport), []);
});
