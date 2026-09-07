import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, readFile as readBytes, stat, writeFile } from "node:fs/promises";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNull, PDFNumber, PDFRef, PDFString } from "pdf-lib";
import { exportPdf } from "./pdf.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const EVIDENCE_DIRECTORY = new URL("../../research/luna-pdfx-graphics-state-matrix-20260907/", import.meta.url);
const RETAIN_EVIDENCE = process.env.LUNA_PDFX_GRAPHICS_STATE_RETAIN_EVIDENCE === "1";
const SRGB_BYTES = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
const PRINTER_BYTES = await readFile(new URL("../../assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
const SERIALIZATIONS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const GRAPHICS_CODES = new Set([
  "CONTENT_RESOURCE_UNRESOLVED", "CONTENT_RESOURCE_TYPE_INVALID", "CONTENT_RESOURCE_SUBTYPE_INVALID",
  "GRAPHICS_STATE_UNDERFLOW", "GRAPHICS_STATE_UNBALANCED", "GRAPHICS_STATE_KEY_FORBIDDEN",
  "TRANSPARENCY_ALPHA_INVALID", "BLEND_MODE_OUTSIDE_SUBSET", "SOFT_MASK_OUTSIDE_SUBSET",
  "TRANSFER_FUNCTION_FORBIDDEN", "RENDERING_INTENT_INVALID",
]);
const RESULTS = [];
let PROFILE_GATE_RESULT = null;
const EXPORT_SHAPES = {};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const set = (dict, key, value) => dict.set(PDFName.of(key), value);
const del = (dict, key) => dict.delete(PDFName.of(key));
const name = (value) => PDFName.of(value);
const number = (value) => PDFNumber.of(value);
const issueSummary = (report) => report.issues.map(({ code, object }) => ({ code, object }));
const graphicsIssues = (report) => report.issues.filter(({ code }) => GRAPHICS_CODES.has(code)).map(({ code, object }) => ({ code, object }));
const nonGraphicsIssues = (report) => report.issues.filter(({ code }) => !GRAPHICS_CODES.has(code)).map(({ code, object }) => ({ code, object }));

const RETAINED_ARTIFACTS = new Set([
  "valid-type-extgstate/classic-xref",
  "context-type-ca-negative/classic-xref",
  "omitted-type-extgstate-observation/classic-xref",
  "wrong-type-extgstate-observation/classic-xref",
  "export-transparency-alpha-0/classic-xref",
  "export-transparency-alpha-half/classic-xref",
  "export-transparency-alpha-one/classic-xref",
  "export-transparency-stroke-half/classic-xref",
]);

function addContents(pdf, page, content) {
  const stream = pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(content)));
  page.node.set(PDFName.of("Contents"), stream);
}

function configureBoxes(page) {
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
}

function installResources(pdf, pages, entries, mode) {
  const resources = pdf.context.obj({});
  const extGState = pdf.context.obj({});
  for (const [resourceName, value] of entries) extGState.set(PDFName.of(resourceName), value);
  resources.set(PDFName.of("ExtGState"), extGState);
  const resourceValue = mode.includes("indirect") ? pdf.context.register(resources) : resources;
  if (mode.includes("inherited")) {
    for (const page of pages) page.node.delete(PDFName.of("Resources"));
    pages[0].node.Parent().set(PDFName.of("Resources"), resourceValue);
  } else for (const page of pages) page.node.set(PDFName.of("Resources"), resourceValue);
  return { resources, extGState };
}

