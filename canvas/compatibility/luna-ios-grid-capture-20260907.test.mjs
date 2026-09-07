import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import {
  cropPngBytes,
  cropRectFromRootReceipt,
  decodePngBytes,
  encodeRgbaPng,
  validateCropRect,
  validateFullFrameHashes,
} from "../scripts/luna-ios-grid-capture-utils-20260907.mjs";
import { buildGridSources, rootGeometryReceipt } from "../scripts/luna-ios-grid-production.mjs";

function rgbaImage(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = index + 1;
    pixels[index * 4 + 1] = 100 + index;
    pixels[index * 4 + 2] = 200 - index;
    pixels[index * 4 + 3] = index % 2 ? 127 : 255;
  }
  return { width, height, pixels };
}

test("PNG byte crop preserves exact RGBA and alpha with authored dimensions", async () => {
  const canvasKit = await getCanvasKit();
  const source = rgbaImage(5, 4);
  const encoded = encodeRgbaPng(source, canvasKit);
  const inputHash = createHash("sha256").update(encoded).digest("hex");
  const crop = await cropPngBytes(encoded, { x: 1, y: 1, width: 3, height: 2 }, canvasKit);
  assert.deepEqual({ width: crop.width, height: crop.height }, { width: 3, height: 2 });
  const expected = [];
  for (let y = 1; y < 3; y += 1) for (let x = 1; x < 4; x += 1) expected.push(...source.pixels.slice((y * source.width + x) * 4, (y * source.width + x + 1) * 4));
  assert.deepEqual([...crop.pixels], expected);
  assert.equal(createHash("sha256").update(encoded).digest("hex"), inputHash);
  const decoded = decodePngBytes(crop.bytes, canvasKit);
  assert.deepEqual([...decoded.pixels], expected);
});

test("PNG crop rejects malformed, noninteger, nonfinite, and out-of-bounds rectangles", async () => {
  const canvasKit = await getCanvasKit();
  const encoded = encodeRgbaPng(rgbaImage(5, 4), canvasKit);
  for (const rect of [
    { x: -1, y: 0, width: 2, height: 2 },
    { x: 0, y: 0, width: 6, height: 2 },
    { x: 0.5, y: 0, width: 2, height: 2 },
    { x: 0, y: 0, width: Number.NaN, height: 2 },
    { x: 0, y: 0, width: 2, height: Number.POSITIVE_INFINITY },
  ]) assert.throws(() => validateCropRect(rect, { width: 5, height: 4 }), /crop/u);
  for (const receipt of [
    { root: { x: 0, y: 0, width: 340, height: 400 }, screen: { x: 0, y: 0, width: 5, height: 4 }, scale: 1.5 },
    { root: { x: 0.5, y: 0, width: 340, height: 400 }, screen: { x: 0, y: 0, width: 5, height: 4 }, scale: 1 },
    { root: { x: 4, y: 0, width: 340, height: 400 }, screen: { x: 0, y: 0, width: 5, height: 4 }, scale: 1 },
    { root: { x: 0, y: 0, width: 339, height: 400 }, screen: { x: 0, y: 0, width: 5, height: 4 }, scale: 1 },
  ]) assert.throws(() => cropRectFromRootReceipt(receipt, { width: 5, height: 4 }), /(?:scale|physical|root|screen|crop)/u);
  await assert.rejects(() => cropPngBytes(encoded, { x: 0, y: 0, width: 6, height: 2 }, canvasKit), /crop/u);
});

test("PNG crop accepts a valid zero-origin rectangle and receipt", async () => {
  const canvasKit = await getCanvasKit();
  const source = rgbaImage(4, 3);
  const encoded = encodeRgbaPng(source, canvasKit);
  const crop = await cropPngBytes(encoded, { x: 0, y: 0, width: 2, height: 2 }, canvasKit);
  assert.deepEqual([...crop.pixels], [...source.pixels.slice(0, 8), ...source.pixels.slice(16, 24)]);
  assert.deepEqual(cropRectFromRootReceipt({ root: { x: 0, y: 0, width: 2, height: 2 }, screen: { x: 0, y: 0, width: 4, height: 3 }, scale: 1 }, { width: 4, height: 3 }, { width: 2, height: 2 }), { x: 0, y: 0, width: 2, height: 2 });
});

