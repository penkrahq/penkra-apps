import assert from "node:assert/strict";
import test from "node:test";

import { loadCanvasImports } from "./canvas-imports.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

function payload(source, sequence, assets = []) {
  const model = createDocumentModel(source);
  const value = { snapshot: { source, state: encodeState(model), throughSequence: sequence }, updates: [], assets };
  model.doc.destroy();
  return value;
}

test("Canvas imports enforce exact revisions and namespace library-owned assets", async () => {
  const library = { version: "2.17", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "hero", type: "rectangle", fill: { type: "image", url: "assets/hero.png" } },
  ] };
  const api = {
    getDocument: async (id) => {
      assert.equal(id, "library");
      return payload(library, 14, [{ path: "assets/hero.png", sha256: "abc", size: 3 }]);
    },
    readAsset: async () => Uint8Array.of(1, 2, 3),
  };
  const root = { imports: { hig: { documentId: "library", version: 14, pin: "exact" } } };

  const loaded = await loadCanvasImports(api, root, { rootDocumentId: "root" });

  assert.equal(loaded.imports.hig.document.children[0].id, "hero");
  assert.deepEqual([...loaded.assets.keys()], ["imports/hig/assets/hero.png"]);
  root.imports.hig.version = 13;
  await assert.rejects(() => loadCanvasImports(api, root), /pins library at revision 13/);
});

test("Canvas imports reject a document cycle with its concrete path", async () => {
  const a = { imports: { b: { documentId: "b", pin: "live" } }, children: [] };
  const b = { imports: { a: { documentId: "a", pin: "live" } }, children: [] };
  const api = {
    getDocument: async (id) => payload(id === "a" ? a : b, 0),
    readAsset: async () => new Uint8Array(),
  };
  await assert.rejects(
    () => loadCanvasImports(api, a, { rootDocumentId: "a" }),
    /Import cycle: a -> b -> a/,
  );
});