async function stateFixture(definition) {
  const pdf = await PDFDocument.create();
  const pageCount = definition.topology === "shared-state-two-pages" ? 2 : 1;
  const pages = Array.from({ length: pageCount }, () => pdf.addPage([200, 300]));
  for (const page of pages) configureBoxes(page);
  const states = new Map();
  const makeState = (stateName, type = "ExtGState") => {
    const dictionary = pdf.context.obj({});
    if (type !== undefined) set(dictionary, "Type", name(type));
    const ref = pdf.context.register(dictionary);
    states.set(stateName, { dictionary, ref });
    return { dictionary, ref };
  };
  const primary = makeState("State", definition.type === "omitted" ? undefined : definition.type === "wrong" ? "Font" : "ExtGState");
  let entries = [["State", primary.ref]];
  let content = "/State gs";
  if (definition.topology === "switch-two-states-twice") {
    const secondary = makeState("Other", "ExtGState");
    entries = [["State", primary.ref], ["Other", secondary.ref]];
    content = "/State gs /Other gs /State gs /Other gs";
  }
  if (definition.topology === "dangling-state-resource") entries = [["State", PDFRef.of(999991, 0)]];
  const mode = definition.mode ?? "direct";
  installResources(pdf, pages, entries, mode);
  if (definition.topology === "shared-state-two-pages") {
    addContents(pdf, pages[0], "/State gs");
    addContents(pdf, pages[1], "/State gs");
  } else addContents(pdf, pages[0], content);
  return { pdf, page: pages[0], pages, state: primary.dictionary, stateRef: primary.ref, states };
}

function alphaCases(key) {
  return [
    { name: `${key}-absent`, mutate: () => {}, expected: [] },
    { name: `${key}-zero`, mutate: ({ state }) => set(state, key, number(0)), expected: [] },
    { name: `${key}-half`, mutate: ({ state }) => set(state, key, number(0.5)), expected: [] },
    { name: `${key}-one`, mutate: ({ state }) => set(state, key, number(1)), expected: [] },
    { name: `${key}-negative`, mutate: ({ state }) => set(state, key, number(-0.1)), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: key }] },
    { name: `${key}-above-one`, mutate: ({ state }) => set(state, key, number(1.1)), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: key }] },
    { name: `${key}-string`, mutate: ({ state }) => set(state, key, PDFString.of("0.5")), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: key }] },
    { name: `${key}-name`, mutate: ({ state }) => set(state, key, name("Half")), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: key }] },
    { name: `${key}-array-review`, review: true, intendedRule: "Null/namearray-like values require coordinator policy; preserve the observed checker result.", mutate: ({ pdf, state }) => set(state, key, pdf.context.obj([number(0.5)])), expected: [] },
    { name: `${key}-null-review`, review: true, intendedRule: "Null/namearray-like values require coordinator policy; preserve the observed checker result.", mutate: ({ state }) => set(state, key, PDFNull), expected: [] },
  ];
}

