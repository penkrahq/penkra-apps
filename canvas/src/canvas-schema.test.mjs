import assert from "node:assert/strict";
import test from "node:test";
import { assertCapabilityTotality, capabilityPathInventory, validateCanvasDocument, validateLibraryStorageDescriptor } from "./canvas-schema.mjs";

function document() { return { version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", children: [{ id: "copy", type: "text", content: "Hi", paragraphs: [{ from: 0, to: 2 }], marks: [] }] }] }; }

test("published import identities and explicit public surfaces are structural document data", () => {
  const source = document();
  source.library = { public: [{ kind: "component", id: "slide" }] };
  source.imports = { ui: { documentId: "library", updatePolicy: "follow" } };
  source.children[0].children[0].paragraphs[0].style = "ui:body";
  assert.equal(validateCanvasDocument(source).valid, true);
  source.imports.ui = { documentId: "library", updatePolicy: "pinned", releaseId: "v1", contentHash: "a".repeat(64) };
  assert.equal(validateCanvasDocument(source).valid, true);
  assert.ok(!capabilityPathInventory().includes("root.library"));
  for (const change of [
    (copy) => { copy.imports.ui.contentHash = "bad"; },
    (copy) => { copy.imports.ui.contentHash = []; },
    (copy) => { copy.imports.ui.contentHash = {}; },
    (copy) => { copy.imports.ui.contentHash = 7; },
    (copy) => { copy.imports.ui.contentHash = null; },
    (copy) => { delete copy.imports.ui.releaseId; },
    (copy) => { copy.imports.ui.pin = "live"; },
    (copy) => { copy.library.public.push({ kind: "component", id: "slide" }); },
    (copy) => { copy.library.public[0].id = "missing"; },
    (copy) => { copy.children[0].children[0].paragraphs[0].style = "absent:body"; },
  ]) {
    const invalid = structuredClone(source); change(invalid);
    assert.throws(() => validateCanvasDocument(invalid));
  }
});

test("accepted retention descriptors are strict storage-owned import data", () => {
  const source = document();
  const sha256 = "a".repeat(64);
  source.imports = { ui: {
    documentId: "library", updatePolicy: "pinned", releaseId: "v1", contentHash: sha256,
    retention: { path: `_canvas/library-content/${sha256}`, sha256, size: 0, mimeType: "application/json" },
  } };
  assert.equal(validateCanvasDocument(source).valid, true);
  const cloned = validateLibraryStorageDescriptor(source.imports.ui.retention);
  assert.deepEqual(cloned, source.imports.ui.retention);
  assert.notEqual(cloned, source.imports.ui.retention);
  for (const mutate of [
    value => { value.size = -1; },
    value => { value.size = 1.5; },
    value => { value.path = "other"; },
    value => { value.extra = true; },
    value => { value.mimeType = 3; },
    value => { value.sha256 = "b".repeat(64); },
  ]) {
    const invalid = structuredClone(source); mutate(invalid.imports.ui.retention);
    assert.throws(() => validateCanvasDocument(invalid));
    assert.throws(() => validateLibraryStorageDescriptor(invalid.imports.ui.retention), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  for (const sha256 of [[], {}, 7, null]) {
    const invalid = structuredClone(source);
    invalid.imports.ui.retention.sha256 = sha256;
    assert.throws(() => validateLibraryStorageDescriptor(invalid.imports.ui.retention), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  assert.deepEqual(validateLibraryStorageDescriptor(source.imports.ui.retention), source.imports.ui.retention);
});

test("library publication heads are optional strict transport metadata", () => {
  const source = document();
  const contentHash = "a".repeat(64);
  source.library = {
    public: [{ kind: "component", id: "slide" }],
    publication: {
      releaseId: "r1",
      contentHash,
      storage: { path: `_canvas/library-content/${contentHash}`, sha256: contentHash, size: 12, mimeType: "application/json" },
    },
  };
  assert.equal(validateCanvasDocument(source).valid, true);
  for (const mutate of [
    value => { value.extra = true; },
    value => { value.releaseId = []; },
    value => { value.releaseId = {}; },
    value => { value.releaseId = ""; },
    value => { value.contentHash = {}; },
    value => { value.contentHash = "A".repeat(64); },
    value => { value.contentHash = "bad"; },
    value => { value.storage.extra = true; },
    value => { value.storage.sha256 = 7; },
    value => { value.storage.path = "other"; },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid.library.publication);
    assert.throws(() => validateCanvasDocument(invalid));
  }
  const withoutPublication = structuredClone(source);
  delete withoutPublication.library.publication;
  assert.equal(validateCanvasDocument(withoutPublication).valid, true);
});

test("retention requires an accepted identity while discovery follow may omit it", () => {
  const source = document();
  const contentHash = "a".repeat(64);
  const retention = { path: `_canvas/library-content/${contentHash}`, sha256: contentHash, size: 0 };
  source.imports = { ui: { documentId: "library", updatePolicy: "follow" } };
  assert.equal(validateCanvasDocument(source).valid, true);
  source.imports.ui = { documentId: "library", updatePolicy: "follow", releaseId: "r1", contentHash, retention };
  assert.equal(validateCanvasDocument(source).valid, true);
  for (const mutate of [
    value => { delete value.releaseId; delete value.contentHash; },
    value => { delete value.releaseId; },
    value => { delete value.contentHash; },
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid.imports.ui);
    assert.throws(() => validateCanvasDocument(invalid));
  }
});

test("legacy live and exact pin records reject retention without an accepted release identity", () => {
  const source = document();
  const contentHash = "a".repeat(64);
  source.imports = { ui: {
    documentId: "library", pin: "live",
    retention: { path: `_canvas/library-content/${contentHash}`, sha256: contentHash, size: 0 },
  } };
  assert.throws(() => validateCanvasDocument(source));
  source.imports.ui = {
    documentId: "library", pin: "exact", version: 1,
    retention: { path: `_canvas/library-content/${contentHash}`, sha256: contentHash, size: 0 },
  };
  assert.throws(() => validateCanvasDocument(source));
});

test("physical sizing, bleed and advisory guides belong to frames in any module", () => {
  for (const module of ["generic", "deck", "web", "mobile"]) {
    const source = document();
    source.module = module;
    delete source.children[0].role;
    Object.assign(source.children[0], { width: 300, height: 200, physical: { w: 150, h: 100, unit: "mm" }, bleed: 9, safeMargin: 12, folds: [100, 200] });
    assert.equal(validateCanvasDocument(source).valid, true);
    source.children[0].physical.w = 0;
    assert.throws(() => validateCanvasDocument(source), /finite positive/);
  }
});

test("node export override accepts default/image and rejects the withdrawn live value", () => {
  const source = document();
  for (const value of ["default", "image"]) {
    source.children[0].export = value;
    assert.equal(validateCanvasDocument(source).valid, true);
  }
  source.children[0].export = "live";
  assert.throws(() => validateCanvasDocument(source));
});

test("canonical schema validates roots, rich text, roles, refs and flows", () => {
  assert.equal(validateCanvasDocument(document()).valid, true);
  const bad = document(); bad.children[0].children[0].marks = [{ type: "fill", from: 0, to: 4, value: "red" }];
  assert.throws(() => validateCanvasDocument(bad), /inside/);
});

test("axes are appearance and viewport, not interaction or component props", () => {
  const source = document();
  source.axes = { appearance: { modes: [{ name: "light" }] }, viewport: { modes: [{ name: "wide" }] } };
  assert.equal(validateCanvasDocument(source).valid, true);
  for (const name of ["interaction", "kind"]) {
    const invalid = structuredClone(source);
    invalid.axes[name] = { modes: [{ name: "default" }] };
    assert.throws(() => validateCanvasDocument(invalid));
  }
});

test("generated nested schemas reject malformed geometry, physical sizes and rich-text records", () => {
  const geometry = document(); geometry.children[0].x = "12px";
  assert.throws(() => validateCanvasDocument(geometry), /slide\.x must be a finite number/);
  const physical = document(); physical.children[0].physical = { w: 13.333, h: 7.5 };
  assert.throws(() => validateCanvasDocument(physical), /physical\.unit is required/);
  const mark = document(); mark.children[0].children[0].marks = [{ type: "weight", from: 0, to: 2, value: 700, sticky: true }];
  assert.throws(() => validateCanvasDocument(mark), /marks\[0\]\.sticky is not allowed/);
});

test("canonical schema enforces role, notes, node modes and flow relationships", () => {
  const value = document();
  value.children.push({ id: "notes", type: "text", notesFor: "slide", content: "Speak", marks: [], paragraphs: [{ from: 0, to: 5 }] });
  value.children.push({ id: "next", type: "frame", role: "slide", children: [] });
  value.flows.push({ id: "go", from: "slide", to: "next", trigger: { kind: "tap", source: { path: [], node: "copy" } } });
  assert.equal(validateCanvasDocument(value).valid, true);
  value.flows[0].trigger.source.node = "notes";
  assert.throws(() => validateCanvasDocument(value), /must live inside slide/);
});

test("capability totality is generated from the canonical inventory", () => {
  assert.equal(capabilityPathInventory().length, 142);
  assert.equal(capabilityPathInventory().includes("roles.page"), false);
  const properties = Object.fromEntries(capabilityPathInventory().map((path) => [path, { verdict: "native" }]));
  assert.equal(assertCapabilityTotality({ properties }), true);
  properties["properties.fill"] = { verdict: null, status: "unverified" };
  assert.throws(() => assertCapabilityTotality({ properties }), /unverified=properties\.fill/);
  properties["properties.fill"] = { verdict: "native", status: "unverified" };
  assert.throws(() => assertCapabilityTotality({ properties }), /unverified=properties\.fill/);
  assert.ok(capabilityPathInventory().includes("properties.fill.image"));
  assert.ok(capabilityPathInventory().includes("root.lang"));
  assert.ok(capabilityPathInventory().includes("properties.layout"));
  assert.ok(capabilityPathInventory().includes("roles.slide"));
  assert.ok(capabilityPathInventory().includes("nodes.frame"));
  assert.ok(capabilityPathInventory().includes("relationships.ref"));
  assert.equal(capabilityPathInventory().includes("image"), false);
});

test("validation rejects mutual component recursion before resolver expansion", () => {
  const value = document();
  value.children.unshift(
    { id: "a", type: "frame", children: [{ id: "a-to-b", type: "ref", ref: "b" }] },
    { id: "b", type: "frame", children: [{ id: "b-to-a", type: "ref", ref: "a" }] },
  );
  value.children[2].children.push({ id: "use-a", type: "ref", ref: "a" });
  assert.throws(() => validateCanvasDocument(value), /Component ref cycle/);
});

test("only frames can carry export roles", () => {
  const value = document();
  value.children[0].role = undefined;
  value.children.push({ id: "not-a-frame", type: "group", role: "slide", children: [] });
  assert.throws(() => validateCanvasDocument(value), /role may only appear on a frame/);
});

test("same-type overlapping marks are invalid because writes must clip", () => {
  const value = document();
  value.children[0].children[0].marks = [
    { type: "fill", from: 0, to: 2, value: "red" },
    { type: "fill", from: 1, to: 2, value: "blue" },
  ];
  assert.throws(() => validateCanvasDocument(value), /overlap with the same type/);
});

test("variables carry tokenType beside cascade and node modes name an axis mode", () => {
  const value = document();
  value.axes.appearance = { modes: [{ name: "light" }, { name: "dark" }] };
  value.variables.brand = { tokenType: "color", cascade: [{ value: "#fff" }, { value: "#000", when: { appearance: "dark" } }] };
  value.children[0].modes = { appearance: "dark" };
  assert.equal(validateCanvasDocument(value).valid, true);
  value.variables.brand = [{ value: "#fff" }];
  assert.throws(() => validateCanvasDocument(value), /tokenType and a non-empty cascade/);
});

test("flow instance paths validate every ref and final component descendant", () => {
  const value = document();
  value.children.unshift({ id: "button-component", type: "frame", children: [{ id: "button-label", type: "text", content: "Go", marks: [], paragraphs: [{ from: 0, to: 2 }] }] });
  value.children[1].children.push({ id: "button", type: "ref", ref: "button-component" });
  value.children.push({ id: "next", type: "frame", role: "slide", children: [] });
  value.flows = [{ id: "go", from: "slide", to: "next", trigger: { kind: "tap", source: { path: ["button"], node: "button-label" } } }];
  assert.equal(validateCanvasDocument(value).valid, true);
  value.flows[0].trigger.source.node = "missing";
  assert.throws(() => validateCanvasDocument(value), /outside the final component/);
});

test("component bindings, conditions and instance props are checked in lexical scope", () => {
  const value = document();
  value.children.unshift({
    id: "button", type: "frame",
    properties: {
      label: { type: "string", default: "Go" },
      count: { type: "number", min: 0 },
      tone: { type: "enum", values: ["primary", "secondary"], default: "primary" },
    },
    visible: { op: "gt", arg: { prop: "count" }, value: 0 },
    children: [{ id: "label", type: "text", bind: { content: "$props.label" }, content: "", marks: [], paragraphs: [] }],
  });
  value.children[1].children.push({ id: "use-button", type: "ref", ref: "button", props: { label: "Continue", count: 2, tone: "secondary" } });
  assert.equal(validateCanvasDocument(value).valid, true);
  value.children[1].children[1].props.count = "2";
  assert.throws(() => validateCanvasDocument(value), /does not satisfy number/);
  value.children[1].children[1].props.count = 2;
  value.children[0].children[0].bind.content = "$props.missing";
  assert.throws(() => validateCanvasDocument(value), /undeclared property missing/);
});

test("cascades validate axis modes and typed prop conditions", () => {
  const value = document();
  value.axes.appearance = { modes: [{ name: "light" }, { name: "dark" }] };
  value.children[0].properties = { active: { type: "boolean", default: false } };
  value.children[0].fill = [
    { value: "#ffffff" },
    { value: "#000000", when: { appearance: "dark", props: { active: true } } },
  ];
  assert.equal(validateCanvasDocument(value).valid, true);
  value.children[0].fill[1].when.appearance = "missing";
  assert.throws(() => validateCanvasDocument(value), /unknown mode appearance:missing/);
});
