import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";
import { cropPngBytes } from "./luna-ios-grid-capture-utils-20260907.mjs";

export const EVIDENCE_PACKAGE = "luna-mobile-flow-paint-20260907";
export const IOS_BUNDLE_ID = "com.penkra.canvas.qa.flowpaint";
export const ANDROID_BUNDLE_ID = "com.penkra.canvas.fixture";
export const IOS_STATES = Object.freeze([
  { key: "iphone-large", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", scale: 3, contentSize: "large" },
  { key: "iphone-accessibility-xxl", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", scale: 3, contentSize: "accessibility-extra-extra-large" },
  { key: "ipad-large", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", scale: 2, contentSize: "large" },
]);
export const ANDROID_STATES = Object.freeze([
  { key: "density-420-font-1", density: 420, fontScale: 1, scale: 2.625 },
  { key: "density-420-font-2", density: 420, fontScale: 2, scale: 2.625 },
  { key: "density-320-font-1", density: 320, fontScale: 1, scale: 2 },
  { key: "density-320-font-2", density: 320, fontScale: 2, scale: 2 },
]);

export const CASE_SPECS = Object.freeze([
  { id: "wrap-horizontal-start", label: "Horizontal wrap start cross-axis", kind: "flow", crossAxis: "start" },
  { id: "wrap-horizontal-center", label: "Horizontal wrap center cross-axis", kind: "flow", crossAxis: "center" },
  { id: "wrap-horizontal-end", label: "Horizontal wrap end cross-axis", kind: "flow", crossAxis: "end" },
  { id: "wrap-vertical", label: "Vertical wrap", kind: "flow" },
  { id: "absolute-overlay", label: "Absolute overlay", kind: "flow" },
  { id: "aggregate-fill", label: "Active aggregate fill with disabled decoys", kind: "solid" },
  { id: "transformed-linear", label: "Transformed linear gradient", kind: "gradient" },
  { id: "transformed-radial", label: "Off-center anisotropic rotated radial gradient", kind: "gradient" },
  { id: "rounded-scalar-overflow", label: "Scalar rounded gradient with overflowing child", kind: "rounded" },
  { id: "rounded-corners-overflow", label: "Independent-corner rounded gradient with overflowing child", kind: "rounded" },
  { id: "runtime-appearance-viewport", label: "Appearance and viewport runtime axes", kind: "runtime" },
]);
export const CASE_IDS = Object.freeze(CASE_SPECS.map(({ id }) => id));

export const CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.lang", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.children",
  "roles.ios", "roles.android", "nodes.frame", "nodes.rectangle", "nodes.group", "properties.layout", "properties.fill", "properties.fill.solid",
  "properties.fill.gradient.linear", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial", "properties.fill.gradient.radial.transformed",
  "properties.cornerRadius", "properties.opacity", "properties.padding", "properties.gap", "properties.rowGap", "properties.columnGap",
  "properties.justifyContent", "properties.alignItems", "properties.wrap", "properties.layoutPosition", "properties.modes", "properties.varies", "properties.x", "properties.y", "properties.width", "properties.height",
]);

const COLORS = Object.freeze({ background: "#F6F2EA", inkA: "#123456", inkB: "#E76F51", inkC: "#2A9D8F", inkD: "#6A4C93", inkE: "#F4A261", active: "#264653" });
const gradient = (gradientType, center, size, rotation, colors) => ({ type: "gradient", gradientType, center, size, rotation, colors });
const linearFill = gradient("linear", { x: 0.2, y: 0.8 }, { width: 0.8, height: 0.45 }, 27, [{ color: "#123456", position: 0 }, { color: "#E76F51", position: 0.38 }, { color: "#F4A261", position: 1 }]);
const radialFill = gradient("radial", { x: 0.27, y: 0.68 }, { width: 0.44, height: 0.72 }, 31, [{ color: "#F4A261", position: 0 }, { color: "#2A9D8F", position: 0.45 }, { color: "#123456", position: 1 }]);

function baseFrame(id, name, children, extra = {}) {
  return { id, type: "frame", role: extra.role, name, x: 0, y: 0, width: 420, height: 360, layout: "none", fill: COLORS.background, children, ...extra };
}
function flowChildren() {
  return [
    { id: "flow-a", type: "rectangle", width: 130, height: 32, fill: COLORS.inkA },
    { id: "flow-b", type: "rectangle", width: 100, height: 56, fill: COLORS.inkB },
    { id: "flow-c", type: "rectangle", width: 80, height: 40, fill: COLORS.inkC },
    { id: "flow-d", type: "rectangle", width: 90, height: 48, fill: COLORS.inkD },
  ];
}
function horizontalWrap(id, alignItems, role) {
  return baseFrame(id, `Flow Paint ${id}`, [{ id: "wrap", type: "frame", x: 20, y: 28, width: 380, height: 150, fill: "#FFFFFF", layout: "horizontal", wrap: true, justifyContent: "start", alignItems, rowGap: 17, columnGap: 11, padding: [13, 31, 17, 23], children: flowChildren() }], { role });
}
function verticalWrap(role) {
  return baseFrame("wrap-vertical", "Flow Paint wrap vertical", [{ id: "wrap", type: "frame", x: 20, y: 28, width: 220, height: 270, fill: "#FFFFFF", layout: "vertical", wrap: true, alignItems: "start", rowGap: 9, columnGap: 21, padding: [13, 17, 23, 29], children: [
    { id: "flow-a", type: "rectangle", width: 50, height: 80, fill: COLORS.inkA },
    { id: "flow-b", type: "rectangle", width: 72, height: 65, fill: COLORS.inkB },
    { id: "flow-c", type: "rectangle", width: 64, height: 75, fill: COLORS.inkC },
    { id: "flow-d", type: "rectangle", width: 58, height: 55, fill: COLORS.inkD },
  ] }], { role });
}
function absoluteOverlay(role) {
  return baseFrame("absolute-overlay", "Flow Paint absolute overlay", [{ id: "overlay", type: "frame", x: 20, y: 28, width: 360, height: 130, fill: "#FFFFFF", layout: "horizontal", columnGap: 12, children: [
    { id: "flow-a", type: "rectangle", width: 100, height: 42, fill: COLORS.inkA },
    { id: "flow-b", type: "rectangle", width: 100, height: 54, fill: COLORS.inkB },
    { id: "overlay-absolute", type: "rectangle", x: 214, y: 58, width: 120, height: 48, fill: COLORS.inkC, layoutPosition: "absolute" },
  ] }], { role });
}
function roundedCase(id, cornerRadius, role) {
  return baseFrame(id, `Flow Paint ${id}`, [{ id: "rounded", type: "frame", x: 30, y: 30, width: 360, height: 130, fill: radialFill, cornerRadius, layout: "none", children: [{ id: "overflowing-child", type: "rectangle", x: -16, y: 42, width: 392, height: 46, fill: COLORS.inkE }] }], { role });
}

export function buildFlowPaintDocument(role) {
  assert.ok(role === "ios" || role === "android");
  return {
    version: "2.17", module: "mobile", lang: "en", axes: {
      appearance: { modes: [{ name: "light" }, { name: "dark", media: "(prefers-color-scheme: dark)" }] },
      viewport: { modes: [{ name: "phone", minWidth: 0 }, { name: "wide", minWidth: 480 }] },
    }, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      horizontalWrap("wrap-horizontal-start", "start", role),
      horizontalWrap("wrap-horizontal-center", "center", role),
      horizontalWrap("wrap-horizontal-end", "end", role),
      verticalWrap(role), absoluteOverlay(role),
      baseFrame("aggregate-fill", "Flow Paint aggregate fill", [{ id: "aggregate", type: "rectangle", x: 30, y: 30, width: 360, height: 110, fill: [
        { enabled: false, color: "#FF00FF" },
        { enabled: false, color: "#00FFFF" },
        { enabled: true, color: COLORS.active },
      ] }], { role }),
      baseFrame("transformed-linear", "Flow Paint transformed linear", [{ id: "linear", type: "rectangle", x: 30, y: 30, width: 360, height: 120, fill: linearFill }], { role }),
      baseFrame("transformed-radial", "Flow Paint transformed radial", [{ id: "radial", type: "rectangle", x: 30, y: 24, width: 360, height: 140, fill: radialFill }], { role }),
      roundedCase("rounded-scalar-overflow", 26, role), roundedCase("rounded-corners-overflow", [12, 28, 44, 20], role),
      baseFrame("runtime-appearance-viewport", "Flow Paint runtime appearance viewport", [{ id: "runtime-panel", type: "frame", x: [{ value: 24 }, { value: 150, when: { viewport: "wide" } }], y: 40, width: [{ value: 190 }, { value: 260, when: { viewport: "wide" } }], height: 150, layout: "horizontal", padding: [{ value: [10, 10, 10, 10] }, { value: [30, 10, 10, 20], when: { viewport: "wide" } }], fill: [{ value: COLORS.active }, { value: "#E76F51", when: { appearance: "dark" } }], children: [{ id: "runtime-child", type: "rectangle", width: 70, height: 54, fill: "#F4A261" }] }], { role, width: [{ value: 420 }, { value: 700, when: { viewport: "wide" } }] }),
    ],
  };
}

