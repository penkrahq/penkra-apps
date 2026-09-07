import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createLibraryRelease, validateRetainedLibraryItem } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";

const axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };

function identity(release) {
  return { libraryId: release.libraryId, releaseId: release.releaseId, contentHash: release.contentHash };
}

function importRecord(release, updatePolicy = "pinned") {
  return { documentId: release.libraryId, updatePolicy, releaseId: release.releaseId, contentHash: release.contentHash };
}

function source(imports, children = [], extra = {}) {
  return { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports, flows: [], children, ...extra };
}

async function retain(release, requested, releases = new Map(), assets = new Map()) {
  return prepareLibraryRetention(release, requested, {
    resolveRelease: async (record) => {
      const selected = [...releases.values()].find((candidate) => candidate.libraryId === record.documentId
        && candidate.releaseId === record.releaseId && candidate.contentHash === record.contentHash);
      if (!selected) throw Object.assign(new Error("missing fixture release"), { code: "CANVAS_LIBRARY_RELEASE_MISSING" });
      return selected;
    },
    readAsset: async (releaseIdentity, descriptor) => {
      const bytes = assets.get(`${releaseIdentity.libraryId}:${descriptor.path}`);
      if (!bytes) throw Object.assign(new Error("missing fixture asset"), { code: "CANVAS_LIBRARY_ASSET_MISSING" });
      return new Uint8Array(bytes);
    },
  });
}

function libraryDocument() {
  return {
    version: "2.17", module: "generic", axes,
    variables: {
      privateInk: { tokenType: "color", cascade: [{ value: "#111111" }, { value: "#eeeeee", when: { appearance: "dark" } }] },
      accent: { tokenType: "color", cascade: [{ value: "${privateInk}" }] },
    },
    paragraphStyles: { body: { fill: "${accent}", fontSize: 18 }, privateStyle: { fill: "#101010", fontSize: 3 } },
    imports: {},
    library: { public: [{ kind: "variable", id: "accent" }, { kind: "paragraphStyle", id: "body" }, { kind: "component", id: "card" }, { kind: "component", id: "locked" }] },
    children: [
      { id: "card", type: "frame", fill: "${accent}", children: [{ id: "label", type: "text", content: "Library card", style: "body", paragraphs: [{ from: 0, to: 12 }] }] },
      { id: "locked", type: "frame", modes: { appearance: "light" }, fill: "${accent}", children: [] },
      { id: "privateComponent", type: "frame", fill: "#bad", children: [] },
    ],
  };
}

async function mainFixture() {
  const release = createLibraryRelease(libraryDocument(), { libraryId: "ui", releaseId: "one" });
  const retention = await retain(release, [
    { kind: "variable", id: "accent" }, { kind: "paragraphStyle", id: "body" }, { kind: "component", id: "card" }, { kind: "component", id: "locked" },
  ], new Map([[release.libraryId, release]]));
  return { release, retention };
}

test("retained adapter resolves qualified variable, style, and component with source identity and modes", async () => {
  const { release, retention } = await mainFixture();
  const consumer = source({ ui: importRecord(release) }, [
    { id: "paint", type: "rectangle", fill: "${ui:accent}" },
    { id: "local", type: "text", content: "Local", style: "ui:body", paragraphs: [{ from: 0, to: 5 }] },
    { id: "use", type: "ref", ref: "ui:card" },
    { id: "lockedUse", type: "ref", ref: "ui:locked" },
  ], {
    axes, variables: { accent: { tokenType: "color", cascade: [{ value: "#ff0000" }] } },
    paragraphStyles: { body: { fill: "#00ff00", fontSize: 99 } },
  });
  const before = structuredClone(consumer);
  const built = buildRetainedCanvasImports(consumer, new Map([["ui", retention]]));
  const resolved = resolveCanvasDocument(consumer, { imports: built.imports, modes: { appearance: "dark" } }).document;
  assert.equal(resolved.children[0].fill, "#eeeeee");
  assert.deepEqual(resolved.paragraphStyles[resolved.children[1].style], { fill: "#eeeeee", fontSize: 18 });
  assert.equal(resolved.children[2].children[0].content, "Library card");
  assert.equal(resolved.children[3].fill, "#111111", "source-local light override wins over consumer dark mode");
  assert.deepEqual(consumer, before);
  assert.deepEqual(built.imports.ui.release.publicItems.map(({ kind, id }) => `${kind}:${id}`), ["component:card", "component:locked", "paragraphStyle:body", "variable:accent"]);
  assert.equal(built.imports.ui.document.variables.privateInk.cascade[0].value, "#111111");
});

