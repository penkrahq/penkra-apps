import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString } from "pdf-lib";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { serializePdf16 } from "./pdf16-writer.mjs";

const CONTENTS = [
  { name: "raw-content", compressed: false },
  { name: "flate-content", compressed: true },
];
const RESOURCE_TOPOLOGIES = [
  { name: "direct-resources", inherited: false, resourcesIndirect: false },
  { name: "indirect-resources", inherited: false, resourcesIndirect: true },
  { name: "inherited-resources", inherited: true, resourcesIndirect: false },
];
const TYPES = ["present", "omitted"];
const UNKNOWN_KEYS = ["LW", "LC", "LJ", "ML", "D", "Font", "OP", "op", "OPM", "SA", "SM", "AIS", "TK"];
const UNKNOWN_VALUES = [
  { name: "numeric", key: "UnknownNumeric", make: () => PDFNumber.of(0) },
  { name: "name", key: "UnknownName", make: () => PDFName.of("Unexpected") },
  { name: "dictionary", key: "UnknownDict", make: (pdf) => pdf.context.obj({ Marker: PDFName.of("Unexpected") }) },
];
const SPECIFIC_KEYS = [
  { name: "TR", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/TR" },
  { name: "HT", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/HT" },
  { name: "HTP", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/HTP" },
  { name: "BG", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/BG" },
  { name: "BG2", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/BG2" },
  { name: "UCR", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/UCR" },
  { name: "UCR2", value: () => PDFNumber.of(1), code: "GRAPHICS_STATE_KEY_FORBIDDEN", suffix: "/UCR2" },
  { name: "TR2", value: () => PDFName.of("Identity"), code: "TRANSFER_FUNCTION_FORBIDDEN", suffix: "" },
  { name: "RI", value: () => PDFName.of("Unexpected"), code: "RENDERING_INTENT_INVALID", suffix: "" },
  { name: "ca", value: () => PDFNumber.of(-0.1), code: "TRANSPARENCY_ALPHA_INVALID", suffix: "/ca" },
  { name: "CA", value: () => PDFNumber.of(1.1), code: "TRANSPARENCY_ALPHA_INVALID", suffix: "/CA" },
  { name: "BM", value: () => PDFName.of("Multiply"), code: "BLEND_MODE_OUTSIDE_SUBSET", suffix: "/BM" },
  { name: "SMask", value: (pdf) => pdf.context.obj({ Type: PDFName.of("Mask") }), code: "SOFT_MASK_OUTSIDE_SUBSET", suffix: "/SMask" },
];

assert.equal(UNKNOWN_KEYS.length, 13);
assert.equal(UNKNOWN_VALUES.length, 3);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const issueProjection = (report) => report.issues
  .filter(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET"
    || code === "GRAPHICS_STATE_KEY_FORBIDDEN"
    || code === "TRANSFER_FUNCTION_FORBIDDEN"
    || code === "RENDERING_INTENT_INVALID"
    || code === "TRANSPARENCY_ALPHA_INVALID"
    || code === "BLEND_MODE_OUTSIDE_SUBSET"
    || code === "SOFT_MASK_OUTSIDE_SUBSET"
    || code === "CONTENT_RESOURCE_TYPE_INVALID")
  .map(({ code, clause, object }) => ({ code, clause, object }));

function configurePage(page) {
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
}

function addContents(pdf, page, source, compressed) {
  const bytes = new TextEncoder().encode(source);
  const stream = compressed ? pdf.context.flateStream(bytes) : pdf.context.stream(bytes);
  page.node.set(PDFName.of("Contents"), pdf.context.register(stream));
}

async function makeStateFixture({ type = "present", topology, content, field, value, unused = false }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  configurePage(page);
  const state = pdf.context.obj({});
  if (type === "present") state.set(PDFName.of("Type"), PDFName.of("ExtGState"));
  if (type === "wrong") state.set(PDFName.of("Type"), PDFName.of("Font"));
  if (field && !unused) state.set(PDFName.of(field), value(pdf));
  const stateRef = pdf.context.register(state);
  const extGState = pdf.context.obj({ State: stateRef });
  let unusedRef;
  if (unused) {
    const unusedState = pdf.context.obj({ Type: PDFName.of("ExtGState"), [field]: value(pdf) });
    unusedRef = pdf.context.register(unusedState);
    extGState.set(PDFName.of("Unused"), unusedRef);
  }
  const resources = pdf.context.obj({ ExtGState: extGState });
  const resourceValue = topology.resourcesIndirect ? pdf.context.register(resources) : resources;
  if (topology.inherited) {
    page.node.delete(PDFName.of("Resources"));
    page.node.Parent().set(PDFName.of("Resources"), resourceValue);
  } else page.node.set(PDFName.of("Resources"), resourceValue);
  addContents(pdf, page, "/State gs", content.compressed);
  return { bytes: await serializePdf16(pdf), stateRef, unusedRef };
}

function pageStatePath(topology, field) {
  return topology.inherited
    ? `1 0 R/Resources/ExtGState/State/${field}`
    : `1 0 R/Kids[0]/Resources/ExtGState/State/${field}`;
}

async function stableReport(bytes) {
  const before = sha256(bytes);
  const first = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), before, "preflight changed input bytes");
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), before, "repeated preflight changed input bytes");
  assert.deepEqual(first.issues, second.issues, "repeated preflight changed ordered issues");
  return first;
}

async function assertTopology(bytes, type) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const page = pdf.getPages()[0];
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  let resources = resolve(page.node.Resources());
  if (resources === undefined) resources = resolve(page.node.Parent().get(PDFName.of("Resources")));
  assert.ok(resources instanceof PDFDict, "serialized resources must resolve");
  const ext = resolve(resources.get(PDFName.of("ExtGState")));
  assert.ok(ext instanceof PDFDict, "serialized ExtGState category must resolve");
  const state = resolve(ext.get(PDFName.of("State")));
  assert.ok(state instanceof PDFDict, "serialized State must resolve");
  assert.equal(state.get(PDFName.of("Type"))?.decodeText?.(), type === "present" ? "ExtGState" : undefined);
}

for (const unknownKey of UNKNOWN_KEYS) for (const type of TYPES) for (const topology of RESOURCE_TOPOLOGIES) for (const content of CONTENTS) {
  test(`ExtGState unknown key ${unknownKey} type-${type} ${topology.name} ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type, topology, content, field: unknownKey, value: () => PDFNumber.of(0) });
    await assertTopology(fixture.bytes, type);
    const report = await stableReport(fixture.bytes);
    const expectedObject = type === "present"
      ? pageStatePath(topology, unknownKey)
      : `Page[0]/Contents[0]/gs/${unknownKey}`;
    assert.deepEqual(issueProjection(report).filter(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET"), [
      { code: "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET", clause: "6.1", object: expectedObject },
    ]);
    assert.equal(issueProjection(report).some(({ code }) => code === "CONTENT_RESOURCE_TYPE_INVALID"), false);
  });
}

for (const unknown of UNKNOWN_VALUES) for (const type of TYPES) for (const topology of RESOURCE_TOPOLOGIES) for (const content of CONTENTS) {
  test(`ExtGState unknown ${unknown.name} value type-${type} ${topology.name} ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type, topology, content, field: unknown.key, value: unknown.make });
    await assertTopology(fixture.bytes, type);
    const report = await stableReport(fixture.bytes);
    const expectedObject = type === "present"
      ? pageStatePath(topology, unknown.key)
      : `Page[0]/Contents[0]/gs/${unknown.key}`;
    assert.deepEqual(issueProjection(report).filter(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET"), [
      { code: "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET", clause: "6.1", object: expectedObject },
    ]);
  });
}

