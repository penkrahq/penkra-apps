import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportCompose } from "../src/exporters/mobile.mjs";

export const DENSITIES = Object.freeze([420, 320]);
export const FONT_SCALES = Object.freeze([1, 2]);
export const CASE_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")));
export const COLORS = Object.freeze(["#123456", "#f4a261", "#2a9d8f", "#cc5500"]);

// This list is the private candidate set for this verification package. It is
// deliberately explicit; the production capability table is never edited.
export const CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.flows", "root.children",
  "roles.android", "nodes.frame", "nodes.rectangle", "nodes.ellipse",
  "properties.fill", "properties.fill.solid", "properties.layout", "properties.gap", "properties.rowGap", "properties.columnGap",
  "properties.padding", "properties.justifyContent", "properties.alignItems", "properties.wrap", "properties.gridTemplateColumns",
  "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow", "properties.layoutPosition",
]);

const rootDir = resolve(import.meta.dirname, "..");
const composeSourceDir = resolve(rootDir, "compatibility/mobile-fixtures/compose/app/src/main/java/generated/canvas");
const defaultEvidenceDir = resolve(rootDir, "research/luna-android-layout-20260906");

export function caseDocument(caseId) {
  const id = String(caseId).padStart(2, "0");
  assert.ok(CASE_IDS.includes(id), `Unknown Android layout case ${caseId}`);
  const children = caseChildren(id);
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: `luna-case-${id}`, type: "frame", role: "android", name: "Mobile Fixture", x: 0, y: 0, width: 340, height: 300,
      layout: "none", fill: "#FFFFFF", children,
    }],
  };
}