export function buildFlowPaintIR(role, document = buildFlowPaintDocument(role), modes) {
  return buildCapabilityVerificationIR(document, { role, frames: CASE_IDS, ...(modes ? { modes } : {}) }, CANDIDATE_PATHS);
}

export function sourceHashReceipt(sources) {
  const files = [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, contents]) => ({ path, bytes: Buffer.byteLength(contents), sha256: sha256(contents) }));
  return { sourceSha256: sha256(files.map(({ path, sha256: digest }) => `${path}:${digest}\n`).join("")), files };
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sourceName(value) { const name = String(value).replace(/[^A-Za-z0-9]+/gu, " ").trim().split(/\s+/u).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(""); assert.match(name, /^[A-Za-z][A-Za-z0-9]*$/u); return name; }
function safeRelative(root, path) { return relative(root, path).replaceAll("\\", "/"); }

function swiftHost(ir) {
  const cases = ir.outputs.map((output) => ({ id: output.id, source: sourceName(output.name) }));
  const ids = cases.map(({ id }) => JSON.stringify(id)).join(", ");
  const switches = cases.map(({ id, source }) => `    case ${JSON.stringify(id)}: return AnyView(${source}())`).join("\n");
  return `import SwiftUI\nimport UIKit\n\nstruct FlowPaintSelection {\n  static let known: Set<String> = [${ids}]\n  static func view(for id: String) -> AnyView {\n    switch id {\n${switches}\n    default: preconditionFailure("Unknown flow-paint case: \\(id)")\n    }\n  }\n}\n\n@main\nstruct FlowPaintApp: App {\n  private let caseID: String\n  private let nonce: String\n  init() {\n    let args = CommandLine.arguments\n    caseID = args.first(where: { $0.hasPrefix("--canvas-case=") })?.split(separator: "=", maxSplits: 1).last.map(String.init) ?? "wrap-horizontal-start"\n    nonce = args.first(where: { $0.hasPrefix("--canvas-nonce=") })?.split(separator: "=", maxSplits: 1).last.map(String.init) ?? "missing"\n  }\n  var body: some Scene { WindowGroup { FlowPaintRoot(caseID: caseID, nonce: nonce) } }\n}\n\nstruct FlowPaintRoot: View {\n  let caseID: String\n  let nonce: String\n  var body: some View { FlowPaintSelection.view(for: caseID)\n    .frame(width: 420, height: 360, alignment: .topLeading)\n    .accessibilityIdentifier("canvas-flow-paint-\\(caseID)")\n    .background(GeometryReader { proxy in Color.clear.onAppear {\n      let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first\n      let scale = window?.screen.scale ?? UIScreen.main.scale\n      let frame = proxy.frame(in: .global)\n      NSLog("LUNA_FLOW_PAINT_READY case=%@ nonce=%@", caseID, nonce)\n      NSLog("LUNA_FLOW_PAINT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, frame.minX, frame.minY, frame.width, frame.height, scale)\n    } })\n  }\n}\n`;
}

