import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";

export const IOS_DEVICES = Object.freeze([
  { key: "iphone-large", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", scale: 3, contentSizes: ["large", "accessibility-extra-extra-large"] },
  { key: "ipad-large", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", scale: 2, contentSizes: ["large"] },
]);
export const ANDROID_STATES = Object.freeze([
  { density: 420, fontScale: 1 }, { density: 420, fontScale: 2 },
  { density: 320, fontScale: 1 }, { density: 320, fontScale: 2 },
]);
export const TEXT_CASES = Object.freeze([
  { id: "uniform-single-run", label: "uniform single-run text", classification: "typography", content: "Canvas fixed text", fontSize: 24, width: 300, height: 64, marks: [] },
  { id: "top-level-style-spacing", label: "top-level style and fractional spacing", classification: "typography", content: "Italic spaced text", fontSize: 24, fontStyle: "italic", letterSpacing: -0.25, width: 300, height: 64, marks: [] },
  { id: "top-level-decorations", label: "top-level decorations", classification: "decorations", content: "Decorated text", fontSize: 24, underline: true, strikethrough: true, width: 300, height: 64, marks: [] },
  { id: "rich-run-fill-family", label: "rich-run fill and family", classification: "rich-run", content: "Regular Accent", fontSize: 24, width: 300, height: 64, marks: [{ type: "fill", from: 8, to: 14, value: "#CC5500" }, { type: "fontFamily", from: 8, to: 14, value: "Inter" }] },
  { id: "rich-run-size", label: "mixed-size rich runs", classification: "rich-run", content: "Small BIG", fontSize: 24, width: 300, height: 64, marks: [{ type: "fontSize", from: 6, to: 9, value: 36 }, { type: "weight", from: 6, to: 9, value: 700 }] },
  { id: "rich-run-italic-spacing", label: "rich-run italic and fractional spacing", classification: "rich-run", content: "Base Tilt", fontSize: 24, width: 300, height: 64, marks: [{ type: "italic", from: 5, to: 9, value: true }, { type: "letterSpacing", from: 5, to: 9, value: 0.375 }] },
  { id: "rich-run-decorations", label: "rich-run decorations", classification: "decorations", content: "Under Strike", fontSize: 24, width: 300, height: 64, marks: [{ type: "underline", from: 0, to: 5, value: true }, { type: "strikethrough", from: 6, to: 12, value: true }] },
  { id: "marks-and-paragraphs", label: "marks and paragraphs", classification: "semantics", content: "Heading\nBody", fontSize: 24, width: 300, height: 90, marks: [{ type: "weight", from: 0, to: 7, value: 700 }], paragraphs: [{ from: 0, to: 8, headingLevel: 1 }, { from: 8, to: 12 }] },
  { id: "text-growth-auto", label: "text growth auto", classification: "text-growth", content: "Auto growth text", fontSize: 24, width: 300, height: 64, textGrowth: "auto", marks: [] },
  { id: "text-growth-fixed-width", label: "text growth fixed width", classification: "line-wrapping", content: "Fixed width text wraps at authored width", fontSize: 24, width: 160, height: 120, textGrowth: "fixed-width", marks: [] },
  { id: "text-growth-fixed-width-height", label: "text growth fixed width height", classification: "line-wrapping", content: "Fixed width and height text", fontSize: 24, width: 160, height: 80, textGrowth: "fixed-width-height", marks: [] },
]);

export const CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.lang", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.children",
  "roles.ios", "roles.android", "nodes.frame", "nodes.text", "properties.layout", "properties.fill", "properties.fill.solid",
  "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontStyle", "properties.fontWeight",
  "properties.letterSpacing", "properties.marks", "properties.paragraphs", "properties.strikethrough", "properties.underline",
  "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.italic",
  "properties.text.run.letterSpacing", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.weight",
  "properties.text.paragraph.headingLevel",
  "properties.textGrowth",
]);

