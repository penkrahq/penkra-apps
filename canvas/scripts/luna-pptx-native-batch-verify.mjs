import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { inflateSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

import { readOoxmlPackage, readXmlPart } from "../src/ooxml-package.mjs";

const execFile = promisify(execFileCallback);
export const markerRgb = [0x12, 0x34, 0x56];

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parsePageSize(text) {
  const match = text.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/u);
  if (!match) throw new Error("pdfinfo did not report a page size");
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function inspectPdf(pdfPath, renderedPngPath) {
  const [{ stdout: info }, { stdout: text }, { stdout: fonts }] = await Promise.all([
    execFile("pdfinfo", [pdfPath]),
    execFile("pdftotext", [pdfPath, "-"]),
    execFile("pdffonts", [pdfPath]),
  ]);
  const image = decodePng(await readFile(renderedPngPath));
  const marker = findMarkerBounds(image);
  return {
    pageSizePt: parsePageSize(info),
    pages: Number(info.match(/Pages:\s+(\d+)/u)?.[1]),
    text: text.trim(),
    embeddedInter: /\bInter\b/u.test(fonts),
    renderSize: { width: image.width, height: image.height },
    marker,
  };
}

export function inspectPptx(bytes, school) {
  const xml = readXmlPart(readOoxmlPackage(bytes), "ppt/slides/slide1.xml");
  const textPresent = xml.includes(`<a:t>${school}</a:t>`);
  const pictureFallback = xml.includes("<p:pic>");
  const marker = xml.match(/name="marker"[\s\S]*?<a:off x="(\d+)" y="(\d+)"[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/u);
  return {
    textPresent,
    pictureFallback,
    markerPresent: Boolean(marker),
    markerPosition: marker ? {
      x: Number(marker[1]) / 12700,
      y: Number(marker[2]) / 12700,
      width: Number(marker[3]) / 12700,
      height: Number(marker[4]) / 12700,
    } : null,
  };
}

export function validateMarkerMeasurement(observed, expected) {
  return observed.x === expected.x && observed.y === expected.y && observed.width === expected.width && observed.height === expected.height;
}

export function decodePng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("not a PNG");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error("unsupported PNG format");
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 3);
  let rawOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + rowLength));
    rawOffset += rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 0xff;
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 3;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
    }
    previous = row;
  }
  return { width, height, pixels };
}

export function findMarkerBounds(image, tolerance = 2) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 3;
      if (markerRgb.every((channel, offset) => Math.abs(image.pixels[index + offset] - channel) <= tolerance)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function validateRetainedPath(root, relativePath) {
  const target = new URL(relativePath, `file://${root.endsWith("/") ? root : `${root}/`}`);
  try {
    await stat(target);
    return true;
  } catch { return false; }
}