function composeHost(ir) {
  const cases = ir.outputs.map(({ id }) => `      "${id}" -> ${sourceName(ir.outputs.find((output) => output.id === id)?.name ?? id)}()` ).join("\n");
  return `package com.penkra.canvas.flowpaint\n\nimport android.os.Bundle\nimport android.util.Log\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.Box\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.layout.onGloballyPositioned\nimport androidx.compose.ui.layout.positionInWindow\nimport androidx.compose.ui.unit.IntSize\nimport generated.canvas.*\n\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(state: Bundle?) {\n    super.onCreate(state)\n    val caseID = intent.getStringExtra("canvasCase") ?: "wrap-horizontal-start"\n    val nonce = intent.getStringExtra("canvasNonce") ?: "missing"\n    setContent { Box(modifier = Modifier.onGloballyPositioned { coordinates ->\n      val size: IntSize = coordinates.size\n      val origin = coordinates.positionInWindow()\n      Log.i("CanvasFlowPaint", "LUNA_FLOW_PAINT_READY case=${'$'}caseID nonce=${'$'}nonce")\n      Log.i("CanvasFlowPaint", "LUNA_FLOW_PAINT_ROOT case=${'$'}caseID nonce=${'$'}nonce x=${'$'}{origin.x} y=${'$'}{origin.y} width=${'$'}{size.width} height=${'$'}{size.height} scale=${'$'}{resources.displayMetrics.density}")\n    }) { FlowPaintSelection.view(caseID) } }\n  }\n}\n\nobject FlowPaintSelection {\n  @androidx.compose.runtime.Composable fun view(id: String) {\n    when (id) {\n${cases}\n      else -> error("Unknown flow-paint case: ${'$'}id")\n    }\n  }\n}\n`;
}

