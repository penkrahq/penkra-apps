import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export const ROLELESS_SPECS = Object.freeze([
  [80, 60], [120, 90], [200, 100], [90, 140],
].flatMap(([width, height]) => [[0, 0], [50, 80], [-40, -30]].map(([x, y]) => Object.freeze({
  id: `root-${width}x${height}-${x < 0 ? "neg" + -x : x}-${y < 0 ? "neg" + -y : y}`,
  width, height, x, y,
}))));

export const TRANSLATIONS = Object.freeze([[0, 0], [50, 80], [-40, -30]]);
export const MARKER = Object.freeze({ x: 10, y: 12, width: 20, height: 16, color: "#123456" });
export const TRIANGLE = Object.freeze({
  x: 40, y: 15, width: 30, height: 25, fill: "#ff0000",
  geometry: "M 0 25 L 15 0 L 30 25 Z", viewBox: Object.freeze([0, 0, 30, 25]),
});

export function rolelessDocument(specs = ROLELESS_SPECS) {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: specs.map((spec) => ({
      id: spec.id, type: "frame", x: spec.x, y: spec.y, width: spec.width, height: spec.height,
      layout: "none", fill: "#ffffff", children: [
        { id: `${spec.id}-marker`, type: "rectangle", x: MARKER.x, y: MARKER.y, width: MARKER.width, height: MARKER.height, fill: MARKER.color },
        { id: `${spec.id}-triangle`, type: "path", x: TRIANGLE.x, y: TRIANGLE.y, width: TRIANGLE.width, height: TRIANGLE.height,
          fill: TRIANGLE.fill, geometry: TRIANGLE.geometry, viewBox: [...TRIANGLE.viewBox] },
      ],
    })),
  };
}

export function physicalDocument(spec = ROLELESS_SPECS[0]) {
  const document = rolelessDocument([spec]);
  Object.assign(document.children[0], { physical: { w: 210, h: 297, unit: "mm" }, bleed: 9 });
  return document;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodePng(bytes) {
  const source = Buffer.from(bytes);
  if (source.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) throw new Error("PNG signature is invalid.");
  let offset = 8;
  let width; let height; let bitDepth; let colorType;
  const idats = [];
  while (offset < source.length) {
    const length = source.readUInt32BE(offset); offset += 4;
    const type = source.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const data = source.subarray(offset, offset + length); offset += length;
    offset += 4;
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === "IDAT") idats.push(data);
    if (type === "IEND") break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`Unsupported PNG color model ${colorType}/${bitDepth}.`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idats));
  const pixels = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset++];
    const rowStart = y * stride;
    const priorStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[sourceOffset++];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const above = y ? pixels[priorStart + x] : 0;
      const upperLeft = y && x >= channels ? pixels[priorStart + x - channels] : 0;
      pixels[rowStart + x] = filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + above : filter === 3 ? value + Math.floor((left + above) / 2) : filter === 4 ? value + paeth(left, above, upperLeft) : (() => { throw new Error(`Unsupported PNG filter ${filter}.`); })();
    }
  }
  return { width, height, channels, pixels };
}

export function colorBounds(image, hex = MARKER.color) {
  const color = hex.replace(/^#/, "").match(/../gu).map((part) => Number.parseInt(part, 16));
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity; let samples = 0;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const index = (y * image.width + x) * image.channels;
    if (image.pixels[index] === color[0] && image.pixels[index + 1] === color[1] && image.pixels[index + 2] === color[2] && (image.channels === 3 || image.pixels[index + 3] > 0)) {
      samples += 1; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return samples ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1, samples } : { x: null, y: null, width: null, height: null, samples: 0 };
}

export function compareMarkerBounds(observed, expected, tolerance = 2) {
  if (!observed || !expected || observed.samples === 0 || !Number.isFinite(tolerance) || tolerance < 0) return { ok: false, reason: "missing or zero-sample marker measurement" };
  const fields = ["x", "y", "width", "height"];
  const deltas = Object.fromEntries(fields.map((field) => [field, Math.abs(observed[field] - expected[field])]));
  return { ok: fields.every((field) => Number.isFinite(observed[field]) && deltas[field] <= tolerance), deltas };
}

export function parseSvg(svg) {
  const root = svg.match(/<svg\b([^>]*)>/u)?.[1] ?? "";
  const viewBox = root.match(/\bviewBox="([^"]+)"/u)?.[1]?.trim().split(/\s+/u).map(Number) ?? null;
  const marker = svg.match(/<rect\b[^>]*\bid="([^"]*-marker)"[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bwidth="([^"]+)"[^>]*\bheight="([^"]+)"/u);
  const triangle = svg.match(/<path\b[^>]*\bid="([^"]*-triangle)"[^>]*\bd="([^"]+)"[^>]*\b[^>]*transform="([^"]+)"/u);
  return {
    viewBox,
    marker: marker ? { id: marker[1], x: Number(marker[2]), y: Number(marker[3]), width: Number(marker[4]), height: Number(marker[5]) } : null,
    triangle: triangle ? { id: triangle[1], d: triangle[2], transform: triangle[3] } : null,
    hasImage: /<image\b/u.test(svg),
  };
}

export async function runTool(command, args) {
  const result = await execFileAsync(command, args, { maxBuffer: 4 * 1024 * 1024 });
  return result.stdout;
}

export async function inspectPdf(path, expectedMarker = null, tolerance = 2) {
  const bytes = await readFile(path);
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  const page = pages[0];
  const info = await runTool("pdfinfo", [path]);
  const sizeMatch = info.match(/^Page size:\s+([0-9.]+) x ([0-9.]+) pts/mu);
  const images = await runTool("pdfimages", ["-list", path]);
  const pageSize = sizeMatch ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) } : null;
  let rendered = null;
  let marker = null;
  if (expectedMarker) {
    const prefix = `${path}.render72`;
    await runTool("pdftoppm", ["-r", "72", "-singlefile", "-png", path, prefix]);
    rendered = decodePng(await readFile(`${prefix}.png`));
    marker = colorBounds(rendered);
  }
  return {
    pages: pages.length,
    pageSize,
    pdfLibSize: page ? page.getSize() : null,
    mediaBox: page ? page.getMediaBox() : null,
    bleedBox: page ? page.getBleedBox() : null,
    trimBox: page ? page.getTrimBox() : null,
    imageXObjectLines: images.split(/\r?\n/u).filter((line) => /^\s*\d+\s+\d+\s+\d+\s+image\s/u.test(line)),
    rendered: rendered ? { width: rendered.width, height: rendered.height } : null,
    marker,
    markerComparison: marker && expectedMarker ? compareMarkerBounds(marker, expectedMarker, tolerance) : null,
  };
}
