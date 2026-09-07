import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCanvasMigrationCopy, migrateCanvasDocument } from "./document-migration.mjs";
import { validateCanvasDocument } from "./canvas-schema.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

test("the complete migration pipeline produces one schema-valid canonical document", () => {
  const source = {
    version: "2.17",
    themes: { theme: ["light", "dark"] },
    variables: { ink: { type: "color", value: [{ value: "#fff" }, { value: "#000", theme: { theme: "dark" } }] } },
    children: [
      { id: "component", type: "frame", reusable: true, children: [{ id: "label", type: "text", content: "Default", fill: "$ink" }] },
      { id: "screen", type: "frame", width: 1440, height: 900, padding: { left: 10, right: 20 }, children: [
        { id: "instance", type: "ref", ref: "component", descendants: { label: { content: "Changed" } } },
        { id: "context", type: "context", content: "Reference" },
      ] },
    ],
  };
  const result = migrateCanvasDocument(source);
  assert.equal(result.document.module, "web");
  assert.equal(result.document.children[0].role, undefined);
  assert.equal(result.document.children[1].role, "route");
  assert.equal(result.document.children[1].children[0].type, "frame");
  assert.equal(result.document.children[1].children[0].children[0].content, "Changed");
  assert.equal(result.document.children[1].children[1].type, "text");
  assert.deepEqual(result.document.children[1].padding, { start: 10, end: 20 });
  assert.deepEqual(result.document.variables.ink, { tokenType: "color", cascade: [
    { value: "#fff" }, { value: "#000", when: { appearance: "dark" } },
  ] });
});

test("migration regenerates stale paragraph ranges from content and preserves usable metadata", () => {
  const source = {
    module: "generic", axes: {}, variables: {}, paragraphStyles: { body: { fontSize: 14 } }, imports: {}, flows: [],
    children: [{ id: "text", type: "text", content: "First\nSecond\nThird", paragraphs: [
      { from: -4, to: 6, style: "body", align: "center", list: { kind: "bullet" }, headingLevel: 2 },
      { from: 6, to: 999, style: "missing", align: "invalid", headingLevel: 9 },
    ], marks: [] }],
  };
  const before = structuredClone(source);
  const first = migrateCanvasDocument(source);
  const second = migrateCanvasDocument(source);
  const node = first.document.children[0];
  assert.deepEqual(node.paragraphs, [
    { from: 0, to: 6, style: "body", align: "center", list: { kind: "bullet" }, headingLevel: 2 },
    { from: 6, to: 13 },
    { from: 13, to: 18 },
  ]);
  assert.equal(node.content, before.children[0].content);
  assert.deepEqual(source, before);
  assert.deepEqual(first.notes, second.notes);
  assert.ok(first.notes.some((note) => note.includes("Regenerated paragraph ranges from content for text node `text`")));
  assert.doesNotThrow(() => validateCanvasDocument(first.document));
});

test("migration repairs each stale paragraph shape, including empty content, with deterministic nearest metadata", () => {
  const cases = [
    {
      content: "a\nb\nc",
      paragraphs: [{ from: 0, to: 2, align: "end" }, { from: 2, to: 7, headingLevel: 3 }],
      expected: [{ from: 0, to: 2, align: "end" }, { from: 2, to: 4, headingLevel: 3 }, { from: 4, to: 5, headingLevel: 3 }],
    },
    {
      content: "a\nb\nc",
      paragraphs: [{ from: 99, to: 120, align: "center" }],
      expected: [{ from: 0, to: 2, align: "center" }, { from: 2, to: 4, align: "center" }, { from: 4, to: 5, align: "center" }],
    },
    { content: "", paragraphs: [{ from: 0, to: 1, align: "center" }], expected: [] },
  ];
  for (const { content, paragraphs, expected } of cases) {
    const source = {
      module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
      children: [{ id: `text-${paragraphs.length}`, type: "text", content, paragraphs, marks: [] }],
    };
    const result = migrateCanvasDocument(source);
    const node = result.document.children[0];
    assert.deepEqual(node.paragraphs, expected);
    assert.doesNotThrow(() => validateCanvasDocument(result.document));
    assert.equal(result.notes.filter((note) => note.includes("Regenerated paragraph ranges from content")).length, 1);
  }
});

