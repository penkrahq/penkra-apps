import assert from "node:assert/strict";
import test from "node:test";

import {
  collectImageReferences,
  parsePenSource,
  readPenDocument,
} from "./pen-file-access.mjs";

test("collects only explicit Pencil image fill URLs once", () => {
  const source = {
    children: [{
      id: "frame",
      type: "frame",
      fill: { type: "image", url: "assets/hero.png", mode: "fill" },
      children: [{ type: "text", content: "assets/not-an-image.png" }],
    }, {
      id: "second",
      type: "frame",
      fill: [{ type: "image", url: "assets/hero.png" }],
    }],
  };

  assert.deepEqual(collectImageReferences(source), ["assets/hero.png"]);
});

test("reads every referenced asset relative to the chosen .pen file", async () => {
  const png = new Uint8Array([1, 2, 3]);
  const assets = directory("assets", {
    "hero.png": fileHandle("hero.png", png, "image/png"),
  });
  const design = directory("design", {
    "sample.pen": fileHandle("sample.pen", new TextEncoder().encode(JSON.stringify({
      children: [{ id: "frame", type: "frame", fill: { type: "image", url: "../assets/hero.png" } }],
    })), "application/json"),
  });
  const root = directory("project", { assets, design });
  root.resolve = async () => ["design", "sample.pen"];

  const result = await readPenDocument(root, design.children["sample.pen"]);

  assert.equal(result.fallbackTitle, "sample");
  assert.equal(result.assets[0].path, "../assets/hero.png");
  assert.deepEqual(result.assets[0].bytes, png);
  assert.equal(result.assets[0].sha256.length, 64);
});

test("fails the import when a referenced asset is missing", async () => {
  const handle = fileHandle("sample.pen", new TextEncoder().encode(JSON.stringify({
    children: [{ id: "frame", type: "frame", fill: { type: "image", url: "missing.png" } }],
  })), "application/json");
  const root = directory("project", { "sample.pen": handle });
  root.resolve = async () => ["sample.pen"];

  await assert.rejects(readPenDocument(root, handle), /Referenced asset missing\.png is missing/);
});

test("rejects non-document JSON", () => {
  assert.throws(() => parsePenSource("{}"), /supported \.pen document structure/);
});

function fileHandle(name, bytes, type) {
  return {
    kind: "file",
    name,
    async getFile() {
      return {
        type,
        async text() { return new TextDecoder().decode(bytes); },
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      };
    },
  };
}

function directory(name, children) {
  return {
    kind: "directory",
    name,
    children,
    async getDirectoryHandle(child) {
      const handle = children[child];
      if (handle?.kind === "directory") return handle;
      throw new DOMException("Missing", "NotFoundError");
    },
    async getFileHandle(child) {
      const handle = children[child];
      if (handle?.kind === "file") return handle;
      throw new DOMException("Missing", "NotFoundError");
    },
  };
}
