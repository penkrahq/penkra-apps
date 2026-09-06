import assert from "node:assert/strict";
import test from "node:test";

import {
  compareBounds,
  inkBands,
  isInkPixel,
  toPointBand,
  toPointBounds,
} from "../scripts/luna-ios-text-metrics.mjs";

function image(width, height, pixels = []) {
  const output = new Uint8Array(width * height * 4);
  output.fill(255);
  for (const [x, y, rgba = [0, 0, 0, 255]] of pixels) output.set(rgba, (y * width + x) * 4);
  return output;
}

test("empty white image has no ink bands", () => {
  const result = inkBands(image(4, 3), 4, 3);
  assert.deepEqual(result.rowHistogram, [0, 0, 0]);
  assert.deepEqual(result.bands, []);
});

test("two disjoint ink bands retain full row histogram and bounds", () => {
  const result = inkBands(image(5, 7, [[1, 1], [2, 1], [3, 3], [4, 4]]), 5, 7);
  assert.deepEqual(result.rowHistogram, [0, 2, 0, 1, 1, 0, 0]);
  assert.deepEqual(result.bands.map(({ startRow, endRow, count, bounds }) => ({ startRow, endRow, count, bounds })), [
    { startRow: 1, endRow: 1, count: 2, bounds: { minX: 1, minY: 1, maxX: 2, maxY: 1 } },
    { startRow: 3, endRow: 4, count: 2, bounds: { minX: 3, minY: 3, maxX: 4, maxY: 4 } },
  ]);
});

test("a one-row underline is retained as its own pixel band when separated", () => {
  const result = inkBands(image(8, 6, [[2, 1], [2, 2], [3, 2], [4, 2], [2, 4], [3, 4], [4, 4]]), 8, 6);
  assert.deepEqual(result.rowHistogram, [0, 1, 3, 0, 3, 0]);
  assert.deepEqual(result.bands.map(({ startRow, endRow }) => [startRow, endRow]), [[1, 2], [4, 4]]);
});

test("point conversion preserves physical pixels and converts a 2x capture", () => {
  const band = { startRow: 4, endRow: 7, bounds: { minX: 10, minY: 4, maxX: 29, maxY: 7 }, count: 20, rowCount: 20 };
  assert.deepEqual(toPointBand(band, 2), { startRow: 2, endRow: 3.5, bounds: { minX: 5, minY: 2, maxX: 14.5, maxY: 3.5 }, count: 20, rowCount: 20 });
  assert.deepEqual(toPointBounds(band.bounds, 2), { minX: 5, minY: 2, maxX: 14.5, maxY: 3.5 });
});

test("one-pixel vertical shift remains visible without registration", () => {
  const reference = image(3, 4, [[1, 1]]);
  const shifted = image(3, 4, [[1, 2]]);
  const a = inkBands(reference, 3, 4);
  const b = inkBands(shifted, 3, 4);
  assert.equal(isInkPixel(reference, (1 * 3 + 1) * 4), true);
  assert.notDeepEqual(a.rowHistogram, b.rowHistogram);
  assert.deepEqual(compareBounds(a.bands[0].bounds, b.bands[0].bounds), { minX: 0, minY: 1, maxX: 0, maxY: 1 });
});