for (const content of CONTENTS) {
  test(`typed unused ExtGState dictionaries are checked ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type: "present", topology: RESOURCE_TOPOLOGIES[0], content, field: "LW", value: () => PDFString.of("bad-width"), unused: true });
    const report = await stableReport(fixture.bytes);
    const outside = issueProjection(report).filter(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET");
    assert.deepEqual(outside, [{ code: "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET", clause: "6.1", object: "1 0 R/Kids[0]/Resources/ExtGState/Unused/LW" }]);
  });
}

for (const specific of SPECIFIC_KEYS) for (const content of CONTENTS) {
  test(`ExtGState existing key ${specific.name} preserves specific check ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type: "present", topology: RESOURCE_TOPOLOGIES[0], content, field: specific.name, value: specific.value });
    const report = await stableReport(fixture.bytes);
    const observed = issueProjection(report);
    assert.equal(observed.some(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET"), false, `${specific.name} received duplicate outside-subset issue`);
    assert.deepEqual(observed.filter(({ code }) => code === specific.code), [{
      code: specific.code,
      clause: specific.code === "GRAPHICS_STATE_KEY_FORBIDDEN" ? "6.13" : specific.code === "TRANSFER_FUNCTION_FORBIDDEN" ? "6.13" : specific.code === "RENDERING_INTENT_INVALID" ? "6.23" : "6.20",
      object: specific.suffix ? pageStatePath(RESOURCE_TOPOLOGIES[0], specific.name) : "1 0 R/Kids[0]/Resources/ExtGState/State",
    }]);
  });
}

