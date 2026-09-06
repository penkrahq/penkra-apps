import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { measureMobileColorRegions } from "../scripts/measure-mobile-color-regions.mjs";

for (const [device, scale] of [["iphone", 3], ["ipad", 2], ["android", 2.625], ["android-320", 2]]) {
  test(`${device} rounded clipping excludes corner artwork only when clip is enabled`, async () => {
    const path = fileURLToPath(new URL(`../research/local-rounded-clipping-20260906/${device}.png`, import.meta.url));
    const { regions } = await measureMobileColorRegions(path, "2A9D8F");
    assert.equal(regions.length, 4);
    const ck = await getCanvasKit();
    const image = ck.MakeImageFromEncoded(await readFile(path));
    assert.ok(image);
    try {
      const width = image.width(), height = image.height();
      const pixels = image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
      const sample = (region, coordinate) => {
        const offset = ((region.y + Math.round(coordinate * scale)) * width + region.x + Math.round(coordinate * scale)) * 4;
        return Array.from(pixels.slice(offset, offset + 3));
      };
      for (const [index, region] of regions.entries()) {
        // For radius=30, (5,5) lies outside the quarter circle; (20,20) lies inside.
        assert.deepEqual(sample(region, 5), index < 2 ? [42, 157, 143] : [246, 242, 234]);
        assert.deepEqual(sample(region, 20), [42, 157, 143]);
      }
      assert.ok(regions[2].interiorPixels < regions[0].interiorPixels);
      assert.ok(regions[3].interiorPixels < regions[1].interiorPixels);
    } finally { image.delete(); }
  });
}
