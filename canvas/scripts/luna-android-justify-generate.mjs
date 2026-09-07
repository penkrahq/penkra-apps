import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportCompose } from "../src/exporters/mobile.mjs";

export const DENSITIES = Object.freeze([420, 320]);
export const FONT_SCALES = Object.freeze([1, 2]);
export const DIRECTIONS = Object.freeze(["horizontal", "vertical"]);
export const JUSTIFY_VALUES = Object.freeze(["start", "center", "end"]);
export const GAPS = Object.freeze([0, 10]);
export const PADDING_VALUES = Object.freeze(["none", "asymmetric"]);
export const COLORS = Object.freeze(["#123456", "#f4a261", "#2a9d8f"]);
export const CASE_SPECS = Object.freeze(DIRECTIONS.flatMap((direction) => JUSTIFY_VALUES.flatMap((justifyContent) => GAPS.flatMap((gap) => PADDING_VALUES.map((padding) => ({ direction, justifyContent, gap, padding }))))));
export const CASE_IDS = Object.freeze(CASE_SPECS.map(caseIdFor));

export const CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.flows", "root.children",
  "roles.android", "nodes.frame", "nodes.rectangle", "properties.fill", "properties.fill.solid", "properties.layout",
  "properties.gap", "properties.padding", "properties.justifyContent",
]);
const rootDir = resolve(import.meta.dirname, "..");
const composeSourceDir = resolve(rootDir, "compatibility/mobile-fixtures/compose/app/src/main/java/generated/canvas");
const defaultEvidenceDir = resolve(rootDir, "research/luna-android-justify-20260906");

function portableEvidencePath(evidenceDir, path) {
  return relative(resolve(evidenceDir), resolve(path)).split(sep).join("/");
}

export function caseIdFor(spec) {
  return `${spec.direction}-${spec.justifyContent}-g${spec.gap}-${spec.padding === "none" ? "none" : "asymmetric"}`;
}

export function specForCase(caseId) {
  const index = CASE_IDS.indexOf(String(caseId));
  assert.ok(index >= 0, `Unknown justify case ${caseId}`);
  return CASE_SPECS[index];
}

function children() {
  return COLORS.map((fill, index) => ({ id: `child-${index + 1}`, type: "rectangle", width: 40, height: 30, fill }));
}

export function caseDocument(caseId) {
  const spec = specForCase(caseId);
  const layout = {
    layout: spec.direction,
    justifyContent: spec.justifyContent,
    gap: spec.gap,
    children: children(),
  };
  if (spec.padding === "asymmetric") layout.padding = [10, 20, 30, 40];
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: `justify-root-${caseId}`, type: "frame", role: "android", name: "Mobile Fixture", x: 0, y: 0,
      width: 340, height: 400, layout: "none", fill: "#FFFFFF",
      children: [{ id: "container", type: "frame", x: 20, y: 60, width: 300, height: 280, fill: "#FFFFFF", ...layout }],
    }],
  };
}

export function buildJustifyCase(caseId, { omitJustify = false } = {}) {
  const id = String(caseId);
  const document = caseDocument(id);
  if (omitJustify) delete document.children[0].children[0].justifyContent;
  const frameId = `justify-root-${id}`;
  const ir = buildCapabilityVerificationIR(document, { role: "android", frames: [frameId] }, CANDIDATE_PATHS);
  const output = ir.outputs[0];
  const sourceChildren = document.children[0].children[0].children;
  const expectedBounds = Object.fromEntries(sourceChildren.map((source) => {
    const node = output.nodes.find((candidate) => candidate.id === source.id);
    assert.ok(node, `${id} missing resolved node ${source.id}`);
    return [source.id, { x: node.geometry.x, y: node.geometry.y, width: node.geometry.w, height: node.geometry.h, color: source.fill }];
  }));
  return { id, spec: specForCase(id), document, ir, output, expectedBounds, frameId };
}

export function scaleForDensity(density) {
  const value = Number(density);
  assert.ok(DENSITIES.includes(value), `Unsupported density ${density}`);
  return value / 160;
}

