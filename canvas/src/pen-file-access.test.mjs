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

test("recursively reads typed resources declared by imported Pencil libraries", async () => {
  const files = fileService({
    "design/sample.pen": JSON.stringify({
      imports: { cards: "../libraries/cards.pen" },
      children: [],
    }),
    "libraries/cards.pen": JSON.stringify({
      imports: { tokens: "nested/tokens.pen" },
      children: [{
        id: "chart",
        type: "script",
        scriptUri: "../scripts/chart.js",
        fill: { type: "shader", url: "shaders/glow.frag" },
      }],
    }),
    "libraries/nested/tokens.pen": JSON.stringify({
      children: [{ id: "logo", type: "frame", fill: { type: "image", url: "../../assets/logo.png" } }],
    }),
    "scripts/chart.js": "// @schema 2.17\nreturn [];",
    "libraries/shaders/glow.frag": "void main() { gl_FragColor = vec4(1.0); }",
    "assets/logo.png": new Uint8Array([9, 8, 7]),
  });

  const result = await readPenDocument(
    files,
    { id: "root", kind: "directory", name: "project" },
    { kind: "file", name: "sample.pen", relativePath: "design/sample.pen" },
  );

  assert.deepEqual(
    result.assets.map(({ path, kind, mimeType }) => ({ path, kind, mimeType })),
    [
      { path: "../libraries/cards.pen", kind: "library", mimeType: "application/x-pencil+json" },
      { path: "../libraries/nested/tokens.pen", kind: "library", mimeType: "application/x-pencil+json" },
      { path: "../scripts/chart.js", kind: "script", mimeType: "text/javascript" },
      { path: "../libraries/shaders/glow.frag", kind: "shader", mimeType: "text/x-glsl" },
      { path: "../assets/logo.png", kind: "image", mimeType: "image/png" },
    ],
  );
});

test("fails the import when a referenced asset is missing", async () => {
  const files = fileService({
    "sample.pen": JSON.stringify({
      children: [{ id: "frame", type: "frame", fill: { type: "image", url: "missing.png" } }],
    }),
  });
  const root = { id: "root", kind: "directory", name: "project" };
  const document = { kind: "file", name: "sample.pen", relativePath: "sample.pen" };

  await assert.rejects(readPenDocument(files, root, document), /Referenced Pencil resource missing\.png is missing/);
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
  assert.deepEqual(JSON.parse(new TextDecoder().decode(files.writes[0].bytes)), { children: [] });
});

test("reads UTF-8 text safely across binary chunk boundaries", async () => {
  const source = JSON.stringify({ name: `Before ${"x".repeat(5)}🙂 after`, children: [] });
  const files = fileService({ "sample.pen": source }, 13);
  const result = await readPenDocument(
    files,
    { id: "root", kind: "directory", name: "project" },
    { kind: "file", name: "sample.pen", relativePath: "sample.pen" },
  );
  assert.equal(result.source.name, `Before ${"x".repeat(5)}🙂 after`);
});

test("rejects non-document JSON", () => {
  assert.throws(() => parsePenSource("{}"), /supported \.pen document structure/);
});

function fileService(initial, maximumReadBytes = Infinity) {
  const values = new Map(Object.entries(initial).map(([path, value]) => [
    path,
    typeof value === "string" ? new TextEncoder().encode(value) : value,
  ]));
  return {
    picks: [],
    writes: [],
    writeSessions: new Map(),
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
      const chunk = bytes.slice(offset, offset + Math.min(length, maximumReadBytes));
      return { bytes: chunk, totalBytes: bytes.byteLength, complete: offset + chunk.byteLength >= bytes.byteLength };
    },
    async beginWrite({ handleId, relativePath, expectedBytes }) {
      const writeId = `write-${this.writeSessions.size + 1}`;
      this.writeSessions.set(writeId, { handleId, relativePath, expectedBytes, chunks: [] });
      return { writeId, chunkBytes: 7 };
    },
    async writeChunk({ writeId, offset, bytes }) {
      const session = this.writeSessions.get(writeId);
      assert.equal(offset, session.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
      session.chunks.push(bytes.slice());
      return { writtenBytes: offset + bytes.byteLength };
    },
    async commitWrite(writeId) {
      const session = this.writeSessions.get(writeId);
      const bytes = new Uint8Array(session.expectedBytes);
      let offset = 0;
      for (const chunk of session.chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      this.writes.push({ handleId: session.handleId, relativePath: session.relativePath, bytes });
      this.writeSessions.delete(writeId);
    },
    async abortWrite(writeId) {
      this.writeSessions.delete(writeId);
    },
  };
}