const FIELD_CASES = [
  ...alphaCases("ca"),
  ...alphaCases("CA"),
  { name: "BM-absent", mutate: () => {}, expected: [] },
  { name: "BM-Normal", mutate: ({ state }) => set(state, "BM", name("Normal")), expected: [] },
  { name: "BM-Compatible", mutate: ({ state }) => set(state, "BM", name("Compatible")), expected: [] },
  { name: "BM-Multiply", mutate: ({ state }) => set(state, "BM", name("Multiply")), expected: [{ code: "BLEND_MODE_OUTSIDE_SUBSET", field: "BM" }] },
  { name: "BM-namearray-review", review: true, intendedRule: "Name-array blend semantics require coordinator policy; preserve the observed checker result.", mutate: ({ pdf, state }) => set(state, "BM", pdf.context.obj([name("Multiply")])), expected: [] },
  { name: "BM-number", mutate: ({ state }) => set(state, "BM", number(1)), expected: [{ code: "BLEND_MODE_OUTSIDE_SUBSET", field: "BM" }] },
  { name: "SMask-absent", mutate: () => {}, expected: [] },
  { name: "SMask-None", mutate: ({ state }) => set(state, "SMask", name("None")), expected: [] },
  { name: "SMask-dictionary", mutate: ({ pdf, state }) => set(state, "SMask", pdf.context.obj({ Type: name("Mask") })), expected: [{ code: "SOFT_MASK_OUTSIDE_SUBSET", field: "SMask" }] },
  { name: "SMask-number", mutate: ({ state }) => set(state, "SMask", number(1)), expected: [{ code: "SOFT_MASK_OUTSIDE_SUBSET", field: "SMask" }] },
  ...["RelativeColorimetric", "AbsoluteColorimetric", "Perceptual", "Saturation"].map((value) => ({ name: `RI-${value}`, mutate: ({ state }) => set(state, "RI", name(value)), expected: [] })),
  { name: "RI-badname", mutate: ({ state }) => set(state, "RI", name("BadIntent")), expected: [{ code: "RENDERING_INTENT_INVALID", field: null }] },
  { name: "RI-string", mutate: ({ state }) => set(state, "RI", PDFString.of("RelativeColorimetric")), expected: [{ code: "RENDERING_INTENT_INVALID", field: null }] },
  { name: "TR2-absent", mutate: () => {}, expected: [] },
  { name: "TR2-Default", mutate: ({ state }) => set(state, "TR2", name("Default")), expected: [] },
  { name: "TR2-Identity", mutate: ({ state }) => set(state, "TR2", name("Identity")), expected: [{ code: "TRANSFER_FUNCTION_FORBIDDEN", field: null }] },
  { name: "TR2-number", mutate: ({ state }) => set(state, "TR2", number(1)), expected: [{ code: "TRANSFER_FUNCTION_FORBIDDEN", field: null }] },
  ...["TR", "HT", "HTP", "BG", "BG2", "UCR", "UCR2"].map((key) => ({ name: `${key}-present`, mutate: ({ state }) => set(state, key, number(1)), expected: [{ code: "GRAPHICS_STATE_KEY_FORBIDDEN", field: key }] })),
];

const CONTEXT_CASES = [
  { name: "valid-type-extgstate", type: "present", expected: [] },
  { name: "omitted-type-extgstate-observation", type: "omitted", review: true, intendedRule: "A gs-used dictionary without Type should be measured separately from the existing Type-present whole-document check." },
  { name: "wrong-type-extgstate-observation", type: "wrong", review: true, intendedRule: "A gs-used dictionary with a non-ExtGState Type is an observed resource-context case; do not infer policy beyond the existing checker result." },
  { name: "valid-indirect-resource", type: "present", mode: "indirect", expected: [] },
  { name: "valid-inherited-resource", type: "present", mode: "inherited", expected: [] },
  { name: "valid-inherited-indirect-resource", type: "present", mode: "inherited-indirect", expected: [] },
  { name: "shared-state-two-pages", type: "present", topology: "shared-state-two-pages", mode: "indirect", expected: [] },
  { name: "switch-two-states-twice", type: "present", topology: "switch-two-states-twice", mode: "indirect", expected: [] },
  { name: "dangling-state-resource", type: "present", topology: "dangling-state-resource", expectedContent: [{ code: "CONTENT_RESOURCE_UNRESOLVED", object: "Page[0]/Contents[0]/gs" }], expected: [] },
  { name: "context-type-ca-negative", type: "present", mutate: ({ state }) => set(state, "ca", number(-0.1)), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: "ca" }] },
  { name: "context-omitted-ca-negative", type: "omitted", review: true, intendedRule: "The same negative ca field is measured when Type is omitted; observe without blessing acceptance.", mutate: ({ state }) => set(state, "ca", number(-0.1)), expected: [] },
  { name: "context-wrong-ca-negative", type: "wrong", review: true, intendedRule: "The same negative ca field is measured when Type is wrong; observe without blessing acceptance.", mutate: ({ state }) => set(state, "ca", number(-0.1)), expected: [] },
  { name: "context-type-CA-above-one", type: "present", mutate: ({ state }) => set(state, "CA", number(1.1)), expected: [{ code: "TRANSPARENCY_ALPHA_INVALID", field: "CA" }] },
  { name: "context-omitted-CA-above-one", type: "omitted", review: true, intendedRule: "The same negative CA field is measured when Type is omitted; observe without blessing acceptance.", mutate: ({ state }) => set(state, "CA", number(1.1)), expected: [] },
  { name: "context-wrong-CA-above-one", type: "wrong", review: true, intendedRule: "The same negative CA field is measured when Type is wrong; observe without blessing acceptance.", mutate: ({ state }) => set(state, "CA", number(1.1)), expected: [] },
  { name: "context-type-BM-Multiply", type: "present", mutate: ({ state }) => set(state, "BM", name("Multiply")), expected: [{ code: "BLEND_MODE_OUTSIDE_SUBSET", field: "BM" }] },
  { name: "context-omitted-BM-Multiply", type: "omitted", review: true, intendedRule: "The same Multiply blend is measured when Type is omitted; observe without blessing acceptance.", mutate: ({ state }) => set(state, "BM", name("Multiply")), expected: [] },
  { name: "context-wrong-BM-Multiply", type: "wrong", review: true, intendedRule: "The same Multiply blend is measured when Type is wrong; observe without blessing acceptance.", mutate: ({ state }) => set(state, "BM", name("Multiply")), expected: [] },
  { name: "context-type-SMask-dictionary", type: "present", mutate: ({ pdf, state }) => set(state, "SMask", pdf.context.obj({ Type: name("Mask") })), expected: [{ code: "SOFT_MASK_OUTSIDE_SUBSET", field: "SMask" }] },
  { name: "context-omitted-SMask-dictionary", type: "omitted", review: true, intendedRule: "The same dictionary SMask is measured when Type is omitted; observe without blessing acceptance.", mutate: ({ pdf, state }) => set(state, "SMask", pdf.context.obj({ Type: name("Mask") })), expected: [] },
  { name: "context-wrong-SMask-dictionary", type: "wrong", review: true, intendedRule: "The same dictionary SMask is measured when Type is wrong; observe without blessing acceptance.", mutate: ({ pdf, state }) => set(state, "SMask", pdf.context.obj({ Type: name("Mask") })), expected: [] },
];