function projectSpec() {
  return `name: CanvasFlowPaintEvidence\noptions:\n  bundleIdPrefix: com.penkra.canvas.qa\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasFlowPaintEvidence:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources:\n      - swift/Sources/CanvasFlowPaint\n      - swift/SimulatorHost\n      - path: ../../vendor/open-pencil/fonts\n        buildPhase: resources\n    info:\n      path: swift/SimulatorHost/Info.plist\n      properties:\n        UIAppFonts:\n          - Inter-Regular.ttf\n          - Inter-Medium.ttf\n          - Inter-SemiBold.ttf\n          - Inter-Bold.ttf\n          - Inter-ExtraBold.ttf\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: ${IOS_BUNDLE_ID}\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"\nschemes:\n  CanvasFlowPaintEvidence:\n    build:\n      targets:\n        CanvasFlowPaintEvidence: all\n`;
}

export async function prepareFlowPaintEvidence(evidenceRoot = resolve(import.meta.dirname, "../research", EVIDENCE_PACKAGE)) {
  const root = resolve(evidenceRoot); await mkdir(root, { recursive: true });
  const documents = { ios: buildFlowPaintDocument("ios"), android: buildFlowPaintDocument("android") };
  const irs = { ios: buildFlowPaintIR("ios", documents.ios), android: buildFlowPaintIR("android", documents.android) };
  const generated = new Map();
  const iosSources = exportSwiftUI(irs.ios); for (const [path, contents] of iosSources) generated.set(`swift/Sources/CanvasFlowPaint/${path}`, contents);
  generated.set("swift/SimulatorHost/FlowPaintApp.swift", swiftHost(irs.ios)); generated.set("project.yml", projectSpec());
  generated.set("swift/SimulatorHost/Info.plist", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>UILaunchScreen</key><dict/></dict></plist>\n");
  const composeSources = exportCompose(irs.android); for (const [path, contents] of composeSources) generated.set(`compose/generated/${path}`, contents);
  generated.set("compose/generated/MainActivity.kt", composeHost(irs.android));
  for (const [path, contents] of generated) { const target = join(root, path); await mkdir(join(target, ".."), { recursive: true }); await writeFile(target, contents); }
  const sourceReceipt = sourceHashReceipt(generated); await writeFile(join(root, "source-hashes.json"), json(sourceReceipt));
  await writeFile(join(root, "fixture.json"), json({ package: EVIDENCE_PACKAGE, cases: CASE_SPECS, iosBundleId: IOS_BUNDLE_ID, androidBundleId: ANDROID_BUNDLE_ID, documents, irs: { ios: irs.ios, android: irs.android }, sourceReceipt }));
  const references = { ios: {}, android: {} };
  for (const [platform, role] of [["ios", "ios"], ["android", "android"]]) {
    const states = platform === "ios" ? IOS_STATES : ANDROID_STATES;
    for (const state of states) {
      references[platform][state.key] = {};
      for (const appearance of ["light", "dark"]) {
        references[platform][state.key][appearance] = {};
        const viewport = platform === "ios" ? (state.key === "ipad-large" ? "wide" : "phone") : state.density === 320 ? "wide" : "phone";
        const modes = { appearance, viewport }; const variant = irs[role].mobileVariants.find((candidate) => candidate.modes.appearance === appearance && candidate.modes.viewport === viewport) ?? irs[role];
        for (const output of variant.outputs) {
          const [shot] = await takeDocumentScreenshots(variant.renderDocument, [{ nodeIds: [output.id] }], new Map(), { scale: state.scale, maxDimension: 4096, failOnDownscale: true });
          const bytes = Buffer.from(shot.data, "base64"); const path = join(root, "references", platform, state.key, appearance, `${output.id}.png`); await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, bytes);
          references[platform][state.key][appearance][output.id] = { path: safeRelative(root, path), width: shot.width, height: shot.height, sha256: sha256(bytes), scale: state.scale, modes };
        }
      }
    }
  }
  await writeFile(join(root, "reference-index.json"), json(references));
  return { root, documents, irs, generated, sourceReceipt, references };
}

