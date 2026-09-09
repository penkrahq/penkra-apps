import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

const root = new URL("../research/mobile-capability-completion-20260908/", import.meta.url);

test("stable phone captures measure native line, transform, gradients, clipping, and layout families", async () => {
  const ck = await getCanvasKit();
  for (const fixture of [
    { file: "ios-iphone-light-3x.png", width: 1206, height: 2622, scale: 3, linearBounds: { minX: 20, maxX: 750, minY: 450, maxY: 900 }, colors: { navy: [11, 74, 111], orange: [244, 162, 97], slate: [38, 70, 83], coral: [231, 111, 81], yellow: [233, 196, 106], teal: [42, 157, 143] } },
    { file: "android-phone-light-420dpi.png", width: 1080, height: 2400, scale: 2.625, linearBounds: { minX: 20, maxX: 700, minY: 280, maxY: 650 }, colors: { navy: [12, 75, 111], orange: [244, 162, 98], slate: [39, 71, 84], coral: [231, 111, 82], yellow: [233, 196, 107], teal: [43, 157, 143] } },
  ]) {
    const image = ck.MakeImageFromEncoded(await readFile(new URL(fixture.file, root)));
    assert.ok(image); assert.equal(image.width(), fixture.width); assert.equal(image.height(), fixture.height);
    const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
    const line = componentsForColor(pixels, image.width(), image.height(), fixture.file.startsWith("ios") ? [18, 52, 86] : [19, 53, 87]).filter(({ count }) => count > 250);
    assert.ok(line.length >= 14, `${fixture.file}: diagonal dash components`);
    const horizontal = colorBounds(pixels, image.width(), fixture.colors.coral, { minX: 0, maxX: image.width(), minY: 100, maxY: 700 });
    const vertical = colorBounds(pixels, image.width(), fixture.colors.teal, { minX: 0, maxX: image.width(), minY: 100, maxY: 700 });
    assert.ok(horizontal.width > 250 * fixture.scale && horizontal.height < 10 * fixture.scale, `${fixture.file}: zero-height line`);
    assert.ok(vertical.height > 35 * fixture.scale && vertical.width < 10 * fixture.scale, `${fixture.file}: zero-width line`);

    const clip = componentsForColor(pixels, image.width(), image.height(), fixture.colors.navy).find(({ count }) => count > 100_000);
    const overflow = componentsForColor(pixels, image.width(), image.height(), fixture.colors.orange).find(({ count }) => count > 10_000);
    assert.equal(clip.width, Math.round(300 * fixture.scale));
    assert.equal(overflow.width, Math.round(clip.width * 60 / 300));
    const layout = componentsForColor(pixels, image.width(), image.height(), fixture.colors.slate).filter(({ count }) => count > 50_000);
    assert.equal(layout.length, 2);
    const constrained = componentsForColor(pixels, image.width(), image.height(), fixture.colors.coral).find(({ width, height }) => width === Math.round(80 * fixture.scale) && height === Math.round(40 * fixture.scale));
    assert.ok(constrained, `${fixture.file}: min/max resolved to 80x40`);

    const linear = colorCentroids(pixels, image.width(), fixture.linearBounds);
    assert.ok(linear.blue.count > 10_000 && linear.red.count > 8_000);
    assert.ok(linear.blue.x + 150 < linear.red.x, `${fixture.file}: flipX`);
    assert.ok(linear.blue.y + 25 < linear.red.y, `${fixture.file}: rotation`);

    const angular = colorCentroids(pixels, image.width(), { minX: 20, maxX: 750, minY: 550, maxY: 1150 });
    assert.ok(angular.red.count > 5_000 && angular.green.count > 5_000 && angular.blue.count > 10_000);
    const purple = colorBounds(pixels, image.width(), fixture.file.startsWith("ios") ? [106, 76, 147] : [107, 77, 147], { minX: 0, maxX: image.width(), minY: 700, maxY: 1800 });
    assert.ok(purple.width > 150 * fixture.scale && purple.height > 80 * fixture.scale, `${fixture.file}: rotated nonuniform radial bounds`);
    image.delete();
  }
});

test("runtime captures measure appearance and viewport axes", async () => {
  const ck = await getCanvasKit();
  for (const [file, color, minCount] of [["ios-iphone-dark-3x.png", [220, 234, 247], 1_000_000], ["android-phone-dark-420dpi.png", [220, 234, 247], 1_000_000]]) {
    const image = ck.MakeImageFromEncoded(await readFile(new URL(file, root))); const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
    assert.ok(componentsForColor(pixels, image.width(), image.height(), color).some(({ count }) => count > minCount)); image.delete();
  }
  for (const [file, color] of [["ios-ipad-wide-2x.png", [233, 196, 106]], ["android-wide-light-320dpi.png", [233, 196, 106]]]) {
    const image = ck.MakeImageFromEncoded(await readFile(new URL(file, root))); const pixels = image.readPixels(0, 0, { width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
    assert.ok(componentsForColor(pixels, image.width(), image.height(), color).some(({ width, height }) => width === 280 && height === 48)); image.delete();
  }
});

function componentsForColor(pixels, width, height, color) {
  const seen = new Uint8Array(width * height);
  const result = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    if (seen[index] || !matches(pixels, index, color)) continue;
    seen[index] = 1;
    const stack = [index];
    let count = 0, minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const current = stack.pop();
      const cy = Math.floor(current / width), cx = current % width;
      count += 1; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, next = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || seen[next] || !matches(pixels, next, color)) continue;
        seen[next] = 1; stack.push(next);
      }
    }
    result.push({ count, minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return result;
}

function matches(pixels, index, color) {
  const offset = index * 4;
  return pixels[offset] === color[0] && pixels[offset + 1] === color[1] && pixels[offset + 2] === color[2] && pixels[offset + 3] === 255;
}

function colorCentroids(pixels, width, bounds) {
  const sums = { red: { count: 0, x: 0, y: 0 }, green: { count: 0, x: 0, y: 0 }, blue: { count: 0, x: 0, y: 0 } };
  for (let y = bounds.minY; y < bounds.maxY; y += 1) for (let x = bounds.minX; x < bounds.maxX; x += 1) {
    const offset = (y * width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
    const key = r > g + 30 && r > b + 30 ? "red" : g > r + 30 && g > b + 30 ? "green" : b > r + 30 && b > g + 30 ? "blue" : null;
    if (key) { sums[key].count += 1; sums[key].x += x; sums[key].y += y; }
  }
  return Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, { count: value.count, x: value.x / value.count, y: value.y / value.count }]));
}

function colorBounds(pixels, width, color, bounds) {
  let minX = bounds.maxX, maxX = bounds.minX, minY = bounds.maxY, maxY = bounds.minY;
  for (let y = bounds.minY; y < bounds.maxY; y += 1) for (let x = bounds.minX; x < bounds.maxX; x += 1) {
    if (!matches(pixels, y * width + x, color)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1 };
}
