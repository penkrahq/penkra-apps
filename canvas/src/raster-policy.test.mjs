import assert from "node:assert/strict";
import test from "node:test";

import { effectOutset, rasterPolicyFor, skiaBlurKernelRadius } from "./raster-policy.mjs";

test("Skia blur outsets use ceil(3 sigma) with Canvas radius mapped to sigma/2", () => {
  assert.equal(skiaBlurKernelRadius(0), 0);
  assert.equal(skiaBlurKernelRadius(12), 18);
  assert.deepEqual(effectOutset({ type: "blur", radius: 12 }), { left: 18, top: 18, right: 18, bottom: 18 });
  assert.deepEqual(effectOutset({ type: "shadow", blur: 12, spread: 2, offset: { x: 4, y: 6 } }), {
    left: 16, top: 14, right: 24, bottom: 26,
  });
  assert.deepEqual(effectOutset({ type: "shadow", shadowType: "inner", blur: 12 }), { left: 0, top: 0, right: 0, bottom: 0 });
});

test("raster role policies expose the published density scales", () => {
  assert.deepEqual(rasterPolicyFor("slide"), [{ name: "1x", ppi: 96, scale: 1 }]);
  assert.throws(() => rasterPolicyFor("page"), { code: "CANVAS_RASTER_POLICY_UNDEFINED" });
  assert.deepEqual(rasterPolicyFor("route").map(({ name, scale }) => ({ name, scale })), [
    { name: "1x", scale: 1 }, { name: "2x", scale: 2 }, { name: "3x", scale: 3 },
  ]);
  assert.deepEqual(rasterPolicyFor("ios").map(({ name, scale }) => ({ name, scale })), [
    { name: "@2x", scale: 2 }, { name: "@3x", scale: 3 },
  ]);
  assert.deepEqual(rasterPolicyFor("android").map(({ name, scale }) => ({ name, scale })), [
    { name: "ldpi", scale: 0.75 }, { name: "mdpi", scale: 1 }, { name: "hdpi", scale: 1.5 },
    { name: "xhdpi", scale: 2 }, { name: "xxhdpi", scale: 3 }, { name: "xxxhdpi", scale: 4 },
  ]);
});