test("migration leaves already-valid paragraph ranges and metadata byte-for-byte unchanged", () => {
  const source = {
    module: "generic", axes: {}, variables: {}, paragraphStyles: { body: { fontSize: 14 } }, imports: {}, flows: [],
    children: [{ id: "valid", type: "text", content: "One\nTwo", paragraphs: [
      { from: 0, to: 4, style: "body", align: "justify", list: { kind: "ordered" }, headingLevel: 1 },
      { from: 4, to: 7, style: "body", align: "end" },
    ], marks: [] }],
  };
  const result = migrateCanvasDocument(source);
  assert.deepEqual(result.document.children[0].paragraphs, source.children[0].paragraphs);
  assert.equal(result.notes.some((note) => note.includes("text node `valid`")), false);
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration preserves legacy boolean tokens and canonicalizes annotated node sizing", () => {
  const source = {
    module: "generic", axes: {},
    variables: { visible: { type: "boolean", value: true } },
    paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "outer", type: "frame", width: "fill_container(220)", height: "fit_content(64)", enabled: "$visible",
      minWidth: "fill_container(191.2)", children: [
        { id: "label", type: "text", content: "Label", width: "fill_container(191.2)", textAlignVertical: "middle", paragraphs: [{ from: 0, to: 5 }], marks: [] },
      ],
    }],
  };
  const before = structuredClone(source);
  const result = migrateCanvasDocument(source);
  assert.deepEqual(result.document.variables.visible, { tokenType: "boolean", cascade: [{ value: true }] });
  assert.equal(result.document.children[0].width, "fill_container");
  assert.equal(result.document.children[0].height, "fit_content");
  assert.equal(result.document.children[0].minWidth, "fill_container");
  assert.deepEqual(result.document.children[0].enabled, [{ value: "${visible}" }]);
  assert.equal(result.document.children[0].children[0].width, "fill_container");
  assert.equal(result.document.children[0].children[0].textAlignVertical, "center");
  assert.ok(result.notes.some((note) => note.includes("Canonicalized 4 legacy annotated sizing value(s)")));
  assert.ok(result.notes.some((note) => note.includes("legacy middle text alignment")));
  assert.ok(result.notes.some((note) => note.includes("legacy scalar variable reference")));
  assert.deepEqual(source, before);
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration collapses one uniformly selected withdrawn axis into static cascade values", () => {
  const source = {
    module: "generic",
    themes: { portal: ["patient", "admin"] }, axes: {},
    variables: { ink: { tokenType: "color", cascade: [
      { value: "#111111" },
      { value: "#222222", when: { portal: "patient" } },
      { value: "#333333", when: { portal: "admin" } },
    ] } },
    paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "screen", type: "frame", theme: { portal: "admin" }, children: [] }],
  };
  const result = migrateCanvasDocument(source);
  assert.deepEqual(result.document.axes, {});
  assert.equal(result.document.children[0].modes, undefined);
  assert.deepEqual(result.document.variables.ink.cascade, [{ value: "#111111" }, { value: "#333333" }]);
  assert.ok(result.notes.some((note) => note.includes("Collapsed uniformly selected legacy axis `portal` at mode `admin`")));
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration materializes withdrawn component-variant axes per subtree when sibling selections differ", () => {
  const source = {
    module: "generic", themes: { state: ["default", "active"] }, axes: {},
    variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "default", type: "frame", theme: { state: "default" }, opacity: [{ value: 0.5 }, { value: 1, when: { state: "active" } }], children: [] },
      { id: "active", type: "frame", theme: { state: "active" }, opacity: [{ value: 0.5 }, { value: 1, when: { state: "active" } }], children: [] },
    ],
  };
  const result = migrateCanvasDocument(source);
  assert.deepEqual(result.document.axes, {});
  assert.deepEqual(result.document.children[0].opacity, [{ value: 0.5 }]);
  assert.deepEqual(result.document.children[1].opacity, [{ value: 0.5 }, { value: 1 }]);
  assert.ok(result.notes.some((note) => note.includes("component-variant axis `state`")));
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration preserves legacy ref variants as component enum props without cloning their trees", () => {
  const source = {
    module: "generic", themes: { state: ["default", "active"] }, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "button", type: "frame", reusable: true, children: [
        { id: "surface", type: "rectangle", fill: [{ value: "#777" }, { value: "#111", when: { state: "active" } }] },
      ] },
      { id: "normal", type: "ref", ref: "button", theme: { state: "default" } },
      { id: "pressed", type: "ref", ref: "button", theme: { state: "active" } },
    ],
  };
  const result = migrateCanvasDocument(source);
  const [button, normal, pressed] = result.document.children;
  assert.deepEqual(button.properties.state, { type: "enum", values: ["default", "active"], default: "default" });
  assert.deepEqual(button.children[0].fill, [{ value: "#777" }, { value: "#111", when: { props: { state: "active" } } }]);
  assert.equal(normal.type, "ref");
  assert.deepEqual(normal.props, { state: "default" });
  assert.deepEqual(pressed.props, { state: "active" });
  assert.ok(result.notes.some((note) => note.includes("component-variant selection(s)")));
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration materializes refs whose legacy targets are nested in an export frame", () => {
  const source = {
    module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "route", type: "frame", role: "route", width: 800, height: 600, children: [
      { id: "nested-component", type: "frame", reusable: true, width: 100, height: 40, children: [
        { id: "nested-label", type: "text", content: "Label", paragraphs: [{ from: 0, to: 5 }], marks: [] },
        { id: "empty-mark", type: "path", geometry: "   ", width: 10, height: 10, viewBox: [0, 0, 10, 10] },
      ] },
      { id: "instance", type: "ref", ref: "nested-component", x: 20, y: 30 },
    ] }],
  };
  const result = migrateCanvasDocument(source);
  const instance = result.document.children[0].children[1];
  assert.equal(instance.type, "frame");
  assert.equal(instance.id, "instance");
  assert.equal(instance.x, 20);
  assert.equal(instance.children[0].id, "instance/nested-label");
  assert.equal(instance.children[1].geometry, "M 0 0");
  assert.ok(result.notes.some((note) => note.includes("legacy target was nested inside an export frame")));
  assert.ok(result.notes.some((note) => note.includes("intentionally empty legacy path")));
  assert.doesNotThrow(() => validateCanvasDocument(result.document));
});