test("full-frame hash validator requires captured, pre-crop, and post-crop hashes to all match", () => {
  const stable = { a: "a".repeat(64), b: "b".repeat(64) };
  assert.deepEqual(validateFullFrameHashes({ captured: stable, beforeCrop: { ...stable }, afterCrop: { ...stable } }).stable, true);
  assert.throws(() => validateFullFrameHashes({ captured: stable, beforeCrop: { a: "c".repeat(64), b: stable.b }, afterCrop: { ...stable } }), /changed before crop/u);
  assert.throws(() => validateFullFrameHashes({ captured: stable, beforeCrop: { ...stable }, afterCrop: { a: stable.a, b: "d".repeat(64) } }), /changed after crop/u);
  assert.throws(() => validateFullFrameHashes({ captured: { a: undefined, b: stable.b }, beforeCrop: { ...stable }, afterCrop: { ...stable } }), /lowercase SHA-256/u);
});

test("CanvasKit crops the preserved run-01 raw fullB with the authored color intact", async () => {
  const canvasKit = await getCanvasKit();
  const rawPath = new URL("../research/luna-ios-grid-production-20260907/native-run-01-corrected/captures/iphone/large/full/grid-c100-180-r60-100-normal-b.png", import.meta.url);
  const raw = await readFile(rawPath);
  const crop = await cropPngBytes(raw, { x: 195, y: 966, width: 120, height: 90 }, canvasKit);
  const decoded = decodePngBytes(crop.bytes, canvasKit);
  assert.deepEqual([...decoded.pixels.slice((44 * decoded.width + 59) * 4, (44 * decoded.width + 60) * 4)], [18, 52, 86, 255]);
});

test("root receipt is exact case/nonce evidence and supplies physical crop origin", () => {
  const log = "prefix LUNA_GRID_READY case=grid-c100-180-r60-100-normal nonce=nonce-1\n";
  const line = "LUNA_GRID_ROOT case=grid-c100-180-r60-100-normal nonce=nonce-1 frame=21.000,42.000 340.000x400.000 window=0.000,0.000 402.000x874.000 screen=0.000,0.000 402.000x874.000 scale=3.000\n";
  const receipt = rootGeometryReceipt("grid-c100-180-r60-100-normal", "nonce-1", `${log}${line}`);
  assert.deepEqual(receipt.root, { x: 21, y: 42, width: 340, height: 400 });
  assert.equal(receipt.scale, 3);
  assert.equal(rootGeometryReceipt("wrong-case", "nonce-1", `${log}${line}`), null);
  assert.equal(rootGeometryReceipt("grid-c100-180-r60-100-normal", "wrong", `${log}${line}`), null);
});

test("capture runner uses receipt-driven byte crop and unique run-02 evidence", async () => {
  const runner = await readFile(new URL("../scripts/luna-ios-grid-production-capture.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /sips/u);
  assert.match(runner, /cropRectFromRootReceipt\(readiness\.rootGeometry/u);
  assert.match(runner, /fullBeforeCrop/u);
  assert.match(runner, /fullAfterCrop/u);
  assert.match(runner, /validateFullFrameHashes\(\{ captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop \}\)/u);
  assert.match(runner, /randomUUID/u);
  assert.match(runner, /native-run-02/u);
  const { sources } = buildGridSources();
  const host = sources.get("GridFixtureHost.swift");
  assert.match(host, /GeometryReader/u);
  assert.match(host, /frame\(in: \.global\)/u);
  assert.match(host, /LUNA_GRID_ROOT case=%@ nonce=%@/u);
  assert.match(host, /scale=%\.3f/u);
  assert.match(host, /340, height: 400/u);
});