for (const topology of RESOURCE_TOPOLOGIES) for (const content of CONTENTS) {
  test(`valid omitted-Type ExtGState remains valid ${topology.name} ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type: "omitted", topology, content });
    const report = await stableReport(fixture.bytes);
    assert.equal(issueProjection(report).length, 0);
  });
  test(`wrong-Type ExtGState remains resource-invalid ${topology.name} ${content.name}`, async () => {
    const fixture = await makeStateFixture({ type: "wrong", topology, content, field: "LW", value: () => PDFString.of("bad-width") });
    const report = await stableReport(fixture.bytes);
    assert.deepEqual(issueProjection(report).filter(({ code }) => code === "CONTENT_RESOURCE_TYPE_INVALID"), [{
      code: "CONTENT_RESOURCE_TYPE_INVALID", clause: "6.3", object: "Page[0]/Contents[0]/gs",
    }]);
    assert.equal(issueProjection(report).some(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET"), false);
  });
}

test("ordinary writer alpha ExtGState remains valid under the new key allowlist", async () => {
  const bytes = await exportPdf({ outputs: [{
    id: "alpha-page", width: 200, height: 300, physical: { w: 200, h: 300, unit: "px" }, bleed: 9,
    nodes: [{ id: "alpha-rectangle", z: 0, type: "rectangle", capability: { verdict: "native" }, geometry: { x: 20, y: 30, w: 100, h: 80 }, paint: { fill: "#168557", opacity: 0.5 } }],
  }] });
  const report = await stableReport(bytes);
  assert.equal(issueProjection(report).length, 0);
});

test("ExtGState unknown-key state does not leak into a later valid document", async () => {
  const negative = await makeStateFixture({ type: "omitted", topology: RESOURCE_TOPOLOGIES[1], content: CONTENTS[0], field: "LW", value: () => PDFString.of("bad-width") });
  const valid = await makeStateFixture({ type: "omitted", topology: RESOURCE_TOPOLOGIES[2], content: CONTENTS[1] });
  const negativeReport = await stableReport(negative.bytes);
  const validReport = await stableReport(valid.bytes);
  assert.equal(issueProjection(negativeReport).filter(({ code }) => code === "GRAPHICS_STATE_KEY_OUTSIDE_SUBSET").length, 1);
  assert.equal(issueProjection(validReport).length, 0);
});

test("ExtGState key boundary matrix has exact case membership", () => {
  const unknownCases = UNKNOWN_KEYS.length * TYPES.length * RESOURCE_TOPOLOGIES.length * CONTENTS.length;
  const valueCases = UNKNOWN_VALUES.length * TYPES.length * RESOURCE_TOPOLOGIES.length * CONTENTS.length;
  const unusedCases = CONTENTS.length;
  const specificCases = SPECIFIC_KEYS.length * CONTENTS.length;
  const contextCases = RESOURCE_TOPOLOGIES.length * CONTENTS.length * 2;
  assert.equal(unknownCases, 156);
  assert.equal(valueCases, 36);
  assert.equal(unusedCases, 2);
  assert.equal(specificCases, 26);
  assert.equal(contextCases, 12);
  assert.equal(unknownCases + valueCases + unusedCases + specificCases + contextCases + 2, 234);
});
