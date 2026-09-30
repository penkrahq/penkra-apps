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
    ["images/removed.png", {
      path: "images/removed.png",
      sha256: "c".repeat(64),
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
  assert.deepEqual(result.changedPaths, new Set(["images/removed.png", "images/new.png"]));
  assert.equal(result.assets, current);
  assert.equal(result.assets.size, 2);
  assert.equal(result.assets.has("images/removed.png"), false);
  assert.deepEqual(current.get("images/new.png").bytes, new Uint8Array([14]));
});

test("keeps SVG source bytes and prepares a separate renderer cache", async () => {
  const source = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>');
  const renderBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  let rasterized;
  const result = await hydrateDocumentAssets({
    readAsset: async () => source,
  }, "document-id", [{
    path: "images/card.svg",
    sha256: "c".repeat(64),
    size: source.byteLength,
    mimeType: "image/svg+xml",
  }], new Map(), {
    rasterizeSvg: async (bytes) => (rasterized = bytes, renderBytes),
  });

  const asset = result.assets.get("images/card.svg");
  assert.deepEqual(rasterized, source);
  assert.deepEqual(asset.bytes, source);
  assert.deepEqual(asset.renderBytes, renderBytes);
  assert.equal(asset.path, "images/card.svg");
  assert.equal(asset.mimeType, "image/svg+xml");
});

test("keeps successfully loaded assets when another asset fails", async () => {
  const result = await hydrateDocumentAssets({
    readAsset: async (_documentId, descriptor) => {
      if (descriptor.path === "images/missing.png") throw new Error("unavailable");
      return new Uint8Array([1, 2, 3]);
    },
  }, "document-id", [
    { path: "images/available.png", sha256: "a".repeat(64), size: 3 },
    { path: "images/missing.png", sha256: "b".repeat(64), size: 3 },
  ]);

  assert.equal(result.assets.has("images/available.png"), true);
  assert.equal(result.assets.has("images/missing.png"), false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].descriptor.path, "images/missing.png");
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
