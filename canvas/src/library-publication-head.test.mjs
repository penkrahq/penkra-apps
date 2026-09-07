import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createDocumentModel, encodeState } from "./document-model.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryPublicationHead, readPublishedCanvasLibrary } from "./library-publication-head.mjs";

const text = new TextEncoder();
const automaticPublication = Symbol("automatic-publication");

function source(children = [{ id: "card", type: "frame" }]) {
  return {
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children,
    library: { public: children.map(({ id }) => ({ kind: "component", id })) },
  };
}

function payload(document) {
  const model = createDocumentModel(document);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { state }, updates: [] };
}

function storedRelease(release) {
  const bytes = text.encode(JSON.stringify({
    schema: "com.penkra.canvas.stored-library/1", kind: "release", content: { release, assets: [] },
  }));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    storage: { path: `_canvas/library-content/${sha256}`, sha256, size: bytes.length, mimeType: "application/json" },
  };
}

function fixture({ sourceDocument = source(), release = createLibraryRelease(source(), { libraryId: "source", releaseId: "r1" }), readAsset, publication = automaticPublication } = {}) {
  const stored = storedRelease(release);
  if (publication === automaticPublication) sourceDocument.library.publication = createLibraryPublicationHead(release, stored.storage);
  else if (publication === null) delete sourceDocument.library.publication;
  else sourceDocument.library.publication = publication;
  const calls = [];
  const api = {
    getDocument: async () => payload(sourceDocument),
    uploadAsset: async () => { throw new Error("upload must not occur during publication-head read"); },
    readAsset: async (libraryId, descriptor) => {
      calls.push({ libraryId, descriptor: structuredClone(descriptor) });
      return readAsset ? readAsset(stored.bytes) : new Uint8Array(stored.bytes);
    },
  };
  return { api, calls, sourceDocument, release, stored };
}

test("publication head creation validates and detaches release identity and storage", () => {
  const release = createLibraryRelease(source(), { libraryId: "source", releaseId: "r1" });
  const stored = storedRelease(release);
  const head = createLibraryPublicationHead(release, stored.storage);
  assert.deepEqual(head, { releaseId: "r1", contentHash: release.contentHash, storage: stored.storage });
  assert.notEqual(head.storage, stored.storage);
  head.storage.path = "changed";
  assert.notEqual(head.storage.path, stored.storage.path);
  assert.throws(() => createLibraryPublicationHead(release, { ...stored.storage, size: -1 }), { code: "CANVAS_IMPORT_INTEGRITY" });
});

test("published library reads its detached release through a fresh storage adapter", async () => {
  const fixtureValue = fixture();
  const result = await readPublishedCanvasLibrary(fixtureValue.api, "source");
  assert.equal(result.release.libraryId, "source");
  assert.equal(result.release.releaseId, "r1");
  assert.equal(result.release.contentHash, fixtureValue.release.contentHash);
  assert.deepEqual(result.assets, new Map());
  assert.deepEqual(result.publication, fixtureValue.sourceDocument.library.publication);
  assert.notEqual(result.publication, fixtureValue.sourceDocument.library.publication);
  assert.notEqual(result.publication.storage, fixtureValue.sourceDocument.library.publication.storage);
  assert.deepEqual(fixtureValue.calls, [{ libraryId: "source", descriptor: fixtureValue.stored.storage }]);
});

test("source access denial propagates and unpublished sources do not read blobs", async () => {
  const denial = Object.assign(new Error("source denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED", status: 403 });
  const denied = { getDocument: async () => { throw denial; } };
  await assert.rejects(readPublishedCanvasLibrary(denied, "source"), (error) => error === denial);

  const fixtureValue = fixture({ sourceDocument: source(), publication: null });
  let reads = 0;
  fixtureValue.api.readAsset = async () => { reads += 1; return fixtureValue.stored.bytes; };
  await assert.rejects(readPublishedCanvasLibrary(fixtureValue.api, "source"), { code: "CANVAS_LIBRARY_UNPUBLISHED" });
  assert.equal(reads, 0);
});

test("malformed, tampered, and wrong-identity publication heads fail with integrity", async () => {
  const valid = fixture();
  for (const mutate of [
    head => { head.releaseId = []; },
    head => { head.contentHash = {}; },
    head => { head.storage = null; },
    head => { head.extra = true; },
  ]) {
    const malformedSource = structuredClone(valid.sourceDocument);
    mutate(malformedSource.library.publication);
    const malformed = fixture({ sourceDocument: malformedSource, release: valid.release, publication: malformedSource.library.publication });
    await assert.rejects(readPublishedCanvasLibrary(malformed.api, "source"), { code: "CANVAS_IMPORT_INTEGRITY" });
  }

  const tampered = fixture({ readAsset: (bytes) => { const copy = new Uint8Array(bytes); copy[0] ^= 1; return copy; } });
  await assert.rejects(readPublishedCanvasLibrary(tampered.api, "source"), { code: "CANVAS_IMPORT_INTEGRITY" });

  const wrongRelease = createLibraryRelease(source([{ id: "card", type: "frame", width: 2 }]), { libraryId: "source", releaseId: "different" });
  const wrong = fixture({ release: wrongRelease });
  wrong.sourceDocument.library.publication.releaseId = "r1";
  await assert.rejects(readPublishedCanvasLibrary(wrong.api, "source"), { code: "CANVAS_IMPORT_INTEGRITY" });

  const wrongLibrary = createLibraryRelease(source(), { libraryId: "other", releaseId: "r1" });
  const wrongOwner = fixture({ release: wrongLibrary });
  await assert.rejects(readPublishedCanvasLibrary(wrongOwner.api, "source"), { code: "CANVAS_IMPORT_INTEGRITY" });
});

test("source edits that leave the head unchanged cannot select new mutable bytes", async () => {
  const oldRelease = createLibraryRelease(source([{ id: "card", type: "frame", width: 10 }]), { libraryId: "source", releaseId: "r1" });
  const currentSource = source([{ id: "card", type: "frame", width: 999 }]);
  const fixtureValue = fixture({ sourceDocument: currentSource, release: oldRelease });
  const result = await readPublishedCanvasLibrary(fixtureValue.api, "source");
  assert.equal(result.release.document.children[0].width, 10);
  assert.equal(fixtureValue.sourceDocument.children[0].width, 999);
});
