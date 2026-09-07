import assert from "node:assert/strict";
import test from "node:test";
import { assertExportAvailable, assertReleaseExportCapabilities, RELEASE_EXPORT_FORMATS } from "./export-availability.mjs";
import { assertAllCapabilityTables, unverifiedCapabilityEntries } from "./capability-tables.mjs";

test("release admits every total deliverable table with explicit fallbacks", () => {
  assert.deepEqual(RELEASE_EXPORT_FORMATS, ["pptx", "html", "swift", "kotlin"]);
  assert.equal(assertReleaseExportCapabilities(), true);
  for (const format of RELEASE_EXPORT_FORMATS) assert.doesNotThrow(() => assertExportAvailable(format));
  assert.deepEqual(unverifiedCapabilityEntries(), []);
  assert.equal(assertAllCapabilityTables(), true);
  assert.throws(() => assertExportAvailable("pdf"), { code: "CANVAS_EXPORT_FORMAT_UNAVAILABLE", format: "pdf" });
});

test("unknown public export formats reject before any account access or destination write", async () => {
  const handlers = new Map();
  let requests = 0;
  globalThis.penkra = {
    account: { request() { requests++; throw new Error("Unexpected Account request"); }, subscribe() {} },
    operations: { handle(name, handler) { handlers.set(name, handler); } },
  };
  try {
    await import(`./operations.mjs?availability=${Date.now()}`);
    await assert.rejects(handlers.get("documents.export")({ format: "pdf", documentId: "unread", destination: "/must-not-write" }), { code: "CANVAS_EXPORT_FORMAT_UNAVAILABLE", format: "pdf" });
    assert.equal(requests, 0);
    assert.equal(typeof handlers.get("documents.extract"), "function");
    assert.equal(typeof handlers.get("documents.create"), "function");
  } finally { delete globalThis.penkra; }
});