export async function decodePng(bytes) {
  const { getCanvasKit } = await import("../vendor/open-pencil/engine.source.mjs"); const ck = await getCanvasKit(); const image = ck.MakeImageFromEncoded(bytes); assert.ok(image, "CanvasKit must decode PNG");
  try { const width = image.width(); const height = image.height(); return { width, height, pixels: new Uint8Array(image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB })) }; } finally { image.delete(); }
}

function colorFromHex(value) { const hex = String(value).replace(/^#/u, ""); const normalized = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex; return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)); }
function closeColor(a, b, tolerance) { return a.every((channel, index) => Math.abs(channel - b[index]) <= tolerance); }
function interiorMask(reference, boundary = 2) {
  const mask = new Uint8Array(reference.width * reference.height); for (let y = boundary; y < reference.height - boundary; y += 1) for (let x = boundary; x < reference.width - boundary; x += 1) {
    let interior = reference.pixels[(y * reference.width + x) * 4 + 3] >= 250;
    // Erode only physical alpha boundaries. Color gradients are intentionally
    // allowed to vary inside the shape; treating each gradient step as an
    // edge would leave no samples and could hide a native geometry error.
    for (let dy = -boundary; dy <= boundary && interior; dy += 1) for (let dx = -boundary; dx <= boundary && interior; dx += 1) if (reference.pixels[((y + dy) * reference.width + x + dx) * 4 + 3] < 250) interior = false;
    if (interior) mask[y * reference.width + x] = 1;
  } return mask;
}
function solidPaint(fill) { const paints = Array.isArray(fill) ? fill : [fill]; const active = paints.find((paint) => paint != null && paint.enabled !== false); return typeof active === "string" || typeof active?.color === "string" ? active : null; }
function expectedNodeBounds(ir, caseId, scale, boundary = 2) { const output = ir.outputs.find(({ id }) => id === caseId); assert.ok(output); return Object.fromEntries(output.nodes.filter((node) => node.id !== output.id && node.type !== "frame" && solidPaint(node.paint.fill) != null).map((node) => { const raw = { x: Math.round(node.geometry.x * scale), y: Math.round(node.geometry.y * scale), width: Math.round(node.geometry.w * scale), height: Math.round(node.geometry.h * scale) }; return [node.id, { x: raw.x + boundary, y: raw.y + boundary, width: Math.max(0, raw.width - boundary * 2), height: Math.max(0, raw.height - boundary * 2), rawExpected: raw }]; })); }

export function compareFlowPaint(reference, actual, ir, caseId, scale, boundary = 2, tolerance = 2) {
  if (reference.width !== actual.width || reference.height !== actual.height) return { status: "fail", reason: "crop dimensions differ", comparedPixels: 0, mismatchedPixels: 0 };
  const spec = CASE_SPECS.find(({ id }) => id === caseId); assert.ok(spec);
  let comparedPixels = 0; let mismatchedPixels = 0;
  const mask = interiorMask(reference, boundary);
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) { comparedPixels += 1; const offset = index * 4; if ([0, 1, 2, 3].some((channel) => Math.abs(reference.pixels[offset + channel] - actual.pixels[offset + channel]) > tolerance)) mismatchedPixels += 1; }
  const expectedBounds = expectedNodeBounds(ir, caseId, scale); const observedBounds = {}; const boundMismatches = [];
  for (const [nodeId, bounds] of Object.entries(expectedBounds)) {
    const node = ir.outputs.flatMap((output) => output.nodes).find((candidate) => candidate.id === nodeId); const solid = solidPaint(node?.paint.fill); const color = colorFromHex(solid?.color ?? solid); let minX = actual.width; let minY = actual.height; let maxX = -1; let maxY = -1;
    for (let y = 0; y < actual.height; y += 1) for (let x = 0; x < actual.width; x += 1) { const offset = (y * actual.width + x) * 4; if (actual.pixels[offset + 3] >= 250 && closeColor(Array.from(actual.pixels.slice(offset, offset + 3)), color, tolerance)) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); } }
    observedBounds[nodeId] = maxX >= 0 ? { x: minX + boundary, y: minY + boundary, width: Math.max(0, maxX - minX + 1 - boundary * 2), height: Math.max(0, maxY - minY + 1 - boundary * 2), rawObserved: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } } : null;
    const observed = observedBounds[nodeId]; if (!observed || ["x", "y", "width", "height"].some((key) => Math.abs(observed[key] - bounds[key]) > boundary)) boundMismatches.push({ nodeId, expected: bounds, observed });
  }
  return { status: mismatchedPixels || boundMismatches.length ? "fail" : comparedPixels ? "pass" : "unmeasured", comparedPixels, mismatchedPixels, expectedBounds, observedBounds, boundMismatches, boundaryExclusionPhysicalPixels: boundary, channelTolerance: tolerance, geometry: spec.kind === "gradient" ? "sampled at authored Canvas pixels" : "authored solid-color interiors" };
}

