import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "migration-manifests");
const expected = Object.freeze({
  "092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9": { sequence: 1434, entries: 464, clone: 318, properties: 146 },
  "09c0a937-3e64-478c-a7ff-4daa836bc169": { sequence: 297, entries: 51, clone: 22, properties: 29 },
  "7928b2a5-7106-4008-a7a8-e477aeed4ca7": { sequence: 0, entries: 15, clone: 13, properties: 2 },
  "e620f165-b7b9-4404-8b79-e8ce7654b96c": { sequence: 0, entries: 15, clone: 13, properties: 2 },
});
const propertyTypes = new Set(["string", "number", "boolean", "color", "icon", "node"]);

for (const [documentId, counts] of Object.entries(expected)) {
  test(`M4 manifest ${documentId} is explicit, complete and typed`, async () => {
    const manifest = JSON.parse(await readFile(path.join(directory, `${documentId}.m4.json`), "utf8"));
    assert.equal(manifest.migration, "M4");
    assert.equal(manifest.documentId, documentId);
    assert.equal(manifest.sourceSequence, counts.sequence);
    assert.ok(manifest.method.includes("Canvas documents.execute"));
    const entries = Object.entries(manifest.entries);
    assert.equal(entries.length, counts.entries);
    assert.equal(entries.filter(([, entry]) => entry.action === "clone").length, counts.clone);
    assert.equal(entries.filter(([, entry]) => entry.action === "properties").length, counts.properties);
    for (const [instanceId, entry] of entries) {
      assert.ok(instanceId);
      assert.ok(entry.evidence?.trim());
      assert.ok(entry.action === "clone" || entry.action === "properties");
      if (entry.action !== "properties") continue;
      assert.equal(typeof entry.bindings, "object");
      assert.equal(typeof entry.definitions, "object");
      assert.deepEqual(Object.keys(entry.bindings).sort(), Object.keys(entry.definitions).sort());
      for (const [name, definition] of Object.entries(entry.definitions)) {
        assert.ok(propertyTypes.has(definition.type), `${instanceId}.${name} has unsupported type ${definition.type}`);
        assert.ok(Object.hasOwn(definition, "default"), `${instanceId}.${name} has no source default`);
        assert.equal(typeof entry.bindings[name].path, "string");
        assert.equal(typeof entry.bindings[name].property, "string");
      }
    }
  });
}
