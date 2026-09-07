import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createLibraryRelease } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";

function fixture() {
  const bytes = Uint8Array.of(1, 2, 3);
  const base = createLibraryRelease({
    axes: {}, variables: { ink: { tokenType: "color", cascade: [{ value: "#123456" }] }, secret: { tokenType: "string", cascade: [{ value: "private" }] } },
    paragraphStyles: {}, imports: {},
    library: { public: [{ kind: "component", id: "card" }] },
    children: [{ id: "card", type: "frame", fill: "${ink}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "used.png" } }] }, { id: "secret", type: "frame" }],
  }, { libraryId: "base", releaseId: "one", assets: [{ path: "used.png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] });
  const root = createLibraryRelease({
    axes: {}, variables: {}, paragraphStyles: {},
    imports: { ui: { documentId: "base", updatePolicy: "pinned", releaseId: "one", contentHash: base.contentHash } },
    library: { public: [{ kind: "component", id: "wrapper" }] },
    children: [{ id: "wrapper", type: "frame", children: [{ id: "first", type: "ref", ref: "ui:card" }, { id: "second", type: "ref", ref: "ui:card" }] }],
  }, { libraryId: "root", releaseId: "one", dependencies: [{ alias: "ui", libraryId: "base", releaseId: "one", contentHash: base.contentHash }] });
  return { root, base, bytes };
}
const requested = [{ kind: "component", id: "wrapper" }];

test("retention rejects two contents claiming one immutable publication identity", async () => {
  const { base, bytes } = fixture();
  const changedDocument = structuredClone(base.document);
  changedDocument.variables.ink.cascade[0].value = "#abcdef";
  const changed = createLibraryRelease(changedDocument, { libraryId: base.libraryId, releaseId: base.releaseId, assets: base.assets });
  const root = createLibraryRelease({
    axes: {}, variables: {}, paragraphStyles: {}, imports: {},
    library: { public: [{ kind: "component", id: "wrapper" }] },
    children: [{ id: "wrapper", type: "frame", children: [
      { id: "first", type: "ref", ref: "first:card" },
      { id: "second", type: "ref", ref: "second:card" },
    ] }],
  }, { libraryId: "root", releaseId: "one", dependencies: [
    { alias: "first", libraryId: base.libraryId, releaseId: base.releaseId, contentHash: base.contentHash },
    { alias: "second", libraryId: changed.libraryId, releaseId: changed.releaseId, contentHash: changed.contentHash },
  ] });
  let resolutions = 0;
  await assert.rejects(prepareLibraryRetention(root, requested, {
    resolveRelease: async ({ contentHash }) => { resolutions++; return contentHash === base.contentHash ? base : changed; },
    readAsset: async () => bytes,
  }), { code: "CANVAS_IMPORT_CACHE_INCONSISTENT" });
  assert.equal(resolutions, 1);
});

test("retention preparation copies required public dependency closure once, without unrelated private items", async () => {
  const { root, base, bytes } = fixture();
  let resolutions = 0;
  let assetReads = 0;
  const prepared = await prepareLibraryRetention(root, requested, {
    resolveRelease: async (record) => { resolutions++; assert.deepEqual(record, { documentId: "base", updatePolicy: "pinned", releaseId: "one", contentHash: base.contentHash }); return base; },
    readAsset: async (identity, descriptor) => { assetReads++; assert.equal(identity.libraryId, "base"); assert.equal(descriptor.path, "used.png"); return bytes; },
  });
  assert.equal(resolutions, 1);
  assert.equal(assetReads, 1);
  assert.equal(prepared.items.length, 2);
  const retainedBase = prepared.items.find(({ release }) => release.libraryId === "base");
  assert.deepEqual(retainedBase.content.resources.map(([key]) => key), ["component:card", "variable:ink"]);
  assert.equal(prepared.assets.length, 1);
  assert.deepEqual(prepared.assets[0].bytes, bytes);
  base.document.children.length = 0;
  bytes[0] = 99;
  root.document.children.length = 0;
  assert.equal(retainedBase.content.resources[0][1].children[0].id, "image");
  assert.deepEqual(prepared.assets[0].bytes, Uint8Array.of(1, 2, 3));
  assert.ok(prepared.items.every((item) => !Object.hasOwn(item, "document")));
});

test("retention fails closed on denied dependency reads, wrong identities, or corrupted assets", async () => {
  const { root, base } = fixture();
  const denied = Object.assign(new Error("denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  await assert.rejects(prepareLibraryRetention(root, requested, { resolveRelease: async () => { throw denied; } }), { code: denied.code });
  await assert.rejects(prepareLibraryRetention(root, requested, { resolveRelease: async () => root }), { code: "CANVAS_IMPORT_INTEGRITY" });
  await assert.rejects(prepareLibraryRetention(root, requested, { resolveRelease: async () => base, readAsset: async () => Uint8Array.of(9, 9, 9) }), { code: "CANVAS_IMPORT_INTEGRITY" });
  await assert.rejects(prepareLibraryRetention(root, requested), { code: "CANVAS_IMPORT_RELEASE_RESOLVER_REQUIRED" });
});

test("private roots cannot be retained and invalid requests are rejected", async () => {
  const { base } = fixture();
  await assert.rejects(prepareLibraryRetention(base, [{ kind: "component", id: "secret" }]), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  await assert.rejects(prepareLibraryRetention(base, []), { code: "CANVAS_LIBRARY_INVALID" });
  await assert.rejects(prepareLibraryRetention(base, [{ kind: "component", id: "card", extra: true }]), { code: "CANVAS_LIBRARY_INVALID" });
});

test("root and requested items are snapshotted before asynchronous dependency access", async () => {
  const { root, base, bytes } = fixture();
  const input = structuredClone(requested);
  let resume;
  const deferred = new Promise((resolve) => { resume = resolve; });
  const pending = prepareLibraryRetention(root, input, { resolveRelease: async () => { await deferred; return base; }, readAsset: async () => bytes });
  root.document.children[0].children[0].ref = "ui:secret";
  input[0].id = "changed";
  resume();
  const prepared = await pending;
  assert.deepEqual(prepared.requestedItems, requested);
  const wrapper = prepared.items.find(({ release }) => release.libraryId === "root");
  assert.equal(wrapper.content.resources[0][1].children[0].ref, "ui:card");
});

test("retention follows only required items through multiple library levels", async () => {
  const { root: middle, base, bytes } = fixture();
  const root = createLibraryRelease({
    axes: {}, variables: {}, paragraphStyles: {}, imports: {},
    library: { public: [{ kind: "component", id: "outer" }] },
    children: [{ id: "outer", type: "ref", ref: "middle:wrapper" }],
  }, { libraryId: "outer", releaseId: "one", dependencies: [{ alias: "middle", libraryId: middle.libraryId, releaseId: middle.releaseId, contentHash: middle.contentHash }] });
  const reads = [];
  const prepared = await prepareLibraryRetention(root, [{ kind: "component", id: "outer" }], {
    resolveRelease: async ({ documentId }) => { reads.push(documentId); return documentId === "root" ? middle : base; },
    readAsset: async () => bytes,
  });
  assert.deepEqual(reads, ["root", "base"]);
  assert.deepEqual(prepared.items.map(({ item }) => item.id).sort(), ["card", "outer", "wrapper"]);
  assert.equal(prepared.assets.length, 1);
});

test("qualified paragraph styles and typed token references retain their own public closures", async () => {
  const { base } = fixture();
  const source = structuredClone(base.document);
  source.library.public = [{ kind: "variable", id: "ink" }, { kind: "paragraphStyle", id: "body" }];
  source.paragraphStyles.body = { fill: "${ink}", fontSize: 16 };
  const dependency = createLibraryRelease(source, { libraryId: "tokens", releaseId: "one", assets: base.assets });
  const root = createLibraryRelease({
    axes: {}, variables: {}, paragraphStyles: {}, imports: {},
    library: { public: [{ kind: "component", id: "text" }] },
    children: [{ id: "text", type: "text", content: "Text", fill: "${theme:ink}", paragraphs: [{ from: 0, to: 4, style: "theme:body" }] }],
  }, { libraryId: "consumer", releaseId: "one", dependencies: [{ alias: "theme", libraryId: "tokens", releaseId: "one", contentHash: dependency.contentHash }] });
  let reads = 0;
  const prepared = await prepareLibraryRetention(root, [{ kind: "component", id: "text" }], {
    resolveRelease: async () => { reads++; return dependency; },
    readAsset: async () => assert.fail("unrelated image must not be read"),
  });
  assert.equal(reads, 1);
  assert.deepEqual(prepared.items.map(({ item }) => `${item.kind}:${item.id}`).sort(), ["component:text", "paragraphStyle:body", "variable:ink"]);
  assert.deepEqual(prepared.assets, []);
});
