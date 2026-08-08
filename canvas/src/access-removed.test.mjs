import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_REMOVED_HEADING,
  ACCESS_REMOVED_MESSAGE,
  assertExportAllowed,
} from "./access-removed.mjs";

test("access-removed language directs the user back without offering an export", () => {
  assert.equal(ACCESS_REMOVED_HEADING, "You no longer have access");
  assert.equal(ACCESS_REMOVED_MESSAGE, "The owner removed your access to this file.");
  assert.doesNotMatch(`${ACCESS_REMOVED_HEADING} ${ACCESS_REMOVED_MESSAGE}`, /download|local copy|export/i);
});

test("export is rejected as soon as access removal is known", () => {
  assert.throws(() => assertExportAllowed(true), /can no longer be exported/i);
  assert.doesNotThrow(() => assertExportAllowed(false));
});
