import assert from "node:assert/strict";
import test from "node:test";

import { hasUnloadedDocumentImages, hydrateDocumentAssets } from "./document-assets.mjs";

test("hydrates new or changed assets into the live document asset map", async () => {
  const reads = [];
  const api = {
    readAsset: async (_documentId, descriptor) => {
      reads.push(descriptor.path);
      return new Uint8Array([descriptor.path.length]);
    },
  };
  const current = new Map([
    ["images/existing.png", {
      path: "images/existing.png",
      sha256: "a".repeat(64),
      size: 1,
      bytes: new Uint8Array([1]),
    }],
  ]);

  const result = await hydrateDocumentAssets(api, "document-id", [
    { path: "images/existing.png", sha256: "a".repeat(64), size: 1 },
    { path: "images/new.png", sha256: "b".repeat(64), size: 2 },
  ], current);

  assert.deepEqual(reads, ["images/new.png"]);
  assert.equal(result.changed, true);
  assert.equal(result.assets, current);
  assert.equal(result.assets.size, 2);
  assert.deepEqual(current.get("images/new.png").bytes, new Uint8Array([14]));
});

test("detects image fills whose document assets have not loaded", () => {
  const document = {
    children: [{
      id: "frame",
      type: "frame",
      fill: { type: "image", url: "images/new.png", mode: "fill" },
      children: [],
    }],
  };

  assert.equal(hasUnloadedDocumentImages(document, new Map()), true);
  assert.equal(hasUnloadedDocumentImages(document, new Map([
    ["images/new.png", { bytes: new Uint8Array([1]) }],
  ])), false);
});
