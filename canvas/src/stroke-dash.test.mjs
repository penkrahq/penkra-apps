import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStrokeDash } from "./stroke-dash.mjs";

test("dash lists follow SVG repetition and zero-length semantics", () => {
  assert.deepEqual(normalizeStrokeDash([5, 3, 2]), [5, 3, 2, 5, 3, 2]);
  assert.deepEqual(normalizeStrokeDash([12]), [12, 12]);
  assert.deepEqual(normalizeStrokeDash([0, 12]), [0, 12]);
  assert.deepEqual(normalizeStrokeDash([12, 0]), [12, 0]);
  for (const value of [undefined, null, [], [0], [0, 0, 0]]) assert.deepEqual(normalizeStrokeDash(value), []);
  const source = [12, 6]; const copy = normalizeStrokeDash(source);
  assert.deepEqual(copy, source); assert.notEqual(copy, source);
});

test("invalid dash values fail without coercion", () => {
  for (const value of ["12,6", {}, [-1, 6], [NaN, 6], [Infinity, 6], ["12", 6]]) {
    assert.throws(() => normalizeStrokeDash(value), /finite non-negative/u);
  }
});
