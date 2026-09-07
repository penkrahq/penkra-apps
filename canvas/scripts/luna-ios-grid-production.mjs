import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportSwiftUI } from "../src/exporters/mobile.mjs";

export const GRID_DEVICES = Object.freeze([
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", contentSizes: ["large", "accessibility-extra-extra-large"], scale: 3 },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", contentSizes: ["large"], scale: 2 },
]);

export const GRID_CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.lang", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.children",
  "roles.ios", "nodes.frame", "nodes.rectangle", "properties.layout", "properties.fill", "properties.fill.solid",
  "properties.columnGap", "properties.rowGap", "properties.padding", "properties.gridTemplateColumns", "properties.gridTemplateRows",
  "properties.gridColumn", "properties.gridRow", "properties.layoutPosition",
]);

export const GRID_PLACEMENTS = Object.freeze([
  { id: "normal", label: "normal source order", mode: "all" },
  { id: "reversed", label: "reversed source order", mode: "all" },
  { id: "only-2-2", label: "only column 2 row 2", mode: "sparse" },
]);

export const GRID_COLS = Object.freeze([[100, 180], [180, 100]]);
export const GRID_ROWS = Object.freeze([[60, 100], [100, 60]]);
export const GRID_CONTROL_ID = "grid-control-padding-overlay";

const COLORS = Object.freeze(["#123456", "#CC5500", "#228833", "#663399"]);
const CELL_IDS = Object.freeze(["cell-a", "cell-b", "cell-c", "cell-d"]);

function sourceName(value) {
  const name = String(value).normalize("NFC").replace(/[^A-Za-z0-9]+/gu, " ").trim().split(/\s+/u).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(name)) throw new Error(`Unsafe generated source name for ${value}.`);
  return name;
}

function caseId(columns, rows, placement) {
  return `grid-c${columns.join("-")}-r${rows.join("-")}-${placement.id}`;
}

function cellsFor(placement) {
  const cells = CELL_IDS.map((id, index) => ({ id, type: "rectangle", width: 40, height: 30, gridColumn: (index % 2) + 1, gridRow: Math.floor(index / 2) + 1, fill: COLORS[index] }));
  if (placement.mode === "sparse") return [cells[3]];
  return placement.id === "reversed" ? cells.toReversed() : cells;
}

function gridFrame(id, columns, rows, placement) {
  return {
    id: `${id}-grid`, type: "frame", x: 20, y: 60, width: 300, height: 280, layout: "grid",
    gridTemplateColumns: columns, gridTemplateRows: rows, columnGap: 10, rowGap: 15, padding: [0, 0, 0, 0], fill: "#FFFFFF",
    children: cellsFor(placement),
  };
}

function normalFrame(id, name, columns, rows, placement) {
  return {
    id, type: "frame", role: "ios", name, width: 340, height: 400, layout: "none", fill: "#FFFFFF",
    children: [gridFrame(id, columns, rows, placement)],
  };
}

export function buildGridDocument() {
  const children = [];
  for (const columns of GRID_COLS) for (const rows of GRID_ROWS) for (const placement of GRID_PLACEMENTS) {
    const id = caseId(columns, rows, placement);
    children.push(normalFrame(id, `iOS Grid ${id}`, columns, rows, placement));
  }
  const controlGrid = {
    id: `${GRID_CONTROL_ID}-grid`, type: "frame", x: 20, y: 60, width: 300, height: 280, layout: "grid",
    gridTemplateColumns: [100, 180], gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15, padding: [11, 12, 13, 14], fill: "#FFFFFF",
    children: [...cellsFor(GRID_PLACEMENTS[0]), { id: "absolute-overlay", type: "rectangle", x: 7, y: 9, width: 20, height: 10, layoutPosition: "absolute", fill: "#ABCDEF" }],
  };
  children.push({ id: GRID_CONTROL_ID, type: "frame", role: "ios", name: "iOS Grid Padding Overlay Control", width: 340, height: 400, layout: "none", fill: "#FFFFFF", children: [controlGrid] });
  return { version: "2.17", module: "mobile", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children };
}

export function buildGridIR(document = buildGridDocument(), ids = document.children.map(({ id }) => id)) {
  return buildCapabilityVerificationIR(document, { role: "ios", frames: ids }, GRID_CANDIDATE_PATHS);
}

function outputFileName(output) {
  return `${sourceName(output.name)}.swift`;
}

export function sourceFileNameForOutput(output) {
  return outputFileName(output);
}