export const IOS_BUNDLE_ID = "com.penkra.canvas.qa.fixedtext";
export const ANDROID_BUNDLE_ID = "com.penkra.canvas.fixture";
export const DEFAULT_EVIDENCE_ROOT = resolve(import.meta.dirname, "../research/luna-mobile-fixed-text-20260907");

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sourceName(value) {
  const result = String(value).replace(/[^A-Za-z0-9]+/gu, " ").trim().split(/\s+/u).map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
  assert.match(result, /^[A-Za-z][A-Za-z0-9]*$/u);
  return result;
}
function color(hex) { const value = hex.replace(/^#/u, ""); return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255); }

export function classifyFixedTextCase(caseId) {
  const item = TEXT_CASES.find(({ id }) => id === caseId);
  assert.ok(item, `unknown fixed text case ${caseId}`);
  return item.classification;
}

export function compareFixedTextPixels(reference, actual, boundary = 2, tolerance = 2) {
  if (!reference || !actual || reference.width !== actual.width || reference.height !== actual.height) return { status: "mismatch", comparedPixels: 0, mismatchedPixels: 0, reason: "capture dimensions differ from reference" };
  let comparedPixels = 0; let mismatchedPixels = 0;
  for (let y = boundary; y < reference.height - boundary; y += 1) for (let x = boundary; x < reference.width - boundary; x += 1) {
    const offset = (y * reference.width + x) * 4;
    // Transparent/background pixels do not prove text fidelity; authored
    // solid color pixels are the bounded positive samples used by the other
    // mobile comparators in this repository.
    if (reference.pixels[offset + 3] < 250 || reference.pixels[offset] > 245 && reference.pixels[offset + 1] > 245 && reference.pixels[offset + 2] > 245) continue;
    comparedPixels += 1;
    if ([0, 1, 2, 3].some((channel) => Math.abs(reference.pixels[offset + channel] - actual.pixels[offset + channel]) > tolerance)) mismatchedPixels += 1;
  }
  return { status: mismatchedPixels ? "fail" : "pass", comparedPixels, mismatchedPixels, boundaryExclusionPhysicalPixels: boundary, channelTolerance: tolerance };
}

export function buildFixedTextDocument(role) {
  assert.ok(["ios", "android"].includes(role));
  return {
    version: "2.17", module: "mobile", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: TEXT_CASES.map((item, index) => ({
      id: `fixed-text-${item.id}`, type: "frame", role, name: `Fixed Text ${item.label}`, x: 0, y: 0, width: 340, height: 180,
      layout: "none", fill: "#FFFFFF", children: [{
        id: `${item.id}-text`, type: "text", x: 20, y: 24, width: item.width, height: item.height, content: item.content,
        fontFamily: "Inter", fontSize: item.fontSize, fontWeight: 400, fill: index % 2 ? "#CC5500" : "#123456", marks: item.marks,
        paragraphs: item.paragraphs ?? [{ from: 0, to: item.content.length }],
        ...(item.fontStyle ? { fontStyle: item.fontStyle } : {}),
        ...(item.letterSpacing !== undefined ? { letterSpacing: item.letterSpacing } : {}),
        ...(item.underline !== undefined ? { underline: item.underline } : {}),
        ...(item.strikethrough !== undefined ? { strikethrough: item.strikethrough } : {}),
        ...(item.textGrowth ? { textGrowth: item.textGrowth } : {}),
      }],
    })),
  };
}

export function buildFixedTextIR(role, document = buildFixedTextDocument(role)) {
  return buildCapabilityVerificationIR(document, { role, frames: document.children.map(({ id }) => id) }, CANDIDATE_PATHS);
}

export function sourceHashReceipt(sources) {
  const files = [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, contents]) => ({ path, bytes: Buffer.byteLength(contents), sha256: sha256(contents) }));
  return { sourceSha256: sha256(files.map(({ path, sha256: digest }) => `${path}:${digest}\n`).join("")), files };
}

