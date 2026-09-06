import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

for (const device of ["iphone-large", "ipad", "android"]) {
  test(`${device} native multiline ink retains start, center, and end anchors`, async () => {
    const ck = await getCanvasKit();
    const image = ck.MakeImageFromEncoded(await readFile(new URL(`../research/local-text-alignment-20260906/${device}.png`, import.meta.url)));
    assert.ok(image);
    try {
      const width = image.width(), height = image.height();
      const pixels = image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
      const lines = [];
      let line = null;
      for (let y = 0; y < height; y += 1) {
        let min = width, max = -1;
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          if (pixels[offset] === 18 && pixels[offset + 1] === 52 && pixels[offset + 2] === 86) {
            min = Math.min(min, x); max = Math.max(max, x);
          }
        }
        if (max >= 0) line = { min: Math.min(line?.min ?? min, min), max: Math.max(line?.max ?? max, max) };
        else if (line) { lines.push(line); line = null; }
      }
      if (line) lines.push(line);
      assert.equal(lines.length, 6, "two complete lines in each of three alignment controls");
      // Bounded anchor check, not a Canvas/native glyph-difference verdict.
      // The two strings have different ink side bearings, so compare anchors
      // within two physical pixels rather than claiming identical glyph edges.
      assert.ok(Math.abs(lines[0].min - lines[1].min) <= 2);
      assert.ok(Math.abs((lines[2].min + lines[2].max) / 2 - (lines[3].min + lines[3].max) / 2) <= 2);
      assert.ok(Math.abs(lines[4].max - lines[5].max) <= 2);
      assert.ok(lines[0].min < lines[2].min && lines[2].min < lines[4].min);
      assert.ok(lines[1].min < lines[3].min && lines[3].min < lines[5].min);
    } finally { image.delete(); }
  });
}