const EXPORT_CONTROLS = {
  "export-transparency-alpha-0": { fill: "#E4572E", opacity: 0 },
  "export-transparency-alpha-half": { fill: "#168557", opacity: 0.5 },
  "export-transparency-alpha-one": { fill: "#2D5FAD", opacity: 1 },
  "export-transparency-stroke-half": { stroke: { fill: "#F4C542", thickness: 6 }, opacity: 0.5 },
};

const EXPORT_CASES = Object.keys(EXPORT_CONTROLS).map((name) => ({ name, source: "export", expected: [] }));
const CASES = [...FIELD_CASES, ...CONTEXT_CASES, ...EXPORT_CASES];
assert.ok(CASES.length >= 40);
assert.equal(new Set(CASES.map(({ name }) => name)).size, CASES.length);
if (RETAIN_EVIDENCE) await mkdir(EVIDENCE_DIRECTORY, { recursive: true });

function transparencyIR(controlName = null) {
  const controls = controlName ? [[controlName, EXPORT_CONTROLS[controlName]]] : Object.entries(EXPORT_CONTROLS);
  return { outputs: [{ id: "graphics-state-page", width: 200, height: 300, physical: { w: 200, h: 300, unit: "px" }, nodes: controls.map(([id, paint], index) => ({ id, z: index, type: "rectangle", capability: { verdict: "native" }, geometry: { x: 20 + index * 42, y: 30, w: 32, h: 80 }, paint })) }] };
}

async function exportControlBytes(controlName = null) {
  return exportPdf(transparencyIR(controlName));
}

async function prepare(definition) {
  if (definition.source === "export") {
    const bytes = await exportControlBytes(definition.name);
    return { pdf: await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }), sourceBytes: bytes, stateRef: null };
  }
  const fixture = await stateFixture(definition);
  if (definition.mutate) definition.mutate({ pdf: fixture.pdf, state: fixture.state, stateRef: fixture.stateRef });
  return fixture;
}

