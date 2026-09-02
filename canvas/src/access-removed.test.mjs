import assert from "node:assert/strict";
import test from "node:test";
import { assertExportAllowed } from "./access-removed.mjs";

test("export is rejected as soon as access removal is known", () => {
  assert.throws(() => assertExportAllowed(true), { code: "CANVAS_ACCESS_REMOVED" });
  assert.doesNotThrow(() => assertExportAllowed(false));
});
