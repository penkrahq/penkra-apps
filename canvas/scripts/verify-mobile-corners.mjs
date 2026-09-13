import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { measureMobileColorRegions } from "./measure-mobile-color-regions.mjs";

const [path, density] = process.argv.slice(2);
const scale = Number(density);
assert.ok(Number.isFinite(scale) && scale > 0);
const report = await measureMobileColorRegions(path);
assert.equal(report.regions.length, 8);
const ck = await getCanvasKit();
const image = ck.MakeImageFromEncoded(await readFile(path));
const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
image.delete();
const radii = [[20, 20, 20, 20], [0, 20, 40, 60], [80, 120, 160, 200], [40, 0, 0, 0]];
const deviations = [];
for (const [index, region] of report.regions.entries()) {
  assert.ok(Math.abs(region.width - 300 * scale) <= 2);
  assert.ok(Math.abs(region.height - 70 * scale) <= 2);
  const reference = new ck.Path();
  reference.addRRect(Float32Array.from([0, 0, 300, 70, ...radii[Math.floor(index / 2)].flatMap((radius) => [radius, radius])]));
  try {
    for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
      const offset = ((region.y + y) * report.width + region.x + x) * 4;
      const painted = [244, 162, 97].every((value, channel) => Math.abs(pixels[offset + channel] - value) <= 1);
      const px = (x + 0.5) / scale; const py = (y + 0.5) / scale;
      const expected = reference.contains(px, py);
      if (painted === expected) continue;
      const tolerance = 2 / scale;
      if ([-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => reference.contains(px + dx * tolerance, py + dy * tolerance) !== expected))) continue;
      if (deviations.length < 20) deviations.push({ region: index, x, y, expected, painted });
    }
  } finally { reference.delete(); }
}
assert.deepEqual(deviations, []);
console.log(JSON.stringify({ path, scale, regions: 8, maxBoundaryTolerancePixels: 2, verified: true }, null, 2));
