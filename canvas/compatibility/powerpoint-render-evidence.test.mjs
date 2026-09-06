import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

// Retained native application screenshots, not a substitute renderer. The
// rectangles are the measured slide bounds in each complete window capture.
test("native PowerPoint matrix matches Canvas and rejects the former nonzero-hole output", async (context) => {
  const ck = await getCanvasKit();
  const reference = await decode(ck, "powerpoint-vector-matrix-fixed/canvas-native-vectors.png");
  const fixed = await decode(ck, "powerpoint-vector-matrix-fixed/powerpoint-native-matrix.jpeg");
  const before = await decode(ck, "powerpoint-vector-matrix/powerpoint-native-matrix.jpeg");
  const measured = compare(fixed, reference, { x: 406, y: 161, width: 770, height: 566 });
  assert.equal(measured.mismatches, 0, JSON.stringify(measured));
  assert.ok(measured.checked > 300000);
  const negative = compare(before, reference, { x: 406, y: 161, width: 769, height: 565 });
  assert.ok(negative.mismatches > 0, JSON.stringify(negative));
  context.diagnostic(JSON.stringify({ fixed: measured, negative }));
});

async function decode(ck, name) {
  const image = ck.MakeImageFromEncoded(await readFile(new URL(`../research/${name}`, import.meta.url)));
  assert.ok(image);
  const width = image.width(), height = image.height();
  try { return { width, height, pixels: image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) }; }
  finally { image.delete(); }
}

function ink(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.pixels[offset] < 60 && image.pixels[offset + 1] < 120 && image.pixels[offset + 2] < 160;
}

function compare(actual, reference, rect) {
  let checked = 0, mismatches = 0;
  const examples = [];
  const sample = (x, y) => ink(reference, Math.floor((x + 0.5 - rect.x) * reference.width / rect.width), Math.floor((y + 0.5 - rect.y) * reference.height / rect.height));
  for (let y = rect.y + 3; y < rect.y + rect.height - 3; y++) for (let x = rect.x + 3; x < rect.x + rect.width - 3; x++) {
    const expected = sample(x, y);
    let uniform = true;
    for (let dy = -2; dy <= 2 && uniform; dy++) for (let dx = -2; dx <= 2 && uniform; dx++) if (sample(x + dx, y + dy) !== expected) uniform = false;
    if (!uniform) continue;
    checked++;
    if (ink(actual, x, y) !== expected) {
      mismatches++;
      if (examples.length < 10) examples.push({ x, y, expected });
    }
  }
  return { checked, mismatches, examples, boundaryTolerancePixels: 2 };
}
