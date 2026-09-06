import assert from "node:assert/strict";
import { measureMobileColorRegions } from "./measure-mobile-color-regions.mjs";

const [path, density] = process.argv.slice(2);
const scale = Number(density);
assert.ok(Number.isFinite(scale) && scale > 0, "Provide the measured device pixels-per-point/dp density.");
const report = await measureMobileColorRegions(path);
const expected = [
  [0, 0, 50, 40], [80, 0, 50, 40], [160, 0, 50, 40],
  [0, 78, 50, 40], [0, 143, 50, 40],
  [0, 222, 80, 35], [110, 222, 80, 35], [220, 222, 80, 35], [0, 282, 80, 35], [110, 282, 80, 35],
  [0, 376, 135, 45], [165, 376, 135, 45], [0, 446, 135, 45], [165, 446, 135, 45],
];
assert.equal(report.regions.length, expected.length);
const origin = report.regions[0];
for (const [index, region] of report.regions.entries()) {
  const actual = [region.x - origin.x, region.y - origin.y, region.width, region.height];
  expected[index].forEach((value, coordinate) => assert.ok(Math.abs(actual[coordinate] - value * scale) <= 2, `Region ${index}, coordinate ${coordinate}: expected ${value * scale}, measured ${actual[coordinate]}`));
}
console.log(JSON.stringify({ path, scale, regions: report.regions.length, maxPixelTolerance: 2, columnGap: 30, rowGap: 25, rootGap: 14, verified: true }, null, 2));
