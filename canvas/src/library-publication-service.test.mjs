import assert from "node:assert/strict";
import test from "node:test";
import { prepareLibraryRelease } from "./library-publication-service.mjs";
import { createLibraryRegistry, createLibraryRelease } from "./library-publication.mjs";
import { loadCanvasImports } from "./canvas-imports.mjs";

const document = (children = [], imports = {}) => ({ module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports, flows: [], children, library: { public: children.map(({ id }) => ({ kind: "component", id })) } });

test("publication identity is captured before asynchronous dependency reads", async () => {
  const dependency = createLibraryRelease(document([{ id: "card", type: "frame" }]), { libraryId: "base", releaseId: "one" });
  let resume;
  const wait = new Promise((resolve) => { resume = resolve; });
  const options = { libraryId: "wrapper", releaseId: "one", resolveRelease: async () => { await wait; return dependency; } };
  const source = document([{ id: "wrapper", type: "ref", ref: "base:card" }], { base: { documentId: "base", updatePolicy: "follow" } });
  const pending = prepareLibraryRelease({}, source, options);
  options.libraryId = "changed";
  options.releaseId = "changed";
  resume();
  const prepared = await pending;
  assert.equal(prepared.release.libraryId, "wrapper");
  assert.equal(prepared.release.releaseId, "one");
});

test("publication preparation locks follow dependencies without mutating the author's document", async () => {
  const registry = createLibraryRegistry();
  const first = createLibraryRelease(document([{ id: "card", type: "frame", width: 100 }]), { libraryId: "base", releaseId: "one" });
  registry.publish(first);
  const source = document([{ id: "wrapper", type: "ref", ref: "base:card" }], { base: { documentId: "base", updatePolicy: "follow" } });
  const before = structuredClone(source);
  const prepared = await prepareLibraryRelease({}, source, { libraryId: "wrapper", releaseId: "one", resolveRelease: registry.resolve });
  assert.deepEqual(source, before);
  assert.deepEqual(prepared.release.document.imports.base, { documentId: "base", updatePolicy: "follow", releaseId: "one", contentHash: first.contentHash });
  registry.publish(prepared.release);
  registry.publish(createLibraryRelease(document([{ id: "card", type: "frame", width: 200 }]), { libraryId: "base", releaseId: "two" }));
  const loaded = await loadCanvasImports({}, document([], { ui: { documentId: "wrapper", updatePolicy: "follow" } }), { resolveRelease: registry.resolve });
  assert.equal(loaded.imports.ui.imports.base.identity.releaseId, "one");
  assert.equal(loaded.imports.ui.imports.base.document.children[0].width, 100);
});

test("publication preparation copies and hashes owned asset bytes before awaiting dependencies", async () => {
  const bytes = Uint8Array.of(1, 2, 3);
  const source = document([{ id: "image", type: "rectangle", fill: { type: "image", url: "images/logo.png" } }]);
  const pending = prepareLibraryRelease({}, source, { libraryId: "art", releaseId: "one", assets: [{ path: "images/logo.png", bytes, mimeType: "image/png" }] });
  bytes[0] = 9;
  source.children[0].fill.url = "changed.png";
  const prepared = await pending;
  assert.deepEqual(prepared.assets.get("images/logo.png"), Uint8Array.of(1, 2, 3));
  assert.equal(prepared.release.assets[0].sha256, "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81");
  assert.equal(prepared.release.document.children[0].fill.url, "images/logo.png");
  await assert.rejects(prepareLibraryRelease({}, source, { libraryId: "art", releaseId: "two", assets: [{ path: "x", bytes: "not bytes" }] }), /requires its owned bytes/);
});
