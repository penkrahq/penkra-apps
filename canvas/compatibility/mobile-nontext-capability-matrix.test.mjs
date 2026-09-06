import assert from "node:assert/strict";
import test from "node:test";
import { capabilityTableFor } from "../src/capability-tables.mjs";
import { MOBILE_NONTEXT_MATRIX, TYPOGRAPHY_ROWS } from "./mobile-nontext-capability-matrix.mjs";

test("non-typography mobile matrix accounts for every owned unverified row", () => {
  for (const target of ["swift", "kotlin"]) {
    const unresolved = Object.entries(capabilityTableFor(target).properties)
      .filter(([path, row]) => row.status === "unverified" && !TYPOGRAPHY_ROWS.has(path))
      .map(([path]) => path).sort();
    const accounted = Object.entries(MOBILE_NONTEXT_MATRIX)
      .filter(([, row]) => row.targets.includes(target)).map(([path]) => path).sort();
    assert.deepEqual(accounted, unresolved, `${target} non-typography ownership drifted`);
  }
});

test("each non-typography row names a fixture and concrete runtime checks", () => {
  for (const [path, row] of Object.entries(MOBILE_NONTEXT_MATRIX)) {
    assert.ok(row.fixture, `${path} has no fixture`);
    assert.ok(row.checks.length > 0, `${path} has no checks`);
    assert.ok(row.targets.length > 0, `${path} has no target`);
  }
});