function buildGridHostSource(ir) {
  const cases = ir.outputs.map((output) => ({ id: output.id, source: sourceName(output.name) }));
  const switchCases = cases.map(({ id, source }) => `    case ${JSON.stringify(id)}: return AnyView(${source}())`).join("\n");
  const ids = cases.map(({ id }) => JSON.stringify(id)).join(", ");
  return `import SwiftUI

enum GridFixtureSelection {
  static let knownCaseIDs: Set<String> = [${ids}]

  static func view(for caseID: String) -> AnyView {
    switch caseID {
${switchCases}
    default: preconditionFailure("Unknown grid fixture case: \\(caseID)")
    }
  }
}

struct GridFixtureScreen: View {
  let caseID: String
  let nonce: String

  var body: some View {
    GridFixtureSelection.view(for: caseID)
      .accessibilityIdentifier("luna-grid-fixture-\\(caseID)")
      .onAppear { NSLog("LUNA_GRID_READY case=%@ nonce=%@", caseID, nonce) }
  }
}

@main
struct GridFixtureApp: App {
  let caseID: String
  let nonce: String

  init() {
    let arguments = ProcessInfo.processInfo.arguments
    guard let caseIndex = arguments.firstIndex(of: "--grid-case"), arguments.indices.contains(caseIndex + 1),
          let nonceIndex = arguments.firstIndex(of: "--grid-nonce"), arguments.indices.contains(nonceIndex + 1) else {
      preconditionFailure("Grid fixture requires --grid-case and --grid-nonce")
    }
    caseID = arguments[caseIndex + 1]
    nonce = arguments[nonceIndex + 1]
    guard GridFixtureSelection.knownCaseIDs.contains(caseID) else { preconditionFailure("Unknown grid fixture case: \\(caseID)") }
    guard !nonce.isEmpty else { preconditionFailure("Grid fixture nonce must not be empty") }
  }

  var body: some Scene { WindowGroup { GridFixtureScreen(caseID: caseID, nonce: nonce) } }
}
`;
}

