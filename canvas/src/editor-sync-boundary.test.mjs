import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the editor persists an update outbox and never authors server snapshots", async () => {
  const source = await readFile(new URL("./app.mjs", import.meta.url), "utf8");

  assert.match(source, /new IndexeddbPersistence\(\s*canvasUpdateOutboxName\(documentId\)/u);
  assert.doesNotMatch(source, /penkra-canvas:\$\{documentId\}/u);
  assert.doesNotMatch(source, /api\.createSnapshot\(/u);
});

test("document operations do not cache a projection by sequence alone", async () => {
  const source = await readFile(new URL("./operations.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /operationDocumentCache/u);
  assert.match(source, /await api\.getDocumentProjection\(documentId\)/u);
});

test("the library reads module metadata from its collection projection", async () => {
  const source = await readFile(new URL("./app.mjs", import.meta.url), "utf8");

  assert.match(source, /module: document\.projection\?\.module \?\? null/u);
  assert.doesNotMatch(source, /getDocumentState\(/u);
  assert.doesNotMatch(source, /moduleLoaded|data-document-module/u);
});