function caseChildren(id) {
  const rects = (prefix, count, width = 40, height = 30) => Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`, type: "rectangle", width, height, fill: COLORS[index % COLORS.length],
  }));
  if (id === "01") return [container("container", 10, 50, 320, 120, { layout: "horizontal", padding: [10, 20, 30, 40], gap: 12, children: rects("child", 3) })];
  if (id === "02") return [container("container", 70, 35, 200, 260, { layout: "vertical", padding: [10, 20, 30, 40], gap: 12, children: rects("child", 3) })];
  if (id === "03") return [container("container", 10, 50, 320, 120, { layout: "horizontal", alignItems: "start", children: sizedChildren() })];
  if (id === "04") return [container("container", 10, 50, 320, 120, { layout: "horizontal", alignItems: "center", children: sizedChildren() })];
  if (id === "05") return [container("container", 10, 50, 320, 120, { layout: "horizontal", alignItems: "end", children: sizedChildren() })];
  if (id === "06") return [container("container", 10, 50, 320, 120, { layout: "horizontal", justifyContent: "start", gap: 10, children: rects("child", 3) })];
  if (id === "07") return [container("container", 10, 50, 320, 120, { layout: "horizontal", justifyContent: "center", gap: 10, children: rects("child", 3) })];
  if (id === "08") return [container("container", 10, 50, 320, 120, { layout: "horizontal", justifyContent: "end", gap: 10, children: rects("child", 3) })];
  if (id === "09") return [container("container", 10, 50, 320, 200, {
    layout: "grid", gridTemplateColumns: [100, 180], gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15,
    children: rects("cell", 4).map((child, index) => ({ ...child, gridColumn: index % 2 + 1, gridRow: Math.floor(index / 2) + 1 })),
  })];
  if (id === "10") return [container("container", 10, 50, 320, 200, {
    layout: "grid", gridTemplateColumns: [100, 180], gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15,
    children: [{ id: "ellipse", type: "ellipse", width: 96, height: 96, fill: COLORS[1], gridColumn: 2, gridRow: 1 }],
  })];
  if (id === "11") return [container("container", 95, 50, 150, 200, {
    layout: "horizontal", wrap: true, columnGap: 10, rowGap: 20, children: rects("child", 4, 60, 30),
  })];
  if (id === "12") return [container("container", 20, 50, 300, 150, {
    layout: "horizontal", children: [
      { id: "child-1", type: "rectangle", width: 40, height: 30, fill: COLORS[0] },
      { id: "child-2", type: "rectangle", width: 40, height: 30, fill: COLORS[1] },
      { id: "absolute-child", type: "rectangle", x: 180, y: 70, width: 40, height: 30, fill: COLORS[2], layoutPosition: "absolute" },
    ],
  })];
  throw new Error(`Unknown Android layout case ${id}`);
}

function container(id, x, y, width, height, properties) {
  return { id, type: "frame", x, y, width, height, fill: "#FFFFFF", ...properties };
}

function sizedChildren() {
  return [20, 40, 60].map((height, index) => ({ id: `child-${index + 1}`, type: "rectangle", width: 40, height, fill: COLORS[index] }));
}

export function buildCase(caseId) {
  const id = String(caseId).padStart(2, "0");
  const document = caseDocument(id);
  const frameId = `luna-case-${id}`;
  const ir = buildCapabilityVerificationIR(document, { role: "android", frames: [frameId] }, CANDIDATE_PATHS);
  const output = ir.outputs[0];
  const authoredNodes = document.children[0].children[0].children;
  const expectedBounds = Object.fromEntries(authoredNodes.map((source) => {
    const node = output.nodes.find((candidate) => candidate.id === source.id);
    assert.ok(node, `${id} missing resolved node ${source.id}`);
    return [source.id, { x: node.geometry.x, y: node.geometry.y, width: node.geometry.w, height: node.geometry.h, color: source.fill }];
  }));
  return { id, document, ir, output, expectedBounds, frameId };
}

export function scaleForDensity(density) {
  const value = Number(density);
  assert.ok(DENSITIES.includes(value), `Unsupported density ${density}`);
  return value / 160;
}

export function evidencePaths(caseId, density, fontScale, evidenceDir = defaultEvidenceDir) {
  const id = String(caseId).padStart(2, "0");
  const scale = scaleForDensity(density);
  const densityName = String(density);
  const fontName = String(fontScale).replace(".", "_");
  const caseDir = join(evidenceDir, `case-${id}`);
  return {
    caseDir,
    sourcePath: join(caseDir, "source.json"),
    expectedPath: join(caseDir, "expected-bounds.json"),
    generatedDir: join(caseDir, "generated"),
    referencePath: join(caseDir, `reference-${densityName}.png`),
    capturePath: join(caseDir, `capture-${densityName}-font-${fontName}.png`),
    rowPath: join(caseDir, `measurement-${densityName}-font-${fontName}.json`),
    scale,
  };
}

export async function prepareCase(caseId, evidenceDir = defaultEvidenceDir) {
  const built = buildCase(caseId);
  const paths = evidencePaths(caseId, 420, 1, evidenceDir);
  await mkdir(paths.caseDir, { recursive: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await writeFile(paths.sourcePath, `${JSON.stringify(built.document, null, 2)}\n`);
  await writeFile(paths.expectedPath, `${JSON.stringify({ caseId: built.id, expectedBounds: built.expectedBounds }, null, 2)}\n`);
  const files = exportCompose(built.ir);
  for (const [relative, contents] of files) {
    const name = relative.replace(/^_canvas\//u, "");
    await writeFile(join(paths.generatedDir, name), contents);
    if (relative.endsWith(".kt")) {
      await mkdir(composeSourceDir, { recursive: true });
      await writeFile(join(composeSourceDir, name), contents);
    }
  }
  return { ...built, paths, files };
}

export async function writeReference(caseId, density, evidenceDir = defaultEvidenceDir) {
  const built = buildCase(caseId);
  const paths = evidencePaths(caseId, density, 1, evidenceDir);
  await mkdir(paths.caseDir, { recursive: true });
  const scale = paths.scale;
  const [reference] = await takeDocumentScreenshots(built.document, [{ nodeIds: [built.frameId] }], new Map(), { scale, maxDimension: 4096, failOnDownscale: true });
  await writeFile(paths.referencePath, Buffer.from(reference.data, "base64"));
  return { ...built, paths, referenceWidth: reference.width, referenceHeight: reference.height };
}

async function decodePng(path) {
  const ck = await getCanvasKit();
  const image = ck.MakeImageFromEncoded(await readFile(path));
  if (!image) throw new Error(`Cannot decode ${path}`);
  const width = image.width();
  const height = image.height();
  try {
    return { width, height, pixels: image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) };
  } finally { image.delete(); }
}

function connectedRegions(image, color) {
  const wanted = color.slice(1).match(/../gu).map((channel) => parseInt(channel, 16));
  const matches = new Uint8Array(image.width * image.height);
  for (let index = 0; index < matches.length; index += 1) {
    const offset = index * 4;
    matches[index] = image.pixels[offset + 3] === 255 && wanted.every((value, channel) => Math.abs(image.pixels[offset + channel] - value) <= 1) ? 1 : 0;
  }
  const regions = [];
  for (let index = 0; index < matches.length; index += 1) {
    if (!matches[index]) continue;
    const queue = [index]; matches[index] = 0;
    let minX = image.width; let minY = image.height; let maxX = -1; let maxY = -1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]; const x = current % image.width; const y = Math.floor(current / image.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const neighbor of [x ? current - 1 : -1, x < image.width - 1 ? current + 1 : -1, y ? current - image.width : -1, y < image.height - 1 ? current + image.width : -1]) {
        if (neighbor >= 0 && matches[neighbor]) { matches[neighbor] = 0; queue.push(neighbor); }
      }
    }
    if (queue.length >= 50) regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, interiorPixels: queue.length });
  }
  return regions;
}

function scaledBounds(expectedBounds, scale) {
  return Object.fromEntries(Object.entries(expectedBounds).map(([id, bounds]) => [id, {
    x: Math.round(bounds.x * scale), y: Math.round(bounds.y * scale), width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale), color: bounds.color,
  }]));
}

export async function measureCapture(caseId, density, fontScale, capturePath, evidenceDir = defaultEvidenceDir) {
  const built = buildCase(caseId);
  const paths = evidencePaths(caseId, density, fontScale, evidenceDir);
  const reference = await decodePng(paths.referencePath);
  const capture = await decodePng(capturePath);
  const expectedBounds = scaledBounds(built.expectedBounds, paths.scale);
  const regionsByColor = new Map();
  for (const color of COLORS) regionsByColor.set(color, connectedRegions(capture, color));
  const observedRaw = {};
  for (const [id, expected] of Object.entries(expectedBounds)) {
    const regions = regionsByColor.get(expected.color.toLowerCase()) ?? [];
    assert.equal(regions.length, 1, `${built.id}/${id} expected one connected ${expected.color} region, got ${regions.length}`);
    observedRaw[id] = regions[0];
  }
  // The generated root is the edge-to-edge Compose content origin. Keep that
  // fixed at (0,0) so a common justify/placement shift remains measurable.
  const origin = { x: 0, y: 0 };
  const observedBounds = Object.fromEntries(Object.entries(observedRaw).map(([id, region]) => [id, {
    x: region.x - origin.x, y: region.y - origin.y, width: region.width, height: region.height, interiorPixels: region.interiorPixels,
  }]));
  let comparedPixels = 0;
  let mismatchedPixels = 0;
  const boundMismatches = [];
  for (const [id, expected] of Object.entries(expectedBounds)) {
    const observed = observedBounds[id];
    for (const coordinate of ["x", "y", "width", "height"]) if (Math.abs(observed[coordinate] - expected[coordinate]) > 2) boundMismatches.push({ id, coordinate, expected: expected[coordinate], observed: observed[coordinate] });
    const wanted = expected.color.slice(1).match(/../gu).map((channel) => parseInt(channel, 16));
    for (let y = expected.y + 2; y < expected.y + expected.height - 2; y += 1) for (let x = expected.x + 2; x < expected.x + expected.width - 2; x += 1) {
      const expectedOffset = (y * reference.width + x) * 4;
      if (reference.pixels[expectedOffset + 3] !== 255 || wanted.some((value, channel) => Math.abs(reference.pixels[expectedOffset + channel] - value) > 2)) continue;
      comparedPixels += 1;
      // Compare each authored region at its observed registration offset. The
      // bounds check above still records layout displacement; this local
      // registration keeps fractional dp-to-pixel rounding from becoming a
      // false paint mismatch.
      const actualX = x + origin.x + observed.x - expected.x; const actualY = y + origin.y + observed.y - expected.y;
      if (actualX < 0 || actualY < 0 || actualX >= capture.width || actualY >= capture.height) { mismatchedPixels += 1; continue; }
      const actualOffset = (actualY * capture.width + actualX) * 4;
      if ([0, 1, 2, 3].some((channel) => Math.abs(reference.pixels[expectedOffset + channel] - capture.pixels[actualOffset + channel]) > 2)) mismatchedPixels += 1;
    }
  }
  const row = {
    caseId: built.id, density: Number(density), fontScale: Number(fontScale), scale: paths.scale,
    referencePath: paths.referencePath, capturePath: resolve(capturePath), expectedBounds, observedBounds,
    comparedPixels, mismatchedPixels, status: boundMismatches.length || mismatchedPixels ? "fail" : "pass",
    boundaryExclusionPixels: 2, channelTolerance: 2, boundMismatches,
  };
  await writeFile(paths.rowPath, `${JSON.stringify(row, null, 2)}\n`);
  return row;
}

export async function appendMeasurement(row, reportPath) {
  let rows = [];
  try { rows = JSON.parse(await readFile(reportPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  rows = rows.filter((existing) => !(existing.caseId === row.caseId && existing.density === row.density && existing.fontScale === row.fontScale));
  rows.push(row);
  rows.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.density - b.density || a.fontScale - b.fontScale);
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(rows, null, 2)}\n`);
  return rows;
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) if (process.argv[index].startsWith("--")) args.set(process.argv[index].slice(2), process.argv[index + 1] ?? true);
  const evidenceDir = resolve(String(args.get("evidence-dir") ?? defaultEvidenceDir));
  const caseId = String(args.get("case"));
  if (args.has("prepare")) { console.log(JSON.stringify(await prepareCase(caseId, evidenceDir), null, 2)); return; }
  if (args.has("reference")) { console.log(JSON.stringify(await writeReference(caseId, Number(args.get("density")), evidenceDir), null, 2)); return; }
  if (args.has("measure")) {
    const row = await measureCapture(caseId, Number(args.get("density")), Number(args.get("font-scale")), String(args.get("capture")), evidenceDir);
    if (args.has("report")) await appendMeasurement(row, resolve(String(args.get("report"))));
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  throw new Error("Use --prepare, --reference, or --measure.");
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