function buildSwiftHost(ir) {
  const cases = ir.outputs.map((output) => ({ id: output.id, source: sourceName(output.name) }));
  const ids = cases.map(({ id }) => JSON.stringify(id)).join(", ");
  const switches = cases.map(({ id, source }) => `    case ${JSON.stringify(id)}: return AnyView(${source}())`).join("\n");
  return `import SwiftUI\nimport UIKit\n\nenum FixedTextSelection {\n  static let known: Set<String> = [${ids}]\n  static func view(for id: String) -> AnyView {\n    switch id {\n${switches}\n    default: preconditionFailure("Unknown fixed text case: \\(id)")\n    }\n  }\n}\n\nstruct FixedTextScreen: View {\n  let caseID: String\n  let nonce: String\n  var body: some View { FixedTextSelection.view(for: caseID)\n    .frame(width: 340, height: 180, alignment: .topLeading)\n    .accessibilityIdentifier("canvas-fixed-text-\\(caseID)")\n    .background(GeometryReader { proxy in Color.clear.onAppear {\n      let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }.first\n      let screen = window?.screen ?? UIScreen.main\n      NSLog("LUNA_FIXED_TEXT_READY case=%@ nonce=%@", caseID, nonce)\n      NSLog("LUNA_FIXED_TEXT_ROOT case=%@ nonce=%@ frame=%.3f,%.3f %.3fx%.3f scale=%.3f", caseID, nonce, proxy.frame(in: .global).minX, proxy.frame(in: .global).minY, proxy.frame(in: .global).width, proxy.frame(in: .global).height, screen.scale)\n    } })\n  }\n}\n\n@main struct FixedTextApp: App {\n  let caseID: String; let nonce: String\n  init() {\n    let args = ProcessInfo.processInfo.arguments\n    guard let ci = args.firstIndex(of: "--canvas-case"), args.indices.contains(ci + 1), let ni = args.firstIndex(of: "--canvas-nonce"), args.indices.contains(ni + 1) else { preconditionFailure("case and nonce are required") }\n    caseID = args[ci + 1]; nonce = args[ni + 1]\n    guard FixedTextSelection.known.contains(caseID), !nonce.isEmpty else { preconditionFailure("invalid selection") }\n  }\n  var body: some Scene { WindowGroup { FixedTextScreen(caseID: caseID, nonce: nonce) } }\n}\n`;
}

function buildComposeHost() {
  return `package com.penkra.canvas.fixture\n\nimport android.os.Bundle\nimport android.util.Log\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.foundation.layout.Box\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.layout.onGloballyPositioned\nimport androidx.compose.ui.layout.positionInWindow\nimport androidx.compose.ui.unit.IntSize\nimport generated.canvas.*\n\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(state: Bundle?) {\n    super.onCreate(state)\n    val caseID = intent.getStringExtra("canvasCase") ?: "uniform-single-run"\n    val nonce = intent.getStringExtra("canvasNonce") ?: "missing"\n    setContent { Box(modifier = Modifier.onGloballyPositioned { coordinates ->\n      val size: IntSize = coordinates.size\n      val origin = coordinates.positionInWindow()\n      val density = resources.displayMetrics.density\n      Log.i("CanvasFixedText", "LUNA_FIXED_TEXT_READY case=$caseID nonce=$nonce")\n      Log.i("CanvasFixedText", "LUNA_FIXED_TEXT_ROOT case=$caseID nonce=$nonce x=${'$'}{origin.x} y=${'$'}{origin.y} width=${'$'}{size.width} height=${'$'}{size.height} scale=${'$'}density")\n    }) { FixedTextSelection.view(caseID) } }\n  }\n}\n\nobject FixedTextSelection {\n  @androidx.compose.runtime.Composable fun view(id: String) {\n    when (id) {\n${TEXT_CASES.map((item) => `      "${item.id}" -> ${sourceName(`Fixed Text ${item.label}`)}()`).join("\n")}\n      else -> error("Unknown fixed text case: ${'$'}id")\n    }\n  }\n}\n`;
}

