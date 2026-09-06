import assert from "node:assert/strict";

export function pixels(ck, bytes, width, height) {
  const image = ck.MakeImageFromEncoded(bytes);
  assert.ok(image);
  try {
    assert.equal(image.width(), width); assert.equal(image.height(), height);
    return image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
  } finally { image.delete(); }
}

export function compareCoverage(actual, expected, width, height) {
  let checked = 0;
  // Compare every uniform interior, including background and holes. Only the
  // two-physical-pixel antialiasing boundary is excluded, at either density.
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const offset = (y * width + x) * 4;
    let uniform = true;
    for (let dy = -2; dy <= 2 && uniform; dy++) for (let dx = -2; dx <= 2 && uniform; dx++) {
      const neighbor = ((y + dy) * width + x + dx) * 4;
      for (let channel = 0; channel < 4; channel++) if (expected[offset + channel] !== expected[neighbor + channel]) { uniform = false; break; }
    }
    if (!uniform) continue;
    checked++;
    for (let channel = 0; channel < 4; channel++) assert.ok(Math.abs(actual[offset + channel] - expected[offset + channel]) <= 2,
      `Pixel coverage mismatch at ${x},${y}, channel ${channel}: actual ${actual[offset + channel]}, expected ${expected[offset + channel]}`);
  }
  assert.ok(checked > width * height * 0.75);
  return { width, height, checkedInteriorPixels: checked, boundaryTolerancePixels: 2, channelTolerance: 2 };
}
