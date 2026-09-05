import assert from "node:assert/strict";
import test from "node:test";

import { migrationManifestFor, registeredMigrationDocuments } from "./migration-manifest-registry.mjs";

test("the migration registry fences every reviewed Canvas corpus sequence", () => {
  const registered = registeredMigrationDocuments();
  assert.equal(registered.length, 4);
  for (const item of registered) {
    assert.doesNotThrow(() => migrationManifestFor(item.documentId, item.sourceSequence));
    assert.throws(() => migrationManifestFor(item.documentId, item.sourceSequence + 1), (error) => (
      error.code === "CANVAS_MIGRATION_MANIFEST_STALE"
    ));
  }
});

test("a document without ambiguous cases gets complete empty manifests", () => {
  assert.deepEqual(migrationManifestFor("unregistered", 9), {
    m4: { entries: {} }, m10: { entries: {} }, m11: { entries: {} },
  });
});
