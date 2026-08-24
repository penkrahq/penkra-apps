import assert from "node:assert/strict";
import test from "node:test";

import { materializeDocumentImages } from "./image-materialization.mjs";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fixture(fill) {
  const uploads = [];
  return {
    document: {
      version: "2.15",
      children: [{ id: "hero", type: "frame", width: 400, height: 240, fill }],
    },
    uploads,
    api: {
      uploadAsset: async (_id, asset) => {
        uploads.push(asset);
        return { path: asset.path, sha256: asset.sha256, size: asset.bytes.byteLength, mimeType: asset.mimeType };
      },
      generateImage: async (_id, input) => {
        uploads.push({ generated: input });
        return { path: "images/generated.png", sha256: "a".repeat(64), size: 8, mimeType: "image/png" };
      },
    },
  };
}

test("materializes an absolute local image into a durable Canvas blob path", async () => {
  const value = fixture({ type: "image", url: "/tmp/hero.png", mode: "fill" });
  await materializeDocumentImages({
    api: value.api,
    documentId: "document-1",
    document: value.document,
    dependencies: { readFile: async (path) => (assert.equal(path, "/tmp/hero.png"), png) },
  });
  assert.equal(value.uploads.length, 1);
  assert.match(value.document.children[0].fill.url, /^images\/[a-f0-9]{64}\.png$/u);
});

test("keeps existing relative asset paths and rejects new relative paths", async () => {
  const existing = fixture({ type: "image", url: "images/hero.png" });
  await materializeDocumentImages({
    api: existing.api,
    documentId: "document-1",
    document: existing.document,
    existingAssets: [{ path: "images/hero.png" }],
  });
  assert.equal(existing.uploads.length, 0);

  const missing = fixture({ type: "image", url: "images/missing.png" });
  await assert.rejects(
    materializeDocumentImages({
      api: missing.api,
      documentId: "document-1",
      document: missing.document,
    }),
    (error) => error.code === "CANVAS_IMAGE_RELATIVE_PATH_UNAVAILABLE",
  );
});

test("materializes direct data URLs and Pencil-compatible G generations", async () => {
  const direct = fixture({
    type: "image",
    url: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
  });
  await materializeDocumentImages({ api: direct.api, documentId: "document-1", document: direct.document });
  assert.equal(direct.uploads[0].mimeType, "image/png");

  const generated = fixture({ type: "image", url: "penkra-generation://0", mode: "fill" });
  let request;
  await materializeDocumentImages({
    api: generated.api,
    documentId: "document-1",
    document: generated.document,
    generations: [
      { nodeId: "hero", kind: "ai", prompt: "paper mountains", url: "penkra-generation://0" },
    ],
    dependencies: {
      generateAi: async (input) => {
        request = input;
        return { path: "images/generated.png", sha256: "a".repeat(64), size: 8, mimeType: "image/png" };
      },
    },
  });
  assert.deepEqual(request, { prompt: "paper mountains", width: 400, height: 240 });
  assert.equal(generated.document.children[0].fill.url, "images/generated.png");
});

test("stops an unbounded remote response once it exceeds the image limit", async () => {
  const value = fixture({ type: "image", url: "https://example.com/oversized.png" });
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(12 * 1024 * 1024));
      controller.enqueue(new Uint8Array(13 * 1024 * 1024));
      controller.close();
    },
  });
  await assert.rejects(
    materializeDocumentImages({
      api: value.api,
      documentId: "document-1",
      document: value.document,
      dependencies: {
        fetch: async () => new Response(body, { headers: { "content-type": "image/png" } }),
      },
    }),
    (error) => error.code === "CANVAS_IMAGE_TOO_LARGE",
  );
  assert.equal(value.uploads.length, 0);
});
