import assert from "node:assert/strict";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

function positiveInteger(value, label) {
  assert.ok(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function finiteNumber(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
}

export function validateCropRect(rect, image) {
  assert.ok(rect && image, "crop rectangle and image are required");
  for (const key of ["x", "y", "width", "height"]) positiveInteger(rect[key], `crop ${key}`);
  positiveInteger(image.width, "image width");
  positiveInteger(image.height, "image height");
  assert.ok(rect.x + rect.width <= image.width, "crop exceeds image width");
  assert.ok(rect.y + rect.height <= image.height, "crop exceeds image height");
  return rect;
}

export function cropRectFromRootReceipt(receipt, image, expectedRoot = { width: 340, height: 400 }) {
  assert.ok(receipt && receipt.root && receipt.screen, "root geometry receipt is required");
  const scale = receipt.scale;
  finiteNumber(scale, "receipt scale");
  assert.ok(Number.isInteger(scale) && scale > 0, "receipt scale must be a positive integer");
  for (const key of ["x", "y", "width", "height"]) finiteNumber(receipt.root[key], `root ${key}`);
  for (const key of ["x", "y", "width", "height"]) finiteNumber(receipt.screen[key], `screen ${key}`);
  assert.equal(receipt.root.width, expectedRoot.width, "root width does not equal authored root width");
  assert.equal(receipt.root.height, expectedRoot.height, "root height does not equal authored root height");
  assert.equal(Math.round(receipt.screen.width * scale), image.width, "screen width does not match screenshot pixels");
  assert.equal(Math.round(receipt.screen.height * scale), image.height, "screen height does not match screenshot pixels");
  const rect = {
    x: receipt.root.x * scale,
    y: receipt.root.y * scale,
    width: receipt.root.width * scale,
    height: receipt.root.height * scale,
  };
  for (const key of ["x", "y", "width", "height"]) assert.ok(Number.isInteger(rect[key]), `physical root ${key} must be an integer`);
  assert.ok(rect.x >= 0 && rect.y >= 0, "root is offscreen above or left of screenshot");
  return validateCropRect(rect, image);
}

export function decodePngBytes(bytes, canvasKit) {
  assert.ok(bytes && bytes.length > 0, "PNG bytes are required");
  const image = canvasKit.MakeImageFromEncoded(bytes);
  assert.ok(image, "CanvasKit could not decode PNG bytes");
  try {
    const width = image.width();
    const height = image.height();
    const pixels = image.readPixels(0, 0, {
      width,
      height,
      colorType: canvasKit.ColorType.RGBA_8888,
      alphaType: canvasKit.AlphaType.Unpremul,
      colorSpace: canvasKit.ColorSpace.SRGB,
    });
    assert.ok(pixels, "CanvasKit could not read PNG pixels");
    return { width, height, pixels: new Uint8Array(pixels) };
  } finally {
    image.delete();
  }
}

export function encodeRgbaPng(image, canvasKit) {
  positiveInteger(image.width, "image width");
  positiveInteger(image.height, "image height");
  assert.ok(image.pixels?.length === image.width * image.height * 4, "RGBA byte length does not match image dimensions");
  const encodedImage = canvasKit.MakeImage({
    width: image.width,
    height: image.height,
    colorType: canvasKit.ColorType.RGBA_8888,
    alphaType: canvasKit.AlphaType.Unpremul,
    colorSpace: canvasKit.ColorSpace.SRGB,
  }, image.pixels, image.width * 4);
  assert.ok(encodedImage, "CanvasKit could not create RGBA image");
  try {
    const bytes = encodedImage.encodeToBytes(canvasKit.ImageFormat.PNG, 100);
    assert.ok(bytes, "CanvasKit could not encode PNG");
    return Buffer.from(bytes);
  } finally {
    encodedImage.delete();
  }
}

export async function cropPngBytes(inputBytes, rect, canvasKit) {
  canvasKit ??= await getCanvasKit();
  const source = decodePngBytes(inputBytes, canvasKit);
  validateCropRect(rect, source);
  const pixels = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row += 1) {
    const sourceStart = ((rect.y + row) * source.width + rect.x) * 4;
    const targetStart = row * rect.width * 4;
    pixels.set(source.pixels.subarray(sourceStart, sourceStart + rect.width * 4), targetStart);
  }
  const output = encodeRgbaPng({ width: rect.width, height: rect.height, pixels }, canvasKit);
  const roundTrip = decodePngBytes(output, canvasKit);
  assert.equal(roundTrip.width, rect.width, "encoded crop width changed");
  assert.equal(roundTrip.height, rect.height, "encoded crop height changed");
  assert.deepEqual([...roundTrip.pixels], [...pixels], "encoded crop RGBA bytes changed");
  return { bytes: output, width: rect.width, height: rect.height, pixels };
}