test("private direct references reject while retained local private closure remains resolvable", async () => {
  const { release, retention } = await mainFixture();
  const privateRef = source({ ui: importRecord(release) }, [{ id: "bad", type: "rectangle", fill: "${ui:privateInk}" }]);
  assert.throws(() => buildRetainedCanvasImports(privateRef, new Map([["ui", retention]])), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  const privateStyle = source({ ui: importRecord(release) }, [{ id: "bad", type: "text", content: "x", style: "ui:privateStyle", paragraphs: [{ from: 0, to: 1 }] }]);
  assert.throws(() => buildRetainedCanvasImports(privateStyle, new Map([["ui", retention]])), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
});

test("two-level retained dependencies preserve colliding asset names and source namespaces", async () => {
  const oneBytes = Uint8Array.of(1, 2, 3); const twoBytes = Uint8Array.of(4, 5, 6);
  const one = createLibraryRelease({ ...source({}, [{ id: "badge", type: "frame", fill: { type: "image", url: "shared.png" } }]), library: { public: [{ kind: "component", id: "badge" }] } }, { libraryId: "one", releaseId: "r1", assets: [{ path: "shared.png", size: 3, sha256: sha(oneBytes) }] });
  const middleDocument = { ...source({ one: importRecord(one) }, [{ id: "wrap", type: "frame", children: [{ id: "inner", type: "ref", ref: "one:badge" }] }]), library: { public: [{ kind: "component", id: "wrap" }] } };
  const middle = createLibraryRelease(middleDocument, { libraryId: "middle", releaseId: "r1", dependencies: [{ alias: "one", ...identity(one) }] });
  const two = createLibraryRelease({ ...source({}, [{ id: "badge", type: "frame", fill: { type: "image", url: "shared.png" } }]), library: { public: [{ kind: "component", id: "badge" }] } }, { libraryId: "two", releaseId: "r1", assets: [{ path: "shared.png", size: 3, sha256: sha(twoBytes) }] });
  const root = createLibraryRelease({ ...source({ middle: importRecord(middle), two: importRecord(two) }, [{ id: "scene", type: "frame", children: [{ id: "a", type: "ref", ref: "middle:wrap" }, { id: "b", type: "ref", ref: "two:badge" }] }]), library: { public: [{ kind: "component", id: "scene" }] } }, { libraryId: "root", releaseId: "r1", dependencies: [{ alias: "middle", ...identity(middle) }, { alias: "two", ...identity(two) }] });
  const retention = await retain(root, [{ kind: "component", id: "scene" }], new Map([[one.libraryId, one], [middle.libraryId, middle], [two.libraryId, two]]), new Map([["one:shared.png", oneBytes], ["two:shared.png", twoBytes]]));
  const consumer = source({ app: importRecord(root) }, [{ id: "use", type: "ref", ref: "app:scene" }]);
  const built = buildRetainedCanvasImports(consumer, new Map([["app", retention]]));
  assert.deepEqual([...built.assets.keys()].sort(), ["imports/app/imports/middle/imports/one/shared.png", "imports/app/imports/two/shared.png"]);
  assert.deepEqual([...built.assets.values()].map(({ bytes }) => [...bytes]).sort((a, b) => a[0] - b[0]), [[1, 2, 3], [4, 5, 6]]);
  const resolved = resolveCanvasDocument(consumer, { imports: built.imports }).document;
  assert.deepEqual(imageUrls(resolved.children).sort(), ["imports/app/imports/middle/imports/one/shared.png", "imports/app/imports/two/shared.png"]);
});

test("two aliases to one accepted release retain independent asset namespaces", async () => {
  const bytes = Uint8Array.of(9, 8, 7);
  const release = createLibraryRelease({ ...source({}, [{ id: "card", type: "frame", fill: { type: "image", url: "card.png" } }]), library: { public: [{ kind: "component", id: "card" }] } }, { libraryId: "same", releaseId: "r1", assets: [{ path: "card.png", size: 3, sha256: sha(bytes) }] });
  const retention = await retain(release, [{ kind: "component", id: "card" }], new Map([[release.libraryId, release]]), new Map([["same:card.png", bytes]]));
  const consumer = source({ first: importRecord(release), second: importRecord(release) }, [{ id: "one", type: "ref", ref: "first:card" }, { id: "two", type: "ref", ref: "second:card" }]);
  const built = buildRetainedCanvasImports(consumer, new Map([["first", retention], ["second", structuredClone(retention)]]));
  assert.deepEqual([...built.assets.keys()].sort(), ["imports/first/card.png", "imports/second/card.png"]);
  assert.equal(built.imports.first.document.children[0].fill.url, "card.png");
  assert.equal(resolveCanvasDocument(consumer, { imports: built.imports }).document.children[0].fill.url, "imports/first/card.png");
});

test("aliases to one release may accept different public items without leaking either manifest", async () => {
  const release = createLibraryRelease(libraryDocument(), { libraryId: "shared", releaseId: "r1" });
  const first = await retain(release, [{ kind: "component", id: "card" }], new Map([[release.libraryId, release]]));
  const second = await retain(release, [{ kind: "variable", id: "accent" }], new Map([[release.libraryId, release]]));
  const consumer = source({ first: importRecord(release), second: importRecord(release) }, [
    { id: "card", type: "ref", ref: "first:card" }, { id: "accent", type: "rectangle", fill: "${second:accent}" },
  ]);
  const built = buildRetainedCanvasImports(consumer, new Map([["first", first], ["second", second]]));
  assert.deepEqual(built.imports.first.release.publicItems.map(({ kind, id }) => `${kind}:${id}`), ["component:card"]);
  assert.deepEqual(built.imports.second.release.publicItems.map(({ kind, id }) => `${kind}:${id}`), ["variable:accent"]);
  assert.throws(() => buildRetainedCanvasImports(source({ first: importRecord(release) }, [{ id: "bad", type: "rectangle", fill: "${first:accent}" }]), new Map([["first", first]])), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
});

test("overlapping accepted component parent and child materialize one root without duplicate ids", async () => {
  const document = { ...source({}, [{ id: "parent", type: "frame", children: [{ id: "child", type: "rectangle", fill: "#123456" }] }, { id: "child", type: "rectangle", fill: "#123456" }]), library: { public: [{ kind: "component", id: "parent" }, { kind: "component", id: "child" }] } };
  const release = createLibraryRelease(document, { libraryId: "overlap", releaseId: "r1" });
  const retention = await retain(release, [{ kind: "component", id: "parent" }, { kind: "component", id: "child" }], new Map([[release.libraryId, release]]));
  const built = buildRetainedCanvasImports(source({ ui: importRecord(release) }), new Map([["ui", retention]]));
  assert.deepEqual(built.imports.ui.document.children.map((node) => node.id), ["parent"]);
  assert.equal(built.imports.ui.document.children[0].children[0].id, "child");
});

test("accepted identity is mandatory even for follow records and never selects latest", async () => {
  const { release, retention } = await mainFixture();
  const follow = source({ ui: { documentId: release.libraryId, updatePolicy: "follow" } });
  assert.throws(() => buildRetainedCanvasImports(follow, new Map([["ui", retention]])), { code: "CANVAS_IMPORT_INTEGRITY" });
});

test("missing, mismatched, malformed, conflicting, cyclic, and changed retained inputs fail closed", async () => {
  const { release, retention } = await mainFixture();
  const consumer = source({ ui: importRecord(release) });
  const cases = [
    ["missing bundle", new Map(), "CANVAS_IMPORT_INTEGRITY"],
    ["wrong root", new Map([["ui", { ...retention, root: { ...identity(release), releaseId: "other" } }]]), "CANVAS_IMPORT_INTEGRITY"],
    ["bad item hash", new Map([["ui", mutateRetention(retention, (copy) => { copy.items[0].item.contentHash = "0".repeat(64); })]]), "CANVAS_IMPORT_INTEGRITY"],
    ["malformed kind", new Map([["ui", mutateRetention(retention, (copy) => { copy.requestedItems[0].kind = "image"; })]]), "CANVAS_IMPORT_INTEGRITY"],
    ["malformed retained kind", new Map([["ui", mutateRetention(retention, (copy) => { copy.items[0].item.kind = "image"; })]]), "CANVAS_IMPORT_INTEGRITY"],
    ["missing accepted item", new Map([["ui", mutateRetention(retention, (copy) => { copy.items = copy.items.filter(({ item }) => item.id !== "card"); })]]), "CANVAS_IMPORT_INTEGRITY"],
  ];
  for (const [name, bundles, code] of cases) assert.throws(() => buildRetainedCanvasImports(consumer, bundles), { code }, name);
  const changed = structuredClone(retention);
  changed.assets = [{ ...changed.assets[0], bytes: Uint8Array.of(0, 0, 0) }];
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", changed]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const conflictingResource = mutateRetention(retention, (copy) => {
    const item = structuredClone(copy.items.find(({ item: retainedItem }) => retainedItem.kind === "component" && retainedItem.id === "card"));
    const resource = item.content.resources.find(([key]) => key === "component:card");
    resource[1].fill = "#conflict";
    item.item.contentHash = contentHash(item.content);
    copy.items.push(item);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", conflictingResource]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const conflictingAxes = mutateRetention(retention, (copy) => {
    const item = structuredClone(copy.items.find(({ item: retainedItem }) => retainedItem.kind === "component" && retainedItem.id === "card"));
    item.content.axes.extra = { modes: [{ name: "x" }] };
    item.item.contentHash = contentHash(item.content);
    copy.items.push(item);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", conflictingAxes]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const missingDependency = mutateRetention(retention, (copy) => {
    const item = copy.items.find(({ item: retainedItem }) => retainedItem.kind === "component" && retainedItem.id === "card");
    item.content.dependencies = [{ alias: "missing", libraryId: "missing", releaseId: "r1", contentHash: "1".repeat(64) }];
    item.item.contentHash = contentHash(item.content);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", missingDependency]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const missingAsset = mutateRetention(retention, (copy) => {
    const item = copy.items.find(({ item: retainedItem }) => retainedItem.kind === "component" && retainedItem.id === "card");
    item.content.assets = [{ path: "missing.png", size: 0, sha256: "2".repeat(64) }];
    item.item.contentHash = contentHash(item.content);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", missingAsset]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const conflictingRelease = mutateRetention(retention, (copy) => {
    const item = structuredClone(copy.items[0]);
    item.release.contentHash = "f".repeat(64);
    copy.items.push(item);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", conflictingRelease]])), { code: "CANVAS_IMPORT_INTEGRITY" });
  const cycle = mutateRetention(retention, (copy) => {
    const item = copy.items.find(({ release: itemRelease }) => itemRelease.libraryId === release.libraryId);
    item.content.dependencies = [{ alias: "ui", ...identity(release) }];
    item.item.contentHash = contentHash(item.content);
  });
  assert.throws(() => buildRetainedCanvasImports(consumer, new Map([["ui", cycle]])), { code: "CANVAS_IMPORT_CYCLE" });
});

test("retained inputs are snapshotted and output bytes are independent copies", async () => {
  const bytes = Uint8Array.of(1, 2, 3);
  const release = createLibraryRelease({ ...source({}, [{ id: "card", type: "frame", fill: { type: "image", url: "x.png" } }]), library: { public: [{ kind: "component", id: "card" }] } }, { libraryId: "snap", releaseId: "r1", assets: [{ path: "x.png", size: 3, sha256: sha(bytes) }] });
  const retention = await retain(release, [{ kind: "component", id: "card" }], new Map([[release.libraryId, release]]), new Map([["snap:x.png", bytes]]));
  const consumer = source({ ui: importRecord(release) });
  const built = buildRetainedCanvasImports(consumer, new Map([["ui", retention]]));
  retention.assets[0].bytes[0] = 99;
  assert.deepEqual([...built.assets.values()][0].bytes, bytes);
  assert.deepEqual(consumer.imports.ui, importRecord(release));
});

test("retained item helper rejects canonical content hash changes without validating a full release", async () => {
  const { retention } = await mainFixture();
  assert.equal(validateRetainedLibraryItem(retention.items[0]), true);
  const changed = structuredClone(retention.items[0]);
  changed.content.axes.extra = true;
  assert.throws(() => validateRetainedLibraryItem(changed), { code: "CANVAS_IMPORT_INTEGRITY" });
});

function mutateRetention(value, mutator) { const copy = structuredClone(value); mutator(copy); return copy; }
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function contentHash(content) { return sha(Buffer.from(canonical(content))); }
function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function imageUrls(nodes, output = []) {
  for (const node of nodes ?? []) {
    if (node.fill?.type === "image") output.push(node.fill.url);
    imageUrls(node.children, output);
  }
  return output;
}
