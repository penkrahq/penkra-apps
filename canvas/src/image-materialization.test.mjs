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

test("materializes generated images with bounded parallelism", async () => {
  const children = Array.from({ length: 6 }, (_, index) => ({
    id: `image-${index}`,
    type: "rectangle",
    width: 100,
    height: 100,
    fill: { type: "image", url: `penkra-generation://${index}`, mode: "fill" },
  }));
  let active = 0;
  let peak = 0;
  const releases = [];
  const completion = materializeDocumentImages({
    api: {},
    documentId: "document-1",
    document: { version: "2.15", children },
    generations: children.map((node, index) => ({
      nodeId: node.id,
      kind: "ai",
      prompt: `image ${index}`,
      url: `penkra-generation://${index}`,
    })),
    dependencies: {
      generateAi: async ({ prompt }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => releases.push(resolve));
        active -= 1;
        return { path: `images/${prompt}.png`, sha256: "a".repeat(64), size: 8, mimeType: "image/png" };
      },
    },
  });

  while (releases.length < 4) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(peak, 4);
  releases.splice(0, 4).forEach((release) => release());
  while (releases.length < 2) await new Promise((resolve) => setImmediate(resolve));
  releases.splice(0).forEach((release) => release());
  await completion;

  assert.equal(peak, 4);
  assert.deepEqual(children.map((node) => node.fill.url), [
    "images/image 0.png", "images/image 1.png", "images/image 2.png",
    "images/image 3.png", "images/image 4.png", "images/image 5.png",
  ]);
});

test("does not apply materialized paths after cancellation", async () => {
  const controller = new AbortController();
  const value = fixture({ type: "image", url: "penkra-generation://0", mode: "fill" });
  await assert.rejects(
    materializeDocumentImages({
      api: value.api,
      documentId: "document-1",
      document: value.document,
      generations: [{ nodeId: "hero", kind: "ai", prompt: "cancel me", url: "penkra-generation://0" }],
      signal: controller.signal,
      dependencies: {
        generateAi: async () => {
          controller.abort(new Error("caller disconnected"));
          return { path: "images/generated.png", sha256: "a".repeat(64), size: 8, mimeType: "image/png" };
        },
      },
    }),
    /caller disconnected/,
  );
  assert.equal(value.document.children[0].fill.url, "penkra-generation://0");
});
