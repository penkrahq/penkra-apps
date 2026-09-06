import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const INK_THRESHOLD = 2;

export function rowHistogram(pixels, width, height, threshold = INK_THRESHOLD) {
  const rows = Array.from({ length: height }, () => 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInkPixel(pixels, (y * width + x) * 4, threshold)) rows[y] += 1;
    }
  }
  return rows;
}

export function isInkPixel(pixels, offset, threshold = INK_THRESHOLD) {
  const alpha = pixels[offset + 3];
  return alpha > threshold && pixels.slice(offset, offset + 3).some((channel) => Math.abs(channel - 255) > threshold);
}

export function inkBands(pixels, width, height, threshold = INK_THRESHOLD) {
  const rows = rowHistogram(pixels, width, height, threshold);
  const bands = [];
  let start = null;
  for (let y = 0; y <= height; y += 1) {
    const nonempty = y < height && rows[y] > 0;
    if (nonempty && start === null) start = y;
    if (!nonempty && start !== null) {
      bands.push(bandMetrics(pixels, width, start, y - 1, threshold, rows));
      start = null;
    }
  }
  return { rowHistogram: rows, bands, inkBounds: unionBounds(bands.map((band) => band.bounds)) };
}

function unionBounds(boundsList) {
  const bounds = boundsList.filter(Boolean);
  if (!bounds.length) return null;
  return bounds.reduce((result, current) => ({
    minX: Math.min(result.minX, current.minX), minY: Math.min(result.minY, current.minY),
    maxX: Math.max(result.maxX, current.maxX), maxY: Math.max(result.maxY, current.maxY),
  }));
}

function bandMetrics(pixels, width, startRow, endRow, threshold, rows) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (let y = startRow; y <= endRow; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInkPixel(pixels, (y * width + x) * 4, threshold)) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    startRow,
    endRow,
    rowCount: rows.slice(startRow, endRow + 1).reduce((sum, value) => sum + value, 0),
    count,
    bounds: count ? { minX, minY, maxX, maxY } : null,
  };
}

export function toPointValue(value, scale) {
  return value / scale;
}

export function toPointBounds(bounds, scale) {
  if (!bounds) return null;
  return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, toPointValue(value, scale)]));
}

export function toPointBand(band, scale) {
  return {
    ...band,
    startRow: toPointValue(band.startRow, scale),
    endRow: toPointValue(band.endRow, scale),
    bounds: toPointBounds(band.bounds, scale),
  };
}

export function compareBounds(reference, actual) {
  if (!reference || !actual) return null;
  return Object.fromEntries(Object.keys(reference).map((key) => [key, actual[key] - reference[key]]));
}

export async function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function decodePngMetrics(ck, bytes, scale) {
  const image = ck.MakeImageFromEncoded(bytes);
  if (!image) throw new Error("CanvasKit could not decode PNG input.");
  try {
    const width = image.width();
    const height = image.height();
    const pixels = image.readPixels(0, 0, {
      width,
      height,
      colorType: ck.ColorType.RGBA_8888,
      alphaType: ck.AlphaType.Unpremul,
      colorSpace: ck.ColorSpace.SRGB,
    });
    if (!pixels) throw new Error("CanvasKit could not read decoded PNG pixels.");
    const metric = inkBands(pixels, width, height);
    return {
      width,
      height,
      scale,
      pointDimensions: { width: toPointValue(width, scale), height: toPointValue(height, scale) },
      inkBounds: metric.inkBounds,
      pointInkBounds: toPointBounds(metric.inkBounds, scale),
      rowHistogram: metric.rowHistogram,
      bands: metric.bands,
      pointBands: metric.bands.map((band) => toPointBand(band, scale)),
    };
  } finally {
    image.delete();
  }
}

export async function analyzePngFile(ck, path, relativePath, scale) {
  const bytes = await readFile(path);
  return {
    path: relativePath,
    sha256: await hashBytes(bytes),
    bytes: bytes.length,
    ...await decodePngMetrics(ck, bytes, scale),
  };
}