export function parseReadiness(log, caseId, nonce, platform) {
  const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); const n = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))";
  const ready = new RegExp(`LUNA_FLOW_PAINT_READY case=${escaped(caseId)} nonce=${escaped(nonce)}(?:\\n|$)`, "u").test(String(log));
  const pattern = platform === "ios" ? new RegExp(`LUNA_FLOW_PAINT_ROOT case=${escaped(caseId)} nonce=${escaped(nonce)} frame=${n},${n} ${n}x${n} scale=${n}`, "u") : new RegExp(`LUNA_FLOW_PAINT_ROOT case=${escaped(caseId)} nonce=${escaped(nonce)} x=${n} y=${n} width=${n} height=${n} scale=${n}`, "u");
  const match = String(log).match(pattern); if (!ready || !match) return null; const values = match.slice(1).map(Number); if (values.some((value) => !Number.isFinite(value))) return null;
  return platform === "ios" ? { root: { x: values[0], y: values[1], width: values[2], height: values[3] }, scale: values[4] } : { root: { x: values[0], y: values[1], width: values[2], height: values[3] }, scale: values[4] };
}

export function stableHashes(hashes) { return hashes.length === 2 && hashes.every((hash) => /^[0-9a-f]{64}$/u.test(hash)) && hashes[0] === hashes[1]; }
export function newNonce(platform, state, caseId) { return `flow-paint-${platform}-${state}-${caseId}-${randomUUID()}`; }
export async function cropRoot(bytes, readiness) {
  try { return await cropPngBytes(bytes, { x: Math.round(readiness.root.x * readiness.scale), y: Math.round(readiness.root.y * readiness.scale), width: Math.round(readiness.root.width * readiness.scale), height: Math.round(readiness.root.height * readiness.scale) }, await (await import("../vendor/open-pencil/engine.source.mjs")).getCanvasKit()); }
  catch (error) { return { bytes, fallbackReason: String(error?.message ?? error) }; }
}

export async function writeImmutableManifest(root, extra = {}) {
  const { readdir, stat } = await import("node:fs/promises"); const files = [];
  async function visit(dir) { for (const name of (await readdir(dir)).sort()) { const path = join(dir, name); const info = await stat(path); if (info.isDirectory()) await visit(path); else if (safeRelative(root, path) !== "artifact-manifest.json") { const bytes = await readFile(path); files.push({ path: safeRelative(root, path), bytes: bytes.length, sha256: sha256(bytes) }); } } }
  await visit(root); files.sort((a, b) => a.path.localeCompare(b.path)); const manifest = { package: EVIDENCE_PACKAGE, generatedAt: new Date().toISOString(), immutable: true, files, ...extra }; const bytes = Buffer.from(json(manifest)); await writeFile(join(root, "artifact-manifest.json"), bytes); const { chmod } = await import("node:fs/promises"); await chmod(join(root, "artifact-manifest.json"), 0o444); return { ...manifest, manifestSha256: sha256(bytes) };
}
