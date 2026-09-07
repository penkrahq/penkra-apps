import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { preparePublishedLibraryRetention } from "./library-published-retention.mjs";
import { validateRetainedCanvasRetention } from "./library-retained-imports.mjs";

const doc = (children, publicItems, imports = {}, variables = {}) => ({ version: "2.17", module: "generic", axes: {}, variables, paragraphStyles: {}, imports, flows: [], children, library: { public: publicItems } });
const component = (id) => ({ kind: "component", id });
const imported = (release) => ({ documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash });
const dependency = (alias, release) => ({ alias, ...releaseIdentity(release) });

async function fixture() {
  const bytes = Uint8Array.of(1, 2, 3);
  const descriptor = { path: "image.png", size: 3, sha256: createHash("sha256").update(bytes).digest("hex") };
  const base = createLibraryRelease(doc([
    { id: "card", type: "frame", fill: "${ink}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "image.png" } }] },
    { id: "private", type: "frame" },
  ], [component("card")], {}, { ink: { tokenType: "color", cascade: [{ value: "#123456" }] } }), { libraryId: "base", releaseId: "one", assets: [descriptor] });
  const middle = createLibraryRelease(doc([{ id: "wrapper", type: "frame", children: [{ id: "instance", type: "ref", ref: "ui:card" }] }], [component("wrapper")], { ui: imported(base) }), {
    libraryId: "middle", releaseId: "one", dependencies: [dependency("ui", base)],
  });
  const retention = await prepareLibraryRetention(middle, [component("wrapper")], { resolveRelease: async () => base, readAsset: async () => bytes });
  const release = createLibraryRelease(doc([{ id: "outer", type: "frame", children: [{ id: "inner", type: "ref", ref: "kit:wrapper" }] }], [component("outer")], { kit: imported(middle) }), {
    libraryId: "publisher", releaseId: "one", dependencies: [dependency("kit", middle)],
  });
  return { release, assets: new Map(), retentions: [{ alias: "kit", retention }] };
}

test("published accepted closure is copied without any upstream source reader", async () => {
  const published = await fixture();
  const before = structuredClone(published);
  const result = await preparePublishedLibraryRetention(published, [component("outer")]);
  assert.equal(validateRetainedCanvasRetention(result), true);
  assert.deepEqual(result.items.map(({ item }) => item.id).sort(), ["card", "outer", "wrapper"]);
  assert.deepEqual(result.assets.map(({ bytes }) => [...bytes]), [[1, 2, 3]]);
  assert.ok(result.items.every(({ item }) => item.id !== "private" && item.id !== "ink"));
  assert.deepEqual(published, before);
  result.assets[0].bytes[0] = 99;
  assert.deepEqual(published, before);
});

test("missing, wrong or duplicate accepted transport fails closed", async () => {
  for (const mutate of [
    (value) => { delete value.retentions; },
    (value) => { value.retentions.push(structuredClone(value.retentions[0])); },
    (value) => { value.retentions[0].alias = "wrong"; },
    (value) => { value.retentions[0].retention.root.releaseId = "other"; },
    (value) => { value.retentions[0].retention.assets[0].bytes[0] = 99; },
    (value) => { value.retentions[0].retention.items[0].content.resources.length = 0; },
  ]) {
    const published = await fixture();
    mutate(published);
    await assert.rejects(preparePublishedLibraryRetention(published, [component("outer")]), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
});

test("private closure does not become directly publishable or acceptable", async () => {
  const published = await fixture();
  await assert.rejects(preparePublishedLibraryRetention(published, [component("wrapper")]), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  const changed = structuredClone(published.release.document);
  changed.children[0].children[0].ref = "kit:private";
  published.release = createLibraryRelease(changed, { libraryId: "publisher", releaseId: "two", dependencies: published.release.dependencies });
  await assert.rejects(preparePublishedLibraryRetention(published, [component("outer")]));
});

test("no-import publications need no retained transport and snapshot requested items", async () => {
  const release = createLibraryRelease(doc([{ id: "local", type: "frame" }], [component("local")]), { libraryId: "local", releaseId: "one" });
  const requests = [component("local")];
  const pending = preparePublishedLibraryRetention({ release, assets: new Map() }, requests);
  requests[0].id = "changed";
  release.document.children[0].id = "changed";
  const result = await pending;
  assert.deepEqual(result.requestedItems, [component("local")]);
  assert.equal(validateRetainedCanvasRetention(result), true);
});

test("retained reader identity and item content are checked without source fallback", async () => {
  const published = await fixture();
  const retained = published.retentions[0].retention.items.find(({ item }) => item.id === "wrapper");
  for (const mutate of [
    (value) => { value.release.releaseId = "wrong"; },
    (value) => { value.item.id = "wrong"; },
    (value) => { value.content.resources.length = 0; },
  ]) {
    const changed = structuredClone(retained);
    mutate(changed);
    let upstream = 0;
    await assert.rejects(prepareLibraryRetention(published.release, [component("outer")], {
      readRetainedItem: () => changed,
      resolveRelease: () => { upstream++; assert.fail("retained reader must not fall back to source"); },
    }), { code: "CANVAS_IMPORT_INTEGRITY" });
    assert.equal(upstream, 0);
  }
});