function buildIosProjectYaml() {
  return `name: CanvasFixedTextEvidence\noptions:\n  bundleIdPrefix: com.penkra.canvas.qa\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasFixedTextEvidence:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources:\n      - swift/Sources/CanvasFixedText\n      - swift/SimulatorHost\n      - path: ../../vendor/open-pencil/fonts\n        buildPhase: resources\n    info:\n      path: swift/SimulatorHost/Info.plist\n      properties:\n        UIAppFonts:\n          - Inter-Regular.ttf\n          - Inter-Medium.ttf\n          - Inter-SemiBold.ttf\n          - Inter-Bold.ttf\n          - Inter-ExtraBold.ttf\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: ${IOS_BUNDLE_ID}\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"\nschemes:\n  CanvasFixedTextEvidence:\n    build:\n      targets:\n        CanvasFixedTextEvidence: all\n`;
}

function referenceStateDir(root, platform, state) { return join(root, "references", platform, state); }
function stateName(value) { return value.replaceAll("/", "-").replaceAll(" ", "_"); }

export async function prepareFixedTextEvidence(destination = DEFAULT_EVIDENCE_ROOT) {
  const root = resolve(destination);
  const iosDocument = buildFixedTextDocument("ios");
  const androidDocument = buildFixedTextDocument("android");
  const iosIR = buildFixedTextIR("ios", iosDocument);
  const androidIR = buildFixedTextIR("android", androidDocument);
  const swiftFiles = new Map([...exportSwiftUI(iosIR)].map(([path, text]) => [path.replace(/^_canvas\//u, ""), text]));
  swiftFiles.set("SimulatorHost/FixedTextApp.swift", buildSwiftHost(iosIR));
  const composeFiles = new Map([...exportCompose(androidIR)].map(([path, text]) => [path.replace(/^_canvas\//u, ""), text]));
  composeFiles.set("MainActivity.kt", buildComposeHost());
  await mkdir(join(root, "swift", "Sources", "CanvasFixedText"), { recursive: true });
  await mkdir(join(root, "swift", "SimulatorHost"), { recursive: true });
  await mkdir(join(root, "compose", "generated"), { recursive: true });
  await writeFile(join(root, "ios-fixture.json"), json(iosDocument));
  await writeFile(join(root, "android-fixture.json"), json(androidDocument));
  await writeFile(join(root, "ios-ir.json"), json({ ...iosIR, renderDocument: undefined }));
  await writeFile(join(root, "android-ir.json"), json({ ...androidIR, renderDocument: undefined }));
  for (const [path, text] of swiftFiles) {
    const destinationPath = path.startsWith("SimulatorHost/") ? join(root, "swift", path) : join(root, "swift", "Sources", "CanvasFixedText", path);
    await mkdir(join(destinationPath, ".."), { recursive: true });
    await writeFile(destinationPath, text);
  }
  for (const [path, text] of composeFiles) await writeFile(join(root, "compose", "generated", path), text);
  const project = buildIosProjectYaml();
  await writeFile(join(root, "project.yml"), project);
  const sourceReceipt = sourceHashReceipt(new Map([...swiftFiles].map(([path, value]) => [`swift/${path}`, value]).concat([["project.yml", project], ...[...composeFiles].map(([path, value]) => [`compose/generated/${path}`, value])])))
  await writeFile(join(root, "source-hashes.json"), json(sourceReceipt));
  const references = { ios: [], android: [] };
  for (const device of IOS_DEVICES) for (const size of device.contentSizes) {
    const state = `${device.key}-${stateName(size)}`; references.ios.push(state);
    for (const [index, item] of TEXT_CASES.entries()) {
      const [image] = await takeDocumentScreenshots(iosDocument, [{ nodeIds: [iosDocument.children[index].id] }], new Map(), { scale: device.scale, maxDimension: 4096, failOnDownscale: true });
      const path = join(referenceStateDir(root, "ios", state), `${item.id}.png`); await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, Buffer.from(image.data, "base64"));
    }
  }
  for (const state of ANDROID_STATES) {
    const name = `density-${state.density}-font-${state.fontScale}`; references.android.push(name);
    for (const [index, item] of TEXT_CASES.entries()) {
      const [image] = await takeDocumentScreenshots(androidDocument, [{ nodeIds: [androidDocument.children[index].id] }], new Map(), { scale: state.density / 160, maxDimension: 4096, failOnDownscale: true });
      const path = join(referenceStateDir(root, "android", name), `${item.id}.png`); await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, Buffer.from(image.data, "base64"));
    }
  }
  const plan = {
    sourceOnly: true, nativeRun: false, caseIds: TEXT_CASES.map(({ id }) => id), classifications: Object.fromEntries(TEXT_CASES.map(({ id, classification }) => [id, classification])),
    ios: { bundleId: IOS_BUNDLE_ID, devices: IOS_DEVICES, entries: references.ios.length * TEXT_CASES.length, build: "xcodegen generate --spec project.yml && xcodebuild -project CanvasFixedTextEvidence.xcodeproj -scheme CanvasFixedTextEvidence -sdk iphonesimulator -configuration Debug -jobs 2", launch: "xcrun simctl launch --terminate-running-process <UDID> com.penkra.canvas.qa.fixedtext --canvas-case <CASE_ID> --canvas-nonce <NONCE>", readiness: "exact LUNA_FIXED_TEXT_READY and LUNA_FIXED_TEXT_ROOT case+nonce receipts", stability: "two consecutive screenshots with equal lowercase SHA-256 plus rehash after crop", states: references.ios },
    android: { applicationId: ANDROID_BUNDLE_ID, states: ANDROID_STATES, entries: references.android.length * TEXT_CASES.length, build: "./gradlew --no-daemon --max-workers 2 :app:assembleDebug", launch: "adb -s emulator-5554 shell am start -n com.penkra.canvas.fixture/.MainActivity --es canvasCase <CASE_ID> --es canvasNonce <NONCE>", settings: "adb -s emulator-5554 shell wm density <320|420>; adb -s emulator-5554 shell settings put system font_scale <1|2>", readiness: "exact LUNA_FIXED_TEXT_READY case+nonce logcat receipt", stability: "two consecutive screenshots with equal lowercase SHA-256", states: references.android },
    comparator: { boundaryExclusionPhysicalPixels: 2, channelTolerance: 2, registrations: "none; root receipt only", classifications: "typography, decorations, and line-wrapping are reported separately", verdict: "unmeasured until native receipt, stable frames, and comparison exist" },
  };
  await writeFile(join(root, "capture-plan.json"), json(plan));
  await writeFile(join(root, "README.md"), `# Fixed-layout mobile text capture harness\n\nThis package is source-only. It prepares the same four deterministic text cases for SwiftUI and Compose: uniform single-run, mixed-size rich runs, decorations, and bounded wrapping. It does not start a simulator/emulator or compiler.\n\nEach native matrix entry must retain generated source hashes, executable/APK hashes, device settings before/after, a unique selection nonce, exact readiness and root receipts, two consecutive equal full-frame SHA-256 hashes, and the comparison row. Native results are unmeasured until all of those receipts exist. The comparator uses a 2-physical-pixel boundary exclusion and channel tolerance 2; no tolerance or registration loosening is permitted.\n\nRun \`node scripts/luna-mobile-fixed-text-capture.mjs --prepare\` first. The exact compiler and device commands are in capture-plan.json.\n`);
  return { root, iosIR, androidIR, sourceReceipt, plan };
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.argv.includes("--prepare")) {
  const result = await prepareFixedTextEvidence(process.env.CANVAS_FIXED_TEXT_EVIDENCE_ROOT ?? DEFAULT_EVIDENCE_ROOT);
  console.log(JSON.stringify({ root: result.root, sourceSha256: result.sourceReceipt.sourceSha256, cases: TEXT_CASES.length, iosEntries: result.plan.ios.entries, androidEntries: result.plan.android.entries, nativeRun: false }, null, 2));
}
