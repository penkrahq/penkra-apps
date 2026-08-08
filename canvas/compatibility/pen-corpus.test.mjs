import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { corpusFiles } from "./corpus-files.mjs";
import {
  clonePenDocument,
  compareOutsidePointers,
  inspectPenDocument,
  parsePenDocument,
  readPenDocument,
  replaceNodeProperty,
} from "./pen-corpus.mjs";

for (const { label, url } of corpusFiles) {
  test(`${label} parses, round-trips, and has stable IDs`, async () => {
    const document = await readPenDocument(fileURLToPath(url));
    const inspection = inspectPenDocument(document);
    assert.ok(inspection.nodeCount > 0);
    assert.deepEqual(inspection.duplicateIds, []);
    assert.deepEqual(clonePenDocument(document), document);
    assert.deepEqual(JSON.parse(JSON.stringify(document)), document);
  });
}

test("the pinned OpenPencil oracle covers the current corpus bytes", async () => {
  const oracle = JSON.parse(
    await readFile(new URL("./openpencil-oracle.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    oracle.documents.map(({ label, sha256 }) => ({ label, sha256 })),
    await Promise.all(
      corpusFiles.map(async ({ label, url }) => ({
        label,
        sha256: createHash("sha256").update(await readFile(url)).digest("hex"),
      })),
    ),
  );
});

test("unknown root, node, and property data survives a known-property edit", async () => {
  const before = await readPenDocument(
    fileURLToPath(new URL("./fixtures/unknown-content-2.15.pen", import.meta.url)),
  );
  const { document: after, pointer } = replaceNodeProperty(before, "known-frame", "width", 640);
  assert.equal(after.children[0].width, 640);
  assert.equal(compareOutsidePointers(before, after, [pointer]), true);
  assert.deepEqual(after.futureDocumentField, before.futureDocumentField);
  assert.deepEqual(after.children[0].futureNodeField, before.children[0].futureNodeField);
  assert.deepEqual(after.children[0].children[0], before.children[0].children[0]);
});

test("inspection reports unsupported node types without rejecting or rewriting them", async () => {
  const document = await readPenDocument(
    fileURLToPath(new URL("./fixtures/unknown-content-2.15.pen", import.meta.url)),
  );
  assert.deepEqual(inspectPenDocument(document).nodeTypes, {
    frame: 1,
    future_vector_mesh: 1,
  });
});

test("format versions are data, not a hard-coded acceptance list", () => {
  const document = parsePenDocument('{"version":"99.4-experimental","children":[]}');
  assert.equal(document.version, "99.4-experimental");
});

test("structural corruption fails clearly", () => {
  assert.throws(() => parsePenDocument("[]", "array.pen"), /JSON object/);
  assert.throws(() => parsePenDocument('{"children":[]}', "missing-version.pen"), /version/);
  assert.throws(() => parsePenDocument('{"version":"2.15"}', "missing-children.pen"), /children/);
  assert.throws(() => parsePenDocument("{", "invalid.pen"), /not valid JSON/);
});

test("duplicate IDs and unresolved local refs are observable corpus failures", () => {
  const document = parsePenDocument(JSON.stringify({
    version: "2.15",
    children: [
      { id: "same", type: "frame" },
      { id: "same", type: "rectangle" },
      { id: "instance", type: "ref", ref: "missing" },
    ],
  }));
  const inspection = inspectPenDocument(document);
  assert.deepEqual(inspection.duplicateIds.map(({ id }) => id), ["same"]);
  assert.deepEqual(inspection.unresolvedLocalRefs, ["missing"]);
});
