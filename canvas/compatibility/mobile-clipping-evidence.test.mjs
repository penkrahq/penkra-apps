import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { measureMobileColorRegions } from "../scripts/measure-mobile-color-regions.mjs";

// Geometry-only evidence for the authored --clipping fixture: an overflow child
// starts at x=240, width=100 in a width=300 container. Clipping leaves width=60.
// Ellipse edge antialiasing is not used to infer full pixel fidelity.
for (const [device, scale] of [["iphone", 3], ["ipad", 2], ["android", 2.625], ["android-320", 2]]) {
  test(`${device} clips rectangle overflow at the authored container edge`, async () => {
    const path = fileURLToPath(new URL(`../research/local-clipping-20260906/${device}.png`, import.meta.url));
    const { regions } = await measureMobileColorRegions(path);
    assert.equal(regions.length, 8);
    const [inside, overflow, , , clippedInside, clippedOverflow] = regions;
    assert.equal(inside.width, Math.round(80 * scale));
    assert.equal(clippedInside.width, inside.width);
    assert.equal(clippedInside.height, inside.height);
    assert.equal(overflow.width, Math.round(100 * scale));
    assert.equal(clippedOverflow.width, Math.round(60 * scale));
    assert.equal(clippedOverflow.height, overflow.height);
    assert.equal(clippedOverflow.x, overflow.x);
    assert.equal(clippedOverflow.interiorPixels, clippedOverflow.width * clippedOverflow.height);
    assert.ok(regions[7].width < regions[3].width);
  });
}
