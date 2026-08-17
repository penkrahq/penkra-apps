import assert from "node:assert/strict";
import test from "node:test";

import {
  choosePenDocument,
  collectImageReferences,
  parsePenSource,
  readPenDocument,
  savePenDocument,
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
  const files = fileService({
    "design/sample.pen": JSON.stringify({
      children: [{ id: "frame", type: "frame", fill: { type: "image", url: "../assets/hero.png" } }],
    }),
    "assets/hero.png": png,
  });
  const root = { id: "root", kind: "directory", name: "project" };
  const document = { kind: "file", name: "sample.pen", relativePath: "design/sample.pen" };

  const result = await readPenDocument(files, root, document);

  assert.equal(result.fallbackTitle, "sample");
  assert.equal(result.assets[0].path, "../assets/hero.png");
  assert.deepEqual(result.assets[0].bytes, png);
  assert.equal(result.assets[0].sha256.length, 64);
});

test("fails the import when a referenced asset is missing", async () => {
  const files = fileService({
    "sample.pen": JSON.stringify({
      children: [{ id: "frame", type: "frame", fill: { type: "image", url: "missing.png" } }],
    }),
  });
  const root = { id: "root", kind: "directory", name: "project" };
  const document = { kind: "file", name: "sample.pen", relativePath: "sample.pen" };

  await assert.rejects(readPenDocument(files, root, document), /Referenced asset missing\.png is missing/);
});

test("imports the only top-level .pen file through Runtime v2 scoped files", async () => {
  const files = fileService({
    "sample.pen": JSON.stringify({ name: "Sample", children: [] }),
    "notes.txt": "not a design",
  });

  const result = await choosePenDocument(files);

  assert.equal(result.source.name, "Sample");
  assert.equal(result.fallbackTitle, "sample");
  assert.deepEqual(files.picks, ["directory"]);
});

test("requires an unambiguous top-level .pen document", async () => {
  const files = fileService({ "one.pen": '{"children":[]}', "two.pen": '{"children":[]}' });
  await assert.rejects(choosePenDocument(files), /exactly one \.pen document/);
});

test("exports through a user-selected Runtime v2 directory handle", async () => {
  const files = fileService({});
  assert.equal(await savePenDocument({ children: [] }, "sample.pen", files), true);
  assert.equal(files.writes[0].relativePath, "sample.pen");
  assert.deepEqual(JSON.parse(files.writes[0].source), { children: [] });
});

test("rejects non-document JSON", () => {
  assert.throws(() => parsePenSource("{}"), /supported \.pen document structure/);
});

function fileService(initial) {
  const values = new Map(Object.entries(initial).map(([path, value]) => [
    path,
    typeof value === "string" ? new TextEncoder().encode(value) : value,
  ]));
  return {
    picks: [],
    writes: [],
    async pick(kind) {
      this.picks.push(kind);
      return { id: "root", kind: "directory", name: "project" };
    },
    async listDirectory() {
      return [...values.keys()].filter((path) => !path.includes("/")).map((path) => ({
        kind: "file", name: path, relativePath: path, size: values.get(path).byteLength,
      }));
    },
    async readText(_handleId, relativePath) {
      const bytes = values.get(relativePath);
      if (!bytes) throw new Error("missing");
      return new TextDecoder().decode(bytes);
    },
    async readBinary({ relativePath, offset = 0, length }) {
      const bytes = values.get(relativePath);
      if (!bytes) throw new Error("missing");
      const chunk = bytes.slice(offset, offset + length);
      return { bytes: chunk, totalBytes: bytes.byteLength, complete: offset + chunk.byteLength >= bytes.byteLength };
    },
    async writeText(handleId, source, relativePath) {
      this.writes.push({ handleId, source, relativePath });
    },
  };
}