test("migration bounds accumulated legacy validation diagnostics for the App response boundary", () => {
  const source = {
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: Array.from({ length: 500 }, (_, index) => ({ id: `invalid-${index}`, type: "not-a-node" })),
  };
  assert.throws(() => migrateCanvasDocument(source), (error) => {
    assert.equal(error.code, "CANVAS_MIGRATION_INVALID");
    assert.match(error.message, /additional characters omitted/u);
    assert.ok(error.message.length < 1_900);
    return true;
  });
});

test("copy migration verifies the copy before renaming the untouched original", async () => {
  const calls = [];
  let createdSource;
  const api = {
    createDocument: async (input) => { calls.push(["create", input.title]); createdSource = input.source; return { id: "copy-id" }; },
    listAssets: async (id) => id === "document"
      ? [{ path: "images/a.png", sha256: "abc", size: 3, mimeType: "image/png" }]
      : [{ path: "images/a.png", sha256: "abc", size: 3, mimeType: "image/png" }],
    readAsset: async () => new Uint8Array([1, 2, 3]),
    uploadAsset: async (id, asset) => { calls.push(["asset", id, asset.path, [...asset.bytes]]); },
    getDocumentProjection: async () => ({ snapshot: { source: createdSource } }),
    renameDocument: async (...args) => { calls.push(["rename", ...args]); },
    deleteDocument: async (...args) => { calls.push(["trash", ...args]); },
  };
  const source = {
    version: "2.15", children: [{ id: "home", type: "frame", width: 720, height: 480, children: [] }],
  };
  const legacyModel = createDocumentModel(source);
  const payload = { id: "document", title: "Legacy", snapshot: { throughSequence: 7, source, state: encodeState(legacyModel) }, updates: [] };
  legacyModel.doc.destroy();
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-"));
  const result = await createCanvasMigrationCopy(api, "document", payload, { reportDirectory });
  assert.equal(result.documentId, "copy-id");
  assert.equal(result.assetCount, 1);
  assert.deepEqual(calls.map(([name]) => name), ["create", "asset", "rename"]);
  assert.deepEqual(calls[1], ["asset", "copy-id", "images/a.png", [1, 2, 3]]);
  assert.deepEqual(calls[2], ["rename", "document", "Legacy — superseded by copy-id"]);

  calls.length = 0;
  api.getDocumentProjection = async () => ({ snapshot: { source: { wrong: true } } });
  await assert.rejects(() => createCanvasMigrationCopy(api, "document", payload, { reportDirectory }), /did not round-trip/u);
  assert.deepEqual(calls.map(([name]) => name), ["create", "asset", "trash"]);
});