async function runCase(definition, serialization) {
  const prepared = await prepare(definition);
  const bytes = await prepared.pdf.save({ useObjectStreams: serialization.useObjectStreams });
  const beforeHash = sha256(bytes);
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), beforeHash, `${definition.name}/${serialization.name} mutated input bytes`);
  assert.deepEqual(issueSummary(first), issueSummary(second), `${definition.name}/${serialization.name} report order changed`);
  const observedGraphics = graphicsIssues(first);
  const observedState = observedGraphics.filter(({ code }) => !code.startsWith("CONTENT_RESOURCE_"));
  if (!definition.review) {
    const expected = definition.expected ?? [];
    assert.deepEqual(observedState.map(({ code }) => code), expected.map(({ code }) => code), `${definition.name}/${serialization.name} graphics codes`);
    for (const [index, expectation] of expected.entries()) {
      const object = observedState[index].object;
      assert.ok(expectation.field ? object.endsWith(`/${expectation.field}`) : object.endsWith("/State"), `${definition.name}/${serialization.name} path ${object}`);
    }
  }
  if (definition.expectedContent) assert.deepEqual(observedGraphics.filter(({ code }) => code.startsWith("CONTENT_RESOURCE_")), definition.expectedContent);
  const record = {
    name: definition.name,
    serialization: serialization.name,
    sha256: beforeHash,
    bytes: bytes.length,
    classification: definition.review ? "coordinator-review" : "observed-fixed",
    intendedRule: definition.intendedRule ?? "Existing Type-present checker behavior is asserted exactly.",
    graphicsIssues: observedGraphics,
    nonGraphicsIssues: nonGraphicsIssues(first),
    stateRef: prepared.stateRef?.toString() ?? null,
  };
  if (RETAIN_EVIDENCE && RETAINED_ARTIFACTS.has(`${definition.name}/${serialization.name}`)) {
    await writeFile(new URL(`${definition.name}-${serialization.name}.pdf`, EVIDENCE_DIRECTORY), bytes);
  }
  RESULTS.push(record);
  return { bytes, report: first, record };
}

for (const definition of CASES) for (const serialization of SERIALIZATIONS) {
  test(`graphics state ${definition.name} ${serialization.name}`, async () => { await runCase(definition, serialization); });
}

function extractExtGStateShapes(bytes) {
  return PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }).then((pdf) => {
    const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
    const shapes = [];
    for (const [index, page] of pdf.getPages().entries()) {
      const resources = resolve(page.node.Resources());
      const ext = resources instanceof PDFDict ? resolve(resources.get(PDFName.of("ExtGState"))) : undefined;
      if (!(ext instanceof PDFDict)) continue;
      for (const [key, value] of ext.entries()) {
        const dict = resolve(value);
        if (!(dict instanceof PDFDict)) continue;
        const fields = {};
        for (const field of ["Type", "ca", "CA"]) {
          const raw = dict.get(PDFName.of(field));
          const resolved = resolve(raw);
          fields[field] = resolved instanceof PDFNumber ? resolved.asNumber() : resolved instanceof PDFName ? resolved.decodeText() : resolved?.constructor?.name ?? null;
        }
        shapes.push({ page: index, name: key.decodeText(), fields });
      }
    }
    return shapes;
  });
}

test("ordinary exportPdf transparency controls expose serialized ExtGState shapes", async () => {
  for (const [controlName, control] of Object.entries(EXPORT_CONTROLS)) {
    const bytes = await exportControlBytes(controlName);
    const shapes = await extractExtGStateShapes(bytes);
    EXPORT_SHAPES[controlName] = shapes;
    assert.ok(shapes.length > 0, `${controlName} emitted no ExtGState`);
    const values = shapes.flatMap(({ fields }) => [fields.ca, fields.CA]).filter((value) => typeof value === "number");
    const expected = control.opacity;
    assert.ok(values.some((value) => Math.abs(value - expected) < 1e-9), `${controlName} emitted ${JSON.stringify(shapes)}`);
    if (control.stroke) assert.ok(shapes.some(({ fields }) => fields.CA === expected), `${controlName} emitted no CA=${expected}`);
  }
});

