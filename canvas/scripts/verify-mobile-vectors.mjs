import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { mobileVectorFixture } from "../compatibility/mobile-vector-fixture.mjs";
import { mobileSurfaceFixture } from "../compatibility/mobile-surface-fixture.mjs";
import { mobileFontFixture } from "../compatibility/mobile-font-fixture.mjs";
import { mobilePaintFixture } from "../compatibility/mobile-paint-fixture.mjs";
import { measureMobileColorRegions } from "./measure-mobile-color-regions.mjs";

const surfaces = process.argv.includes("--surfaces");
const mixedSizes = process.argv.includes("--mixed-sizes");
const sizes = process.argv.includes("--sizes") || mixedSizes;
const fonts = process.argv.includes("--fonts") || sizes;
const paints = process.argv.includes("--paints");
const [path, density, referencePath] = process.argv.slice(2).filter(argument => !["--surfaces", "--fonts", "--paints", "--sizes", "--mixed-sizes"].includes(argument));
const source = paints ? mobilePaintFixture() : fonts ? mobileFontFixture({ sizes, mixedSizes }) : surfaces ? mobileSurfaceFixture() : mobileVectorFixture();
const registrationColor = surfaces || fonts || paints ? [228, 0, 255] : [244, 162, 97];
const scale = Number(density);
assert.ok(path && Number.isFinite(scale) && scale > 0);
const marker = await measureMobileColorRegions(path, surfaces || fonts || paints ? "E400FF" : "F4A261");
assert.equal(marker.regions.length, 1, "The fixture has exactly one registration square");
assert.ok(Math.abs(marker.regions[0].width - 10 * scale) <= 2);
assert.ok(Math.abs(marker.regions[0].height - 10 * scale) <= 2);
const [reference] = await takeDocumentScreenshots(source, [{ nodeIds: [fonts ? "screen" : "mobile-fixture"] }], new Map(), { scale, maxDimension: 4096, failOnDownscale: true });
const referenceBytes = Buffer.from(reference.data, "base64");
if (referencePath) await writeFile(referencePath, referenceBytes, { flag: "wx" });
const ck = await getCanvasKit();
function decode(bytes) {
  const image = ck.MakeImageFromEncoded(bytes);
  assert.ok(image);
  const width = image.width(), height = image.height();
  try { return { width, height, pixels: image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) }; }
  finally { image.delete(); }
}
const expected = decode(referenceBytes), actual = decode(await readFile(path));
assert.equal(expected.width, Math.ceil(393 * scale));
assert.equal(expected.height, Math.ceil(852 * scale));
let markerX = expected.width, markerY = expected.height;
for (let y = 0; y < expected.height; y++) for (let x = 0; x < expected.width; x++) {
  const offset = (y * expected.width + x) * 4;
  if (registrationColor.every((value, channel) => Math.abs(expected.pixels[offset + channel] - value) <= 1)) {
    markerX = Math.min(markerX, x); markerY = Math.min(markerY, y);
  }
}
assert.ok(markerX < expected.width && markerY < expected.height);
const dx = marker.regions[0].x - markerX, dy = marker.regions[0].y - markerY;
let checked = 0;
const glyphInteriors = fonts ? Array(5).fill(0) : null;
const deviations = [];
const deviationsByFontRow = fonts ? Array(5).fill(0) : null;
for (let y = Math.ceil(50 * scale); y < Math.floor(710 * scale); y++) for (let x = Math.ceil(10 * scale); x < Math.floor(373 * scale); x++) {
  const offset = (y * expected.width + x) * 4;
  let uniform = true;
  for (let oy = -2; oy <= 2 && uniform; oy++) for (let ox = -2; ox <= 2 && uniform; ox++) {
    const neighbor = ((y + oy) * expected.width + x + ox) * 4;
    for (let channel = 0; channel < 4; channel++) if (expected.pixels[offset + channel] !== expected.pixels[neighbor + channel]) { uniform = false; break; }
  }
  if (!uniform) continue;
  assert.ok(x + dx >= 0 && y + dy >= 0 && x + dx < actual.width && y + dy < actual.height);
  const actualOffset = ((y + dy) * actual.width + x + dx) * 4;
  checked++;
  if (glyphInteriors && [18, 52, 86].every((value, channel) => expected.pixels[offset + channel] === value)) {
    const row = Math.floor((y / scale - 100) / 110);
    if (row >= 0 && row < glyphInteriors.length) glyphInteriors[row]++;
  }
  if ([0, 1, 2, 3].some(channel => Math.abs(expected.pixels[offset + channel] - actual.pixels[actualOffset + channel]) > 2)) {
    const row = Math.floor((y / scale - 100) / 110);
    if (deviationsByFontRow && row >= 0 && row < deviationsByFontRow.length) deviationsByFontRow[row]++;
    if (deviations.length < 20) deviations.push({ x, y, expected: Array.from(expected.pixels.slice(offset, offset + 4)), actual: Array.from(actual.pixels.slice(actualOffset, actualOffset + 4)) });
  }
}
if (process.env.CANVAS_MOBILE_FIDELITY_DIAGNOSTICS) console.error(JSON.stringify({ path, deviationsByFontRow }));
assert.deepEqual(deviations, []);
assert.ok(checked > 200000 * scale ** 2);
if (glyphInteriors) assert.ok(glyphInteriors.every(count => count > 0), "Every font face has measured glyph interiors, not only background pixels");
console.log(JSON.stringify({ path, scale, cases: fonts ? 5 : surfaces || paints ? 6 : 20, checkedInteriorPixels: checked, ...(glyphInteriors ? { glyphInteriors } : {}), registeredOffset: { x: dx, y: dy }, boundaryTolerancePixels: 2, channelTolerance: 2, verified: true }, null, 2));