export function evidencePaths(caseId, density, fontScale, evidenceDir = defaultEvidenceDir) {
  const id = String(caseId);
  const densityName = String(density);
  const fontName = String(fontScale).replace(".", "_");
  const caseDir = join(evidenceDir, id);
  return {
    caseDir,
    sourcePath: join(caseDir, "source.json"),
    expectedPath: join(caseDir, "expected-bounds.json"),
    generatedDir: join(caseDir, "generated"),
    referencePath: join(caseDir, `reference-${densityName}.png`),
    capturePath: join(caseDir, `capture-${densityName}-font-${fontName}.png`),
    rowPath: join(caseDir, `measurement-${densityName}-font-${fontName}.json`),
    scale: scaleForDensity(density),
  };
}

export async function prepareJustifyCase(caseId, evidenceDir = defaultEvidenceDir) {
  const built = buildJustifyCase(caseId);
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

export async function writeJustifyReference(caseId, density, evidenceDir = defaultEvidenceDir) {
  const built = buildJustifyCase(caseId);
  const paths = evidencePaths(caseId, density, 1, evidenceDir);
  await mkdir(paths.caseDir, { recursive: true });
  const [reference] = await takeDocumentScreenshots(built.document, [{ nodeIds: [built.frameId] }], new Map(), { scale: paths.scale, maxDimension: 4096, failOnDownscale: true });
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

export async function measureJustifyCapture(caseId, density, fontScale, capturePath, evidenceDir = defaultEvidenceDir) {
  const built = buildJustifyCase(caseId);
  const paths = evidencePaths(caseId, density, fontScale, evidenceDir);
  const reference = await decodePng(paths.referencePath);
  const capture = await decodePng(capturePath);
  const expectedBounds = scaledBounds(built.expectedBounds, paths.scale);
  const regionsByColor = new Map(COLORS.map((color) => [color, connectedRegions(capture, color)]));
  const observedRaw = {};
  const boundMismatches = [];
  for (const [id, expected] of Object.entries(expectedBounds)) {
    const regions = regionsByColor.get(expected.color.toLowerCase()) ?? [];
    if (regions.length !== 1) {
      observedRaw[id] = null;
      boundMismatches.push({ id, coordinate: "connectedRegion", expected: 1, observed: regions.length });
    } else observedRaw[id] = regions[0];
  }
  const origin = { x: 0, y: 0 };
  const observedBounds = Object.fromEntries(Object.entries(observedRaw).map(([id, region]) => [id, region ? {
    x: region.x - origin.x, y: region.y - origin.y, width: region.width, height: region.height, interiorPixels: region.interiorPixels,
  } : null]));
  let comparedPixels = 0;
  let mismatchedPixels = 0;
  for (const [id, expected] of Object.entries(expectedBounds)) {
    const observed = observedBounds[id];
    if (!observed) continue;
    for (const coordinate of ["x", "y", "width", "height"]) if (Math.abs(observed[coordinate] - expected[coordinate]) > 2) boundMismatches.push({ id, coordinate, expected: expected[coordinate], observed: observed[coordinate] });
    const wanted = expected.color.slice(1).match(/../gu).map((channel) => parseInt(channel, 16));
    for (let y = expected.y + 2; y < expected.y + expected.height - 2; y += 1) for (let x = expected.x + 2; x < expected.x + expected.width - 2; x += 1) {
      const expectedOffset = (y * reference.width + x) * 4;
      if (reference.pixels[expectedOffset + 3] !== 255 || wanted.some((value, channel) => Math.abs(reference.pixels[expectedOffset + channel] - value) > 2)) continue;
      comparedPixels += 1;
      const actualX = x + origin.x + observed.x - expected.x; const actualY = y + origin.y + observed.y - expected.y;
      if (actualX < 0 || actualY < 0 || actualX >= capture.width || actualY >= capture.height) { mismatchedPixels += 1; continue; }
      const actualOffset = (actualY * capture.width + actualX) * 4;
      if ([0, 1, 2, 3].some((channel) => Math.abs(reference.pixels[expectedOffset + channel] - capture.pixels[actualOffset + channel]) > 2)) mismatchedPixels += 1;
    }
  }
  const row = {
    caseId: built.id, direction: built.spec.direction, justifyContent: built.spec.justifyContent, gap: built.spec.gap, padding: built.spec.padding,
    density: Number(density), fontScale: Number(fontScale), scale: paths.scale, referencePath: portableEvidencePath(evidenceDir, paths.referencePath), capturePath: portableEvidencePath(evidenceDir, capturePath),
    expectedBounds, observedBounds, comparedPixels, mismatchedPixels, status: boundMismatches.length || mismatchedPixels ? "fail" : "pass",
    boundaryExclusionPixels: 2, channelTolerance: 2, boundMismatches,
  };
  return row;
}

export async function writeJustifyMeasurement(row, evidenceDir = defaultEvidenceDir) {
  const paths = evidencePaths(row.caseId, row.density, row.fontScale, evidenceDir);
  await mkdir(paths.caseDir, { recursive: true });
  await writeFile(paths.rowPath, `${JSON.stringify(row, null, 2)}\n`);
  return row;
}

export async function appendJustifyMeasurement(row, reportPath) {
  let rows = [];
  try { rows = JSON.parse(await readFile(reportPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  rows = rows.filter((existing) => !(existing.caseId === row.caseId && existing.density === row.density && existing.fontScale === row.fontScale));
  rows.push(row);
  rows.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.density - b.density || a.fontScale - b.fontScale);
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(rows, null, 2)}\n`);
  return rows;
}

async function evidenceFiles(directory, relative = "") {
  const entries = await readdir(join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await evidenceFiles(directory, child));
    else if (entry.name !== "artifact-manifest.json") files.push(child);
  }
  return files;
}

export async function writeJustifyArtifactManifest(evidenceDir = defaultEvidenceDir) {
  const files = await evidenceFiles(evidenceDir);
  const records = [];
  for (const relative of files) {
    const path = join(evidenceDir, relative);
    const bytes = await readFile(path);
    records.push({ path: relative, bytes: (await stat(path)).size, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const measurements = JSON.parse(await readFile(join(evidenceDir, "measurements.json"), "utf8"));
  const manifest = {
    package: "luna-android-justify-20260906", caseCount: CASE_IDS.length, caseIds: CASE_IDS,
    settingsPerCase: 4, measurementCount: measurements.length, captureCount: files.filter((path) => /\/capture-\d+-font-/u.test(path)).length,
    files: records,
  };
  const manifestPath = join(evidenceDir, "artifact-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, fileCount: records.length, measurementCount: measurements.length, captureCount: manifest.captureCount };
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) if (process.argv[index].startsWith("--")) args.set(process.argv[index].slice(2), process.argv[index + 1] ?? true);
  const evidenceDir = resolve(String(args.get("evidence-dir") ?? defaultEvidenceDir));
  const caseId = String(args.get("case"));
  if (args.has("prepare")) { console.log(JSON.stringify(await prepareJustifyCase(caseId, evidenceDir), null, 2)); return; }
  if (args.has("reference")) { console.log(JSON.stringify(await writeJustifyReference(caseId, Number(args.get("density")), evidenceDir), null, 2)); return; }
  if (args.has("measure")) {
    const row = await measureJustifyCapture(caseId, Number(args.get("density")), Number(args.get("font-scale")), String(args.get("capture")), evidenceDir);
    await writeJustifyMeasurement(row, evidenceDir);
    if (args.has("report")) await appendJustifyMeasurement(row, resolve(String(args.get("report"))));
    console.log(JSON.stringify(row, null, 2)); return;
  }
  if (args.has("manifest")) { console.log(JSON.stringify(await writeJustifyArtifactManifest(evidenceDir), null, 2)); return; }
  throw new Error("Use --prepare, --reference, or --measure.");
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
