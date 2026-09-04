import assert from "node:assert/strict";
import test from "node:test";

import { validateOutputSegment } from "./export-bundle.mjs";

test("output segments reject rather than sanitize unsafe derived names", () => {
  assert.equal(validateOutputSegment("school-logo.png"), "school-logo.png");
  for (const value of ["a/b", "a\\b", "..", "CON", "e\u0301", "x".repeat(256)]) {
    assert.throws(() => validateOutputSegment(value), /Unsafe output segment/);
  }
});