test("copy migration rejects source identity and asset round-trip mismatches without renaming", async () => {
  const source = { module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [] };
  const model = createDocumentModel(source);
  const payload = { id: "source", title: "Legacy", snapshot: { source, state: encodeState(model) }, updates: [] };
  model.doc.destroy();
  const calls = [];
  const api = {
    createDocument: async () => { calls.push("create"); return { id: "copy" }; },
    listAssets: async (id) => id === "source"
      ? [{ path: "images/a.png", sha256: "abc", size: 3, mimeType: "image/png" }]
      : [{ path: "images/a.png", sha256: "changed", size: 3, mimeType: "image/png" }],
    readAsset: async () => new Uint8Array([1, 2, 3]),
    uploadAsset: async () => { calls.push("asset"); },
    getDocumentProjection: async () => ({ snapshot: { source } }),
    renameDocument: async () => { calls.push("rename"); },
    deleteDocument: async () => { calls.push("trash"); },
  };
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-assets-"));
  await assert.rejects(
    createCanvasMigrationCopy(api, "different", payload, { reportDirectory }),
    /does not match source document/u,
  );
  assert.deepEqual(calls, []);
  await assert.rejects(
    createCanvasMigrationCopy(api, "source", payload, { reportDirectory }),
    /did not round-trip its asset inventory/u,
  );
  assert.deepEqual(calls, ["create", "asset", "trash"]);
});

test("migration report collision preserves the existing file and leaves source unrenamed", async () => {
  const source = { module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [] };
  const model = createDocumentModel(source);
  const payload = { id: "source", title: "Legacy", snapshot: { source, state: encodeState(model) }, updates: [] };
  model.doc.destroy();
  const calls = [];
  const api = {
    createDocument: async () => { calls.push("create"); return { id: "copy" }; },
    listAssets: async () => [],
    getDocumentProjection: async () => ({ snapshot: { source } }),
    renameDocument: async () => { calls.push("rename"); },
    deleteDocument: async (id) => { calls.push(["trash", id]); },
  };
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-collision-"));
  const reportPath = join(reportDirectory, "migration-source-to-copy.md");
  const existing = Buffer.from([1, 7, 9, 3]);
  await writeFile(reportPath, existing, { flag: "wx" });
  await assert.rejects(createCanvasMigrationCopy(api, "source", payload, { reportDirectory }), { code: "EEXIST" });
  assert.deepEqual(await readFile(reportPath), existing);
  assert.deepEqual(calls, ["create", ["trash", "copy"]]);
});

test("best-effort migration preserves existing import identifiers", () => {
  const source = { version: "2.15", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: { shared: { documentId: "another-document" } }, flows: [], children: [] };
  assert.deepEqual(migrateCanvasDocument(source).document.imports, source.imports);
});

test("legacy print migration preserves physical artwork and guides without a page role", () => {
  const frame = { id: "poster", type: "frame", role: "page", width: 600, height: 400, physical: { w: 150, h: 100, unit: "mm" }, bleed: 9, safeMargin: 12, folds: [200], children: [{ id: "mark", type: "rectangle", width: 20, height: 20, fill: "#123456" }] };
  const source = { module: "print", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [frame] };
  const result = migrateCanvasDocument(source).document;
  assert.equal(result.module, "generic");
  const expected = structuredClone(frame); delete expected.role;
  assert.deepEqual(result.children[0], expected);
  assert.equal(source.children[0].role, "page");
});

test("migration renames only node live exports and never replaces invalid content with an empty frame", async () => {
  const source = { module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: { ui: { documentId: "library", pin: "live" } }, flows: [], children: [
    { id: "art", type: "frame", export: "live", width: 100, height: 100, children: [] },
  ] };
  const result = migrateCanvasDocument(source);
  assert.equal(result.document.children[0].export, "default");
  assert.equal(result.document.imports.ui.pin, "live");
  assert.equal(source.children[0].export, "live");
  const invalid = { ...source, axes: { unknown: { modes: [{ name: "custom" }] } } };
  assert.throws(() => migrateCanvasDocument(invalid), { code: "CANVAS_MIGRATION_INVALID" });
  const model = createDocumentModel(invalid);
  const payload = { title: "Keep me", snapshot: { source: invalid, state: encodeState(model) }, updates: [] };
  model.doc.destroy();
  const calls = [];
  await assert.rejects(createCanvasMigrationCopy({ createDocument: async () => { calls.push("create"); } }, "original", payload, { reportDirectory: "/tmp/unused-migration-report" }), { code: "CANVAS_MIGRATION_INVALID" });
  assert.deepEqual(calls, []);
});
