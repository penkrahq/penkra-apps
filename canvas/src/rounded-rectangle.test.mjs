import assert from "node:assert/strict";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { roundedRectangleVector } from "./rounded-rectangle.mjs";

test("rounded rectangle paths match Canvas round-rectangle coverage", async () => {
  const ck = await getCanvasKit();
  for (const value of [0, 20, 500, [0, 10, 25, 40], [15], [], [-5, 20, 400, 500]]) {
    const radii = Array.isArray(value) ? Array.from({ length: 4 }, (_, i) => Math.max(0, value[i] ?? 0)) : [value, value, value, value];
    const vector = roundedRectangleVector({ id: "rounded", geometry: { w: 160, h: 80 }, paint: { cornerRadius: value } });
    const reference = new ck.Path();
    reference.addRRect(Float32Array.from([0, 0, 160, 80, ...radii.flatMap((r) => [r, r])]));
    const actual = ck.Path.MakeFromSVGString(vector.d);
    try {
      // Subpixel-offset probes avoid testing exactly on an antialiased edge.
      for (let y = 0.37; y < 80; y += 1) for (let x = 0.37; x < 160; x += 1) {
        assert.equal(actual.contains(x, y), reference.contains(x, y), `radii=${JSON.stringify(value)}, point=${x},${y}`);
      }
    } finally { reference.delete(); actual.delete(); }
  }
  for (const cornerRadius of [NaN, Infinity, "20", [1, 2, 3, 4, 5]]) assert.throws(() => roundedRectangleVector({ id: "bad", geometry: { w: 160, h: 80 }, paint: { cornerRadius } }));
});
