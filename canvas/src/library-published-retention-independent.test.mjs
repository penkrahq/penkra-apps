import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { preparePublishedLibraryRetention } from "./library-published-retention.mjs";
import { prepareRetainedLibraryRelease } from "./library-retained-publication.mjs";

const encoder = new TextEncoder();
const component = (id) => ({ kind: "component", id });
const hash = (value) => createHash("sha256").update(value).digest("hex");

function doc({ children = [], imports = {}, variables = {}, publicItems } = {}) {
  return {
    version: "2.17", module: "generic", axes: {}, variables, paragraphStyles: {}, imports, flows: [], children,
    library: { public: publicItems ?? children.map(({ id }) => component(id)) },
  };
}

function identity(release) { return { libraryId: release.libraryId, releaseId: release.releaseId, contentHash: release.contentHash }; }
function imported(release, retention) { return { documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash, ...(retention === undefined ? {} : { retention }) }; }

function account() {
  const projects = new Map([["consumer", new Map()], ["C", new Map()]]);
  const calls = [];
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push(["uploadAsset", documentId, asset.path]);
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("project unavailable"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.size, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
    },
    async readAsset(documentId, descriptor) {
      calls.push(["readAsset", documentId, descriptor.path]);
      const value = projects.get(documentId)?.get(descriptor.sha256);
      if (!value) throw Object.assign(new Error("blob unavailable"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(value);
    },
    async getDocument() { throw new Error("source getDocument must not be called"); },
    async resolveLibraryRelease() { throw new Error("upstream resolver must not be called"); },
  };
  return { api, projects, calls };
}

async function retain(state, release, requestedItems, releases, sourceAssets = new Map(), owner = "consumer") {
  return createLibraryStorage(state.api).retainItems(owner, release, requestedItems, {
    resolveRelease: async ({ documentId }) => {
      const selected = releases.get(documentId);
      if (!selected) throw Object.assign(new Error("upstream unavailable"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return structuredClone(selected);
    },
    readAsset: async (releaseIdentity, descriptor) => {
      const value = sourceAssets.get(`${releaseIdentity.libraryId}/${descriptor.path}`);
      if (!value) throw Object.assign(new Error("upstream asset unavailable"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(value);
    },
  });
}

async function twoLevelFixture() {
  const state = account();
  const bBytes = Uint8Array.of(4, 5, 6);
  const b = createLibraryRelease(doc({
    variables: { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } },
    children: [{ id: "card", type: "frame", fill: "${accent}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "shared.png" } }] }, { id: "private", type: "frame" }],
    publicItems: [component("card")],
  }), { libraryId: "B", releaseId: "r1", assets: [{ path: "shared.png", sha256: hash(bBytes), size: bBytes.length }] });
  const a = createLibraryRelease(doc({
    imports: { theme: imported(b) },
    children: [{ id: "hero", type: "frame", children: [{ id: "use-card", type: "ref", ref: "theme:card" }] }],
  }), { libraryId: "A", releaseId: "r1", dependencies: [{ alias: "theme", ...identity(b) }] });
  const retention = await retain(state, a, [component("hero")], new Map([[a.libraryId, a], [b.libraryId, b]]), new Map([["B/shared.png", bBytes]]), "C");
  state.calls.length = 0;
  return { state, a, b, retention, bBytes };
}

test("retained republication composes two levels without upstream transport and materializes a final consumer", async () => {
  const { state, a, b, retention, bBytes } = await twoLevelFixture();
  const ownBytes = Uint8Array.of(7, 8, 9);
  const consumer = doc({
    imports: { a: imported(a, retention) },
    children: [{ id: "published", type: "frame", fill: { type: "image", url: "owned.png" }, children: [{ id: "use-hero", type: "ref", ref: "a:hero" }] }],
  });
  const published = await prepareRetainedLibraryRelease(state.api, consumer, {
    libraryId: "C", releaseId: "r1", assets: [{ path: "owned.png", bytes: ownBytes, mimeType: "image/png" }],
  });
  const publishedSnapshot = structuredClone(published);
  state.calls.length = 0;
  state.projects.delete("A");
  state.projects.delete("B");
  const accepted = await preparePublishedLibraryRetention(published, [component("published")]);
  assert.deepEqual(accepted.items.map(({ item }) => `${item.kind}:${item.id}`).sort(), ["component:card", "component:hero", "component:published"]);
  assert.deepEqual(accepted.assets.map(({ release, path }) => `${release.libraryId}:${path}`).sort(), ["B:shared.png", "C:owned.png"]);
  assert.deepEqual(published, publishedSnapshot);
  assert.deepEqual(accepted.items.find(({ item }) => item.id === "card").content.resources.find(([key]) => key === "variable:accent")[1], { tokenType: "color", cascade: [{ value: "#123456" }] });
  assert.equal(accepted.items.some(({ item }) => item.kind === "variable" && item.id === "accent"), false);

  const finalConsumer = doc({ imports: { published: imported(published.release) }, children: [{ id: "screen", type: "ref", ref: "published:published" }] });
  const materialized = buildRetainedCanvasImports(finalConsumer, new Map([["published", accepted]]));
  assert.equal(materialized.imports.published.retained, true);
  assert.equal(materialized.imports.published.imports.a.imports.theme.retained, true);
  assert.deepEqual([...materialized.assets.keys()].sort(), ["imports/published/imports/a/imports/theme/shared.png", "imports/published/owned.png"]);
  assert.deepEqual([...materialized.assets.get("imports/published/imports/a/imports/theme/shared.png").bytes], [...bBytes]);
  assert.deepEqual(state.calls, [], "acceptance and final materialization are pure and do not use storage");
});

test("same-release aliases cannot escalate one alias into the other alias's unaccepted public surface", async () => {
  const state = account();
  const source = createLibraryRelease(doc({ children: [{ id: "card", type: "frame" }, { id: "button", type: "frame" }] }), { libraryId: "source", releaseId: "r1" });
  const cardRetention = await retain(state, source, [component("card")], new Map([[source.libraryId, source]]));
  const buttonRetention = await retain(state, source, [component("button")], new Map([[source.libraryId, source]]));
  state.calls.length = 0;
  const consumer = doc({
    imports: { a: imported(source, cardRetention), b: imported(source, buttonRetention) },
    children: [{ id: "screen", type: "frame", children: [{ id: "illegal", type: "ref", ref: "a:button" }] }],
  });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, consumer, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(state.calls.some(([operation]) => operation === "uploadAsset"), false);
  assert.equal(state.calls.every(([, documentId]) => documentId === "consumer"), true);
  const published = createLibraryRelease(consumer, { libraryId: "publisher", releaseId: "r1", dependencies: [{ alias: "a", ...identity(source) }, { alias: "b", ...identity(source) }] });
  const cardBundle = await createLibraryStorage(state.api).readRetention("consumer", cardRetention);
  const buttonBundle = await createLibraryStorage(state.api).readRetention("consumer", buttonRetention);
  await assert.rejects(preparePublishedLibraryRetention({ release: published, assets: new Map(), retentions: [{ alias: "a", retention: cardBundle }, { alias: "b", retention: buttonBundle }] }, [component("screen")]), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  const legal = doc({ imports: { a: imported(source, cardRetention), b: imported(source, buttonRetention) }, children: [{ id: "screen", type: "frame", children: [{ id: "card", type: "ref", ref: "a:card" }, { id: "button", type: "ref", ref: "b:button" }] }] });
  const built = buildRetainedCanvasImports(legal, new Map([["a", await createLibraryStorage(state.api).readRetention("consumer", cardRetention)], ["b", await createLibraryStorage(state.api).readRetention("consumer", buttonRetention)]]));
  assert.equal(built.imports.a.release.publicItems.some(({ id }) => id === "button"), false);
  assert.equal(built.imports.b.release.publicItems.some(({ id }) => id === "card"), false);
});

test("requested private roots and unused private closure are rejected or remain unexposed", async () => {
  const privateRelease = createLibraryRelease(doc({ children: [{ id: "public", type: "frame" }, { id: "private", type: "frame" }], publicItems: [component("public")] }), { libraryId: "private-root", releaseId: "r1" });
  await assert.rejects(preparePublishedLibraryRetention({ release: privateRelease, assets: new Map() }, [component("private")]), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  const { state, a, retention } = await twoLevelFixture();
  const published = await prepareRetainedLibraryRelease(state.api, doc({ imports: { a: imported(a, retention) }, children: [{ id: "published", type: "ref", ref: "a:hero" }] }), { libraryId: "C", releaseId: "r1" });
  const accepted = await preparePublishedLibraryRetention(published, [component("published")]);
  assert.equal(accepted.items.some(({ item }) => item.id === "private"), false);
  assert.equal(accepted.items.some(({ item }) => item.kind === "variable" && item.id === "accent"), false);
});

test("tampered and cyclic accepted transport fail through the existing validators without fallback", async () => {
  const fixture = await twoLevelFixture();
  const published = await prepareRetainedLibraryRelease(fixture.state.api, doc({ imports: { a: imported(fixture.a, fixture.retention) }, children: [{ id: "published", type: "ref", ref: "a:hero" }] }), { libraryId: "C", releaseId: "r1" });
  const tampered = structuredClone(published);
  tampered.retentions[0].retention.items[0].content.resources[0][1] = { changed: true };
  await assert.rejects(preparePublishedLibraryRetention(tampered, [component("published")]), { code: "CANVAS_IMPORT_INTEGRITY" });

  const cyclic = structuredClone(published);
  const item = cyclic.retentions[0].retention.items[0];
  item.content.dependencies.push({ alias: "self", ...item.release });
  item.item.contentHash = hash(canonical(item.content));
  await assert.rejects(preparePublishedLibraryRetention(cyclic, [component("published")]), { code: "CANVAS_IMPORT_CYCLE" });
  assert.equal(fixture.state.calls.every(([operation]) => operation === "readAsset"), true);
});

test("missing retained transport fails closed and never invokes an upstream fallback", async () => {
  const fixture = await twoLevelFixture();
  const published = await prepareRetainedLibraryRelease(fixture.state.api, doc({ imports: { a: imported(fixture.a, fixture.retention) }, children: [{ id: "published", type: "ref", ref: "a:hero" }] }), { libraryId: "C", releaseId: "r1" });
  const missing = structuredClone(published);
  missing.retentions = [];
  await assert.rejects(preparePublishedLibraryRetention(missing, [component("published")]), { code: "CANVAS_IMPORT_INTEGRITY" });
});

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
