import assert from "node:assert/strict";
import test from "node:test";
import { assertExportAvailable, assertReleaseExportCapabilities, RELEASE_EXPORT_FORMATS } from "./export-availability.mjs";
import { assertAllCapabilityTables, unverifiedCapabilityEntries } from "./capability-tables.mjs";

test("release admits measured deliverables without promoting mobile candidates", () => {
  assert.deepEqual(RELEASE_EXPORT_FORMATS, ["pptx", "html"]);
  assert.equal(assertReleaseExportCapabilities(), true);
  for (const format of RELEASE_EXPORT_FORMATS) assert.doesNotThrow(() => assertExportAvailable(format));
  for (const format of ["swift", "kotlin"]) {
    assert.throws(() => assertExportAvailable(format), { code: "CANVAS_EXPORT_FORMAT_UNAVAILABLE", format });
    assert.ok(unverifiedCapabilityEntries().some((entry) => entry.target === format));
  }
  assert.throws(() => assertAllCapabilityTables(), { code: "CANVAS_CAPABILITY_INCOMPLETE" });
});

test("public mobile export rejects before any account access or destination write", async () => {
  const handlers = new Map();
  let requests = 0;
  globalThis.penkra = {
    account: { request() { requests++; throw new Error("Unexpected Account request"); }, subscribe() {} },
    operations: { handle(name, handler) { handlers.set(name, handler); } },
  };
  try {
    await import(`./operations.mjs?availability=${Date.now()}`);
    for (const format of ["swift", "kotlin"]) {
      await assert.rejects(handlers.get("documents.export")({ format, documentId: "unread", destination: "/must-not-write" }), { code: "CANVAS_EXPORT_FORMAT_UNAVAILABLE", format });
    }
    assert.equal(requests, 0);
    assert.equal(typeof handlers.get("documents.extract"), "function");
    assert.equal(typeof handlers.get("documents.create"), "function");
  } finally { delete globalThis.penkra; }
});
