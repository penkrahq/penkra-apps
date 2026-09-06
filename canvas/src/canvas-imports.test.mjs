import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { loadCanvasImports } from "./canvas-imports.mjs";
import { createLibraryRegistry, createLibraryRelease } from "./library-publication.mjs";

const emptyApi = {};
function source(imports = {}, children = [], options = {}) {
  return { module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports, flows: [], children, ...options };
}
function release(document, libraryId, releaseId, dependencies = []) {
  return createLibraryRelease(document, { libraryId, releaseId, dependencies });
}

test("Canvas imports select published releases and namespace library-owned assets", async () => {
  const bytes = Uint8Array.of(1, 2, 3);
  const library = source({}, [{ id: "hero", type: "rectangle", fill: { type: "image", url: "assets/hero.png" } }], {
    library: { public: [{ kind: "component", id: "hero" }] },
  });
  const published = createLibraryRelease(library, {
    libraryId: "library", releaseId: "14",
    assets: [{ path: "assets/hero.png", sha256: createHash("sha256").update(bytes).digest("hex"), size: 3 }],
  });
  const registry = createLibraryRegistry(); registry.publish(published);
  const root = source({ hig: { documentId: "library", updatePolicy: "pinned", releaseId: "14", contentHash: published.contentHash } }, [
    { id: "use", type: "ref", ref: "hig:hero" },
  ]);
  const loaded = await loadCanvasImports(emptyApi, root, {
    rootDocumentId: "root", resolveRelease: registry.resolve, readReleaseAsset: async () => bytes,
  });
  assert.equal(loaded.imports.hig.document.children[0].id, "hero");
  assert.deepEqual([...loaded.assets.keys()], ["imports/hig/assets/hero.png"]);
  assert.deepEqual(loaded.releases, [{ libraryId: "library", releaseId: "14", contentHash: published.contentHash }]);
  await assert.rejects(loadCanvasImports(emptyApi, root, {
    resolveRelease: registry.resolve, readReleaseAsset: async () => Uint8Array.of(3, 2, 1),
  }), { code: "CANVAS_IMPORT_INTEGRITY" });
});

test("legacy numeric pins fail explicitly and never compare against keystroke sequences", async () => {
  const root = source({ ui: { documentId: "library", pin: "exact", version: 14 } });
  let documentReads = 0;
  await assert.rejects(
    () => loadCanvasImports({ getDocument: async () => { documentReads += 1; } }, root, { resolveRelease: async () => undefined }),
    (error) => error.code === "CANVAS_IMPORT_LEGACY_PIN",
  );
  assert.equal(documentReads, 0);
});

test("Canvas imports reject release cycles with their concrete path", async () => {
  const registry = createLibraryRegistry();
  const aDraft = source({ b: { documentId: "b", updatePolicy: "follow" } }, [], { library: { public: [] } });
  const bDraft = source({ a: { documentId: "a", updatePolicy: "follow" } }, [], { library: { public: [] } });
  const placeholder = "0".repeat(64);
  const a = release(aDraft, "a", "one", [{ alias: "b", libraryId: "b", releaseId: "one", contentHash: placeholder }]);
  const b = release(bDraft, "b", "one", [{ alias: "a", libraryId: "a", releaseId: "one", contentHash: a.contentHash }]);
  registry.publish(a); registry.publish(b);
  await assert.rejects(
    () => loadCanvasImports(emptyApi, source({ a: { documentId: "a", updatePolicy: "follow" } }), { rootDocumentId: "root", resolveRelease: registry.resolve }),
    /Import cycle: root -> a -> b -> a/,
  );
});

test("private and removed cross-document resources cannot be referenced", async () => {
  const library = source({}, [
    { id: "public", type: "frame", children: [] },
    { id: "private", type: "frame", children: [] },
  ], {
    variables: { public: { tokenType: "color", cascade: [{ value: "#fff" }] }, private: { tokenType: "color", cascade: [{ value: "#000" }] } },
    paragraphStyles: { public: { fontSize: 16 }, private: { fontSize: 12 } },
    library: { public: [
      { kind: "component", id: "public" }, { kind: "variable", id: "public" }, { kind: "paragraphStyle", id: "public" },
    ] },
  });
  const published = release(library, "ui", "one");
  const registry = createLibraryRegistry(); registry.publish(published);
  const imported = { ui: { documentId: "ui", updatePolicy: "follow" } };
  for (const document of [
    source(imported, [{ id: "use", type: "ref", ref: "ui:private" }]),
    source(imported, [{ id: "text", type: "text", content: "x", style: "ui:private", marks: [], paragraphs: [{ from: 0, to: 1 }] }]),
    source(imported, [{ id: "paint", type: "rectangle", fill: "${ui:private}" }]),
  ]) await assert.rejects(() => loadCanvasImports(emptyApi, document, { resolveRelease: registry.resolve }), /private or was removed/);
});

test("published dependency identities are transitive and fail closed on mismatch", async () => {
  const registry = createLibraryRegistry();
  const base = release(source({}, [{ id: "base", type: "frame", children: [] }], { library: { public: [{ kind: "component", id: "base" }] } }), "base", "one");
  registry.publish(base);
  const wrapperDocument = source({ base: { documentId: "base", updatePolicy: "pinned", releaseId: "one", contentHash: base.contentHash } }, [
    { id: "wrapper", type: "frame", children: [{ id: "inner", type: "ref", ref: "base:base" }] },
  ], { library: { public: [{ kind: "component", id: "wrapper" }] } });
  const identity = { alias: "base", libraryId: base.libraryId, releaseId: base.releaseId, contentHash: base.contentHash };
  const wrapper = release(wrapperDocument, "wrapper", "one", [identity]); registry.publish(wrapper);
  const loaded = await loadCanvasImports(emptyApi, source({ ui: { documentId: "wrapper", updatePolicy: "follow" } }, [{ id: "use", type: "ref", ref: "ui:wrapper" }]), { resolveRelease: registry.resolve });
  assert.equal(loaded.imports.ui.imports.base.identity.contentHash, base.contentHash);

  const broken = createLibraryRegistry(); broken.publish(base);
  broken.publish(release(wrapperDocument, "wrapper", "broken", [{ ...identity, contentHash: "f".repeat(64) }]));
  await assert.rejects(
    () => loadCanvasImports(emptyApi, source({ ui: { documentId: "wrapper", updatePolicy: "follow" } }), { resolveRelease: broken.resolve }),
    (error) => error.code === "CANVAS_IMPORT_DEPENDENCY_MISMATCH",
  );
});

test("one load caches release selection consistently across aliases", async () => {
  const published = release(source({}, [], { library: { public: [] } }), "ui", "one");
  let calls = 0;
  const root = source({ one: { documentId: "ui", updatePolicy: "follow" }, two: { documentId: "ui", updatePolicy: "follow" } });
  const loaded = await loadCanvasImports(emptyApi, root, { resolveRelease: async () => { calls += 1; return published; } });
  assert.equal(calls, 1);
  assert.equal(loaded.imports.one.identity.contentHash, loaded.imports.two.identity.contentHash);
});
