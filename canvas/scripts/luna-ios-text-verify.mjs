import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { buildTextDecorationDocument, CASES } from "./luna-ios-text-fixture.mjs";

export const SCALE_BY_DEVICE = Object.freeze({ iphone: 3, ipad: 2 });

export async function writeReferences(directory, scale = 1) {
  const document = buildTextDecorationDocument();
  for (const { id } of CASES) {
    const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: [id] }], new Map(), { scale, maxDimension: 4096, failOnDownscale: true });
    await writeFile(`${directory}/${id}.png`, Buffer.from(reference.data, "base64"));
  }
}

function decode(ck, bytes) {
  const image = ck.MakeImageFromEncoded(bytes);
  assert.ok(image);
  try {
    const width = image.width();
    const height = image.height();
    return { width, height, pixels: image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) };
  } finally { image.delete(); }
}

function comparePixels(expected, actual, scale) {
  const width = Math.ceil(340 * scale);
  const height = Math.ceil(180 * scale);
  assert.equal(expected.width, width);
  assert.equal(expected.height, height);
  assert.equal(actual.width, width);
  assert.equal(actual.height, height);
  let comparedPixels = 0;
  let mismatchedPixels = 0;
  const samples = [];
  // This is the same 5x5 uniform-interior test and two-channel-step tolerance
  // used by verify-mobile-vectors.mjs. Decorations are additionally checked by
  // the targeted evidence test because thin rules can be all boundary pixels.
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    let uniform = true;
    for (let oy = -2; oy <= 2 && uniform; oy += 1) for (let ox = -2; ox <= 2 && uniform; ox += 1) {
      const nx = x + ox; const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) { uniform = false; break; }
      const neighbor = (ny * width + nx) * 4;
      for (let channel = 0; channel < 4; channel += 1) if (expected.pixels[offset + channel] !== expected.pixels[neighbor + channel]) { uniform = false; break; }
    }
    if (!uniform) continue;
    comparedPixels += 1;
    const actualOffset = offset;
    if ([0, 1, 2, 3].some((channel) => Math.abs(expected.pixels[offset + channel] - actual.pixels[actualOffset + channel]) > 2)) {
      mismatchedPixels += 1;
      if (samples.length < 20) samples.push({ x, y, expected: Array.from(expected.pixels.slice(offset, offset + 4)), actual: Array.from(actual.pixels.slice(actualOffset, actualOffset + 4)) });
    }
  }
  return { comparedPixels, mismatchedPixels, boundaryTolerancePixels: 2, channelTolerance: 2, samples };
}

export async function measureCapture(referencePath, capturePath, scale) {
  const ck = await getCanvasKit();
  const expected = decode(ck, await readFile(referencePath));
  const actual = decode(ck, await readFile(capturePath));
  const comparison = comparePixels(expected, actual, scale);
  const status = comparison.mismatchedPixels === 0 ? "pass" : "mismatch";
  return {
    referencePath, capturePath, registration: { method: "center-cropped-authored-frame", dx: 0, dy: 0, boundaryTolerancePixels: 2 },
    comparedPixels: comparison.comparedPixels, mismatchedPixels: comparison.mismatchedPixels, status,
    notes: comparison.mismatchedPixels ? `Native mismatch retained; first samples: ${JSON.stringify(comparison.samples.slice(0, 3))}` : "All uniform interiors match within two channel steps.",
  };
}

export async function imageIdentity(paths) {
  const ck = await getCanvasKit();
  const encoded = await Promise.all(paths.map((path) => readFile(path)));
  const hashes = encoded.map((bytes) => createHash("sha256").update(bytes).digest("hex"));
  const decoded = encoded.map((bytes) => decode(ck, bytes));
  const pixelHashes = decoded.map((image) => createHash("sha256").update(Buffer.from(image.pixels)).digest("hex"));
  const first = decoded[0];
  const pixelIdentical = decoded.every((image) => image.width === first.width && image.height === first.height && Buffer.compare(Buffer.from(image.pixels), Buffer.from(first.pixels)) === 0);
  return {
    byteSizes: encoded.map((bytes) => bytes.byteLength),
    sha256: hashes,
    pixelSha256: pixelHashes,
    pixelDimensions: { width: first.width, height: first.height },
    byteIdentical: hashes.every((hash) => hash === hashes[0]),
    pixelIdentical,
  };
}

if (process.argv[1]?.endsWith("luna-ios-text-verify.mjs")) {
  const [, , referencePath, capturePath, scale] = process.argv;
  console.log(JSON.stringify(await measureCapture(referencePath, capturePath, Number(scale)), null, 2));
}