export function buildGridSources(document = buildGridDocument()) {
  const ir = buildGridIR(document);
  const files = exportSwiftUI(ir);
  const sources = new Map();
  for (const [name, contents] of files) sources.set(name.replace(/^_canvas\//u, ""), contents);
  sources.set("GridFixtureHost.swift", buildGridHostSource(ir));
  return { document, ir, files, sources };
}

export function expectedGridGeometry(ir) {
  return ir.outputs.map((output) => {
    const nodes = [output.root, ...output.nodes].filter(Boolean);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const grid = byId.get(`${output.id}-grid`);
    assert.ok(grid, `Resolved IR is missing grid node for ${output.id}.`);
    const cells = [...byId.values()].filter((node) => node.parent === grid.id && node.id !== grid.id);
    return {
      caseId: output.id,
      root: { id: output.root.id, geometry: output.root.geometry },
      grid: { id: grid.id, parent: grid.parent, geometry: grid.geometry, layout: grid.layout, paint: grid.paint },
      children: cells.map((node) => ({ id: node.id, parent: node.parent, geometry: node.geometry, paint: node.paint })),
    };
  });
}

function colorBytes(hex) {
  const value = hex.replace(/^#/u, "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function pixelMatches(pixels, offset, color, tolerance = 2) {
  return color.every((channel, index) => Math.abs(pixels[offset + index] - channel) <= tolerance) && pixels[offset + 3] > 2;
}

function colorBounds(image, color, tolerance = 2) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let count = 0;
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (!pixelMatches(image.pixels, (y * image.width + x) * 4, color, tolerance)) continue;
    count += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return count ? { minX, minY, maxX, maxY, count } : null;
}

export function compareGridPixels(expected, actual, scale, edgeTolerance = 2) {
  if (!Number.isFinite(scale) || scale <= 0) return { status: "mismatch", reason: "nonfinite-or-nonpositive-scale", comparedChildren: 0, failures: [] };
  if (!Array.isArray(expected?.children) || expected.children.length === 0) return { status: "mismatch", reason: "zero-child-geometry", comparedChildren: 0, failures: [] };
  if (!Number.isFinite(expected?.root?.geometry?.w) || !Number.isFinite(expected?.root?.geometry?.h) || expected.root.geometry.w <= 0 || expected.root.geometry.h <= 0) return { status: "mismatch", reason: "nonfinite-or-nonpositive-root-geometry", comparedChildren: 0, failures: [] };
  const invalidChild = expected.children.find(({ geometry }) => !geometry || [geometry.x, geometry.y, geometry.w, geometry.h].some((value) => !Number.isFinite(value)) || geometry.w <= 0 || geometry.h <= 0);
  if (invalidChild) return { status: "mismatch", reason: "nonfinite-or-nonpositive-child-geometry", comparedChildren: 0, failures: [{ id: invalidChild.id }] };
  const expectedWidth = Math.round(expected.root.geometry.w * scale);
  const expectedHeight = Math.round(expected.root.geometry.h * scale);
  if (actual.width !== expectedWidth || actual.height !== expectedHeight) return { status: "mismatch", reason: "capture dimensions do not equal the authored root at the declared scale", comparedChildren: 0, failures: [{ kind: "dimensions", expected: { width: expectedWidth, height: expectedHeight }, actual: { width: actual.width, height: actual.height } }] };
  const failures = [];
  const children = expected.children;
  const sampleCounts = [];
  for (const child of children) {
    const bounds = {
      minX: Math.round(child.geometry.x * scale), minY: Math.round(child.geometry.y * scale),
      maxX: Math.round((child.geometry.x + child.geometry.w) * scale) - 1, maxY: Math.round((child.geometry.y + child.geometry.h) * scale) - 1,
    };
    const color = colorBytes(child.paint.fill);
    const actualBounds = colorBounds(actual, color);
    const eroded = { minX: bounds.minX + edgeTolerance, minY: bounds.minY + edgeTolerance, maxX: bounds.maxX - edgeTolerance, maxY: bounds.maxY - edgeTolerance };
    let positiveInteriorSamples = 0;
    if (eroded.minX <= eroded.maxX && eroded.minY <= eroded.maxY) for (let y = eroded.minY; y <= eroded.maxY; y += 1) for (let x = eroded.minX; x <= eroded.maxX; x += 1) {
      if (pixelMatches(actual.pixels, (y * actual.width + x) * 4, color)) positiveInteriorSamples += 1;
    }
    sampleCounts.push({ id: child.id, samples: positiveInteriorSamples });
    if (!actualBounds) failures.push({ id: child.id, kind: "zero-solid-color-samples", expected: bounds, color: child.paint.fill });
    else if (!Number.isFinite(positiveInteriorSamples) || positiveInteriorSamples <= 0) failures.push({ id: child.id, kind: "no-positive-eroded-interior-sample", expected: bounds, actual: actualBounds, color: child.paint.fill, samples: positiveInteriorSamples });
    else if (["minX", "minY", "maxX", "maxY"].some((key) => Math.abs(actualBounds[key] - bounds[key]) > edgeTolerance)) failures.push({ id: child.id, kind: "edge-displacement", expected: bounds, actual: actualBounds, color: child.paint.fill });
  }
  const hasInvalidSampleCount = sampleCounts.some(({ samples }) => !Number.isFinite(samples) || samples <= 0);
  return { status: failures.length || hasInvalidSampleCount ? "mismatch" : "pass", comparedChildren: children.length, sampleCounts, edgeTolerancePhysicalPixels: edgeTolerance, registration: "none", clipping: "not-applied", failures };
}

export function readyReceipt(caseID, nonce, logText) {
  const escapedCase = String(caseID).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedNonce = String(nonce).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`LUNA_GRID_READY case=${escapedCase} nonce=${escapedNonce}(?:\\n|$)`, "u").test(logText);
}

export function stableScreenshotHashes(hashes) {
  return Array.isArray(hashes) && hashes.length >= 2 && hashes.every((hash) => typeof hash === "string" && /^[0-9a-f]{64}$/u.test(hash)) && hashes.every((hash) => hash === hashes[0]);
}

export function sourceHashReceipt(sources) {
  const entries = [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, contents]) => ({ path, sha256: createHash("sha256").update(contents).digest("hex"), bytes: Buffer.byteLength(contents) }));
  const sourceSha256 = createHash("sha256").update(entries.map(({ path, sha256 }) => `${path}:${sha256}\n`).join("")).digest("hex");
  return { sourceSha256, files: entries };
}

export function buildGridProjectYaml() {
  return `name: CanvasGridEvidence
options:
  bundleIdPrefix: com.penkra.canvas.qa
settings:
  base:
    SWIFT_VERSION: "6.0"
    CODE_SIGNING_ALLOWED: NO
targets:
  CanvasGridEvidence:
    type: application
    platform: iOS
    deploymentTarget: "16.0"
    sources:
      - swift
    settings:
      base:
        GENERATE_INFOPLIST_FILE: YES
        PRODUCT_BUNDLE_IDENTIFIER: com.penkra.canvas.qa.grid
        INFOPLIST_KEY_UILaunchScreen_Generation: YES
        TARGETED_DEVICE_FAMILY: "1,2"
schemes:
  CanvasGridEvidence:
    build:
      targets:
        CanvasGridEvidence: all
`;
}