test("configured PDF/X transparency export remains fail-closed", async () => {
  await assert.rejects(() => exportPdf(transparencyIR(), { profile: "PDF/X-4", outputIntent: PRINTER_BYTES, sourceColorProfile: SRGB_BYTES }), (error) => {
    PROFILE_GATE_RESULT = { code: error.code, conformant: error.preflight?.conformant ?? null, issues: error.preflight?.issues ?? [] };
    assert.match(error.code, /^CANVAS_PDF_PROFILE_/u);
    assert.equal(error.preflight.conformant, false);
    return true;
  });
});

test("graphics state matrix has exact membership and gate observation", async () => {
  assert.equal(RESULTS.length, CASES.length * SERIALIZATIONS.length);
  assert.ok(PROFILE_GATE_RESULT?.code);
  assert.equal(new Set(RESULTS.map(({ name }) => name)).size, CASES.length);
});

async function snapshot() {
  return Promise.all((await readdir(EVIDENCE_DIRECTORY)).sort().map(async (file) => ({ file, bytes: (await stat(new URL(file, EVIDENCE_DIRECTORY))).size })));
}

async function writeEvidence() {
  const retained = RESULTS.filter(({ name, serialization }) => RETAINED_ARTIFACTS.has(`${name}/${serialization}`)).map(({ name, serialization, sha256: hash, bytes }) => ({ file: `${name}-${serialization}.pdf`, name, serialization, sha256: hash, bytes }));
  await writeFile(new URL("case-results.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, executedResultCount: RESULTS.length, cases: RESULTS, exportShapes: EXPORT_SHAPES, profileGate: PROFILE_GATE_RESULT }, null, 2));
  await writeFile(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), JSON.stringify({ caseCount: CASES.length, serializationVariantCount: 2, generatedCaseCount: RESULTS.length, generatedCases: RESULTS.map(({ name, serialization, sha256: hash, bytes }) => ({ name, serialization, sha256: hash, bytes })), retainedArtifactCount: retained.length, retainedArtifacts: retained }, null, 2));
}

test("graphics state evidence generation is explicitly gated", async () => {
  if (RETAIN_EVIDENCE) await writeEvidence();
});

if (!RETAIN_EVIDENCE) test("graphics state default mode is read-only and verifies retained evidence", async () => {
  const before = await snapshot();
  const results = JSON.parse(await readBytes(new URL("case-results.json", EVIDENCE_DIRECTORY), "utf8"));
  const manifest = JSON.parse(await readBytes(new URL("sha256-manifest.json", EVIDENCE_DIRECTORY), "utf8"));
  assert.equal(results.caseCount, CASES.length);
  assert.equal(results.executedResultCount, CASES.length * 2);
  assert.equal(manifest.generatedCaseCount, CASES.length * 2);
  assert.equal(manifest.retainedArtifactCount, 8);
  assert.deepEqual(results.exportShapes, EXPORT_SHAPES);
  const current = new Map(RESULTS.map((record) => [`${record.name}/${record.serialization}`, record]));
  for (const historical of results.cases) {
    const fresh = current.get(`${historical.name}/${historical.serialization}`);
    assert.ok(fresh, `missing current matrix identity ${historical.name}/${historical.serialization}`);
    assert.deepEqual(fresh.graphicsIssues, historical.graphicsIssues);
    assert.deepEqual(fresh.nonGraphicsIssues, historical.nonGraphicsIssues);
  }
  for (const artifact of manifest.retainedArtifacts) {
    const bytes = new Uint8Array(await readBytes(new URL(artifact.file, EVIDENCE_DIRECTORY)));
    assert.equal(sha256(bytes), artifact.sha256, artifact.file);
    const record = results.cases.find(({ name, serialization }) => `${name}-${serialization}.pdf` === artifact.file);
    assert.ok(record, artifact.file);
    assert.deepEqual(graphicsIssues(await preflightPdfx4(bytes)), record.graphicsIssues, artifact.file);
  }
  assert.deepEqual(await snapshot(), before);
});
