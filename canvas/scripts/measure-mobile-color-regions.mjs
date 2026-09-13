import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

// Measures connected, near-solid ink regions in native-device screenshots.
// This is geometric evidence only, not a substitute for text/accessibility QA.
export async function measureMobileColorRegions(path, hex = "F4A261") {
if (!path || !/^[0-9a-f]{6}$/iu.test(hex)) throw new Error("Usage: node scripts/measure-mobile-color-regions.mjs screenshot.png [RRGGBB]");
const ck = await getCanvasKit();
const image = ck.MakeImageFromEncoded(await readFile(path));
if (!image) throw new Error(`Cannot decode ${path}`);
const width = image.width(); const height = image.height();
const pixels = image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
image.delete();
const color = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
const matches = new Uint8Array(width * height);
for (let index = 0; index < matches.length; index += 1) {
  matches[index] = Number(pixels[index * 4 + 3] === 255 && color.every((channel, offset) => Math.abs(pixels[index * 4 + offset] - channel) <= 1));
}
const regions = [];
for (let index = 0; index < matches.length; index += 1) {
  if (!matches[index]) continue;
  const queue = [index]; matches[index] = 0;
  let minX = width; let maxX = 0; let minY = height; let maxY = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]; const x = current % width; const y = Math.floor(current / width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    for (const neighbor of [x ? current - 1 : -1, x < width - 1 ? current + 1 : -1, y ? current - width : -1, y < height - 1 ? current + width : -1]) {
      if (neighbor >= 0 && matches[neighbor]) { matches[neighbor] = 0; queue.push(neighbor); }
    }
  }
  if (queue.length >= 50) regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, interiorPixels: queue.length });
}
return { path, color: hex, width, height, tolerance: 1, regions };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await measureMobileColorRegions(...process.argv.slice(2)), null, 2));
}