export function launchArguments(caseID, nonce) {
  assert.ok(GRID_CASE_IDS.includes(caseID), `Unknown grid fixture case ${caseID}.`);
  assert.ok(typeof nonce === "string" && nonce.length > 0, "Grid fixture nonce must be non-empty.");
  return ["--grid-case", caseID, "--grid-nonce", nonce];
}

export const GRID_CASE_IDS = Object.freeze(buildGridDocument().children.map(({ id }) => id));
export const GRID_MATRIX_CASE_IDS = Object.freeze(GRID_CASE_IDS.filter((id) => id !== GRID_CONTROL_ID));

export async function writeGridEvidence(destination, { document = buildGridDocument(), scaleStates = GRID_DEVICES } = {}) {
  const evidence = resolve(destination);
  const { ir, sources } = buildGridSources(document);
  await mkdir(join(evidence, "swift"), { recursive: true });
  await mkdir(join(evidence, "references"), { recursive: true });
  await writeFile(join(evidence, "fixture.json"), `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(join(evidence, "ir.json"), `${JSON.stringify({ ...ir, renderDocument: undefined }, null, 2)}\n`);
  await writeFile(join(evidence, "expected-bounds.json"), `${JSON.stringify(expectedGridGeometry(ir), null, 2)}\n`);
  await writeFile(join(evidence, "source-hashes.json"), `${JSON.stringify(sourceHashReceipt(sources), null, 2)}\n`);
  await writeFile(join(evidence, "candidate-paths.json"), `${JSON.stringify({ mode: "candidate-verification", publicCapabilityPromotion: false, paths: GRID_CANDIDATE_PATHS }, null, 2)}\n`);
  const projectYaml = buildGridProjectYaml();
  await writeFile(join(evidence, "project.yml"), projectYaml);
  await writeFile(join(evidence, "project-hash.json"), `${JSON.stringify({ path: "project.yml", sha256: createHash("sha256").update(projectYaml).digest("hex"), bytes: Buffer.byteLength(projectYaml) }, null, 2)}\n`);
  await writeFile(join(evidence, "capture-plan.json"), `${JSON.stringify({ bundleIdentifier: "com.penkra.canvas.qa.grid", launchArguments: "--grid-case <exact-case-id> --grid-nonce <per-launch-nonce>", matrixCases: GRID_MATRIX_CASE_IDS, controlCase: GRID_CONTROL_ID, expectedPrimaryEntries: GRID_MATRIX_CASE_IDS.length * scaleStates.reduce((sum, device) => sum + device.contentSizes.length, 0), build: "xcodebuild -project CanvasGridEvidence.xcodeproj -scheme CanvasGridEvidence -sdk iphonesimulator -configuration Debug -jobs 2", readiness: "require exact LUNA_GRID_READY case/nonce log receipt and two consecutive identical screenshot hashes", comparator: "physical edge tolerance <=2; positive eroded-interior color samples; no registration or clipping" }, null, 2)}\n`);
  for (const [path, contents] of sources) {
    await mkdir(join(evidence, "swift", path, ".."), { recursive: true });
    await writeFile(join(evidence, "swift", path), contents);
  }
  for (const device of scaleStates) for (const contentSize of device.contentSizes) {
    const state = `${device.key}-${contentSize}`;
    await mkdir(join(evidence, "references", state), { recursive: true });
    for (const caseID of GRID_CASE_IDS) {
      const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: [caseID] }], new Map(), { scale: device.scale, maxDimension: 4096, failOnDownscale: true });
      await writeFile(join(evidence, "references", state, `${caseID}.png`), Buffer.from(reference.data, "base64"));
    }
  }
  await writeFile(join(evidence, "README.md"), `# iOS resolved grid production evidence\n\nSource preparation only; no compiler, simulator, or native capture was run in this package. The fixture is generated through buildCapabilityVerificationIR with the explicit candidate inventory in source-hashes.json and exported through exportSwiftUI. The 12-case matrix covers unequal columns, unequal rows, normal/reversed/sparse placement; the control is retained separately.\n\nNative capture requires the exact case argument, nonce log receipt, and consecutive stable frames. Unknown case IDs fail in the generated host.\n`);
  return { evidence, ir, sources, expectedGeometry: expectedGridGeometry(ir) };
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.argv.includes("--write")) {
  const destination = process.env.CANVAS_GRID_EVIDENCE_ROOT ?? new URL("../research/luna-ios-grid-production-20260907", import.meta.url).pathname;
  const result = await writeGridEvidence(destination);
  console.log(JSON.stringify({ evidence: result.evidence, sourceSha256: sourceHashReceipt(result.sources).sourceSha256, matrixCases: GRID_MATRIX_CASE_IDS.length, totalCases: GRID_CASE_IDS.length }, null, 2));
}
