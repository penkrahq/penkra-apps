import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { measureDocumentText } from "../src/document-screenshot.mjs";
import { CASES, buildTextDecorationDocument } from "./luna-ios-text-fixture.mjs";
import { analyzePngFile, compareBounds } from "./luna-ios-text-metrics.mjs";

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageEvidence = resolve(root, "research/luna-ios-text-20260906");
const exactEvidence = resolve(packageEvidence, "exact-font-catalog");
const evidence = resolve(root, "research/luna-ios-text-metrics-20260906");
const runtimeEvidence = resolve(evidence, "runtime");
const fixtureEvidence = resolve(evidence, "runtime-font-fixture");
const metricsPath = resolve(exactEvidence, "measurements.json");
const devices = [
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", sizes: ["large", "accessibility-extra-extra-large"] },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", sizes: ["large"] },
];
const commandLog = [];

async function command(commandName, args, options = {}) {
  const started = new Date().toISOString();
  try {
    const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
    commandLog.push({ command: [commandName, ...args].join(" "), exitCode: 0, started, finished: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
    return result;
  } catch (error) {
    const exitCode = error.code ?? 1;
    commandLog.push({ command: [commandName, ...args].join(" "), exitCode, started, finished: new Date().toISOString(), stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) });
    throw Object.assign(error, { exitCode });
  }
}

async function commandAllowFailure(commandName, args, options = {}) {
  try {
    return { ...(await command(commandName, args, options)), code: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? String(error), code: error.exitCode ?? 1 };
  }
}

function evidenceRelative(target) {
  return relative(evidence, target).split(sep).join("/");
}

function filePath(relativePath, base = exactEvidence) {
  const target = resolve(base, relativePath);
  if (!target.startsWith(`${base}${sep}`)) throw new Error(`Evidence path escapes root: ${relativePath}`);
  return target;
}

function pairDelta(reference, actual) {
  return {
    dimensions: { width: actual.width - reference.width, height: actual.height - reference.height },
    inkBounds: compareBounds(reference.inkBounds, actual.inkBounds),
    bandCount: actual.bands.length - reference.bands.length,
    rowHistogramEqual: JSON.stringify(reference.rowHistogram) === JSON.stringify(actual.rowHistogram),
    bandRows: actual.bands.map(({ startRow, endRow }) => [startRow, endRow]),
    referenceBandRows: reference.bands.map(({ startRow, endRow }) => [startRow, endRow]),
  };
}

async function analyzeCommittedPairs() {
  const ck = await getCanvasKit();
  const source = JSON.parse(await readFile(metricsPath, "utf8"));
  const entries = [];
  for (const entry of source.entries) {
    const referenceAbsolute = filePath(entry.referencePath);
    const captureAbsolute = filePath(entry.capturePath);
    const reference = await analyzePngFile(ck, referenceAbsolute, evidenceRelative(referenceAbsolute), entry.scale);
    const native = await analyzePngFile(ck, captureAbsolute, evidenceRelative(captureAbsolute), entry.scale);
    entries.push({
      caseId: entry.caseId,
      deviceId: entry.deviceId,
      contentSize: entry.contentSize,
      scale: entry.scale,
      registration: { applied: false, translation: false, scaleNormalization: false },
      reference,
      native,
      delta: pairDelta(reference, native),
    });
  }
  return { package: "luna-ios-text-metrics-20260906", sourceMeasurements: evidenceRelative(metricsPath), entries };
}

function canvasLineSummary(layout) {
  return layout.lines.map((line) => ({
    baseline: line.baseline,
    top: line.top,
    bottom: line.bottom,
    runs: line.runs.map((run) => ({
      size: run.size,
      fakeBold: run.fakeBold,
      fakeItalic: run.fakeItalic,
      glyphCount: run.glyphs.length,
      positionCount: run.positions.length,
      positions: run.positions,
    })),
  }));
}

async function measureCanvasDocument() {
  const document = buildTextDecorationDocument();
  const nodeIds = CASES.map(({ id }) => `${id}-text`);
  const result = await measureDocumentText(document, nodeIds);
  const layouts = Object.fromEntries([...result.entries()].map(([id, layout]) => [id, layout]));
  await writeFile(join(evidence, "document-text-measurements.json"), `${JSON.stringify({ nodeIds, layouts }, null, 2)}\n`);
  const first = result.values().next().value;
  return { nodeIds, fontHashes: first?.fontHashes ?? {}, layouts };
}

const runtimeSwift = `import Foundation
import UIKit
import CoreText

enum RuntimeMetrics {
  private static let strings = ["Canvas text", "Second line"]

  static func write() {
    do {
      let regular = try exactFont(name: "Inter-Regular")
      let bold = try exactFont(name: "Inter-Bold")
      let payload: [String: Any] = [
        "deviceId": argument("--device-id") ?? "unknown",
        "contentSizeArgument": argument("--content-size") ?? "unknown",
        "contentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
        "apiProvenance": "UIFont and CTFont runtime facts; not a claim about SwiftUI layout",
        "fonts": ["regular": metrics(for: regular), "bold": metrics(for: bold)],
        "scaledBody": ["regular": scaledMetrics(for: regular), "bold": scaledMetrics(for: bold)],
      ]
      let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
      let url = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("runtime-metrics.json")
      try data.write(to: url, options: .atomic)
    } catch {
      fatalError("Runtime metrics failed: \\(error)")
    }
  }

  private static func argument(_ name: String) -> String? {
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), args.indices.contains(index + 1) else { return nil }
    return args[index + 1]
  }

  private static func exactFont(name: String) throws -> UIFont {
    guard let font = UIFont(name: name, size: 24) else { throw NSError(domain: "RuntimeMetrics", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing registered font \\(name)"]) }
    return font
  }

  private static func scaledMetrics(for font: UIFont) -> [String: Any] {
    let scaled = UIFontMetrics(forTextStyle: .body).scaledFont(for: font)
    var output = metrics(for: scaled)
    output["sourcePointSize"] = Double(font.pointSize)
    output["scalingAPI"] = "UIFontMetrics(forTextStyle: .body).scaledFont(for:)"
    return output
  }

  private static func metrics(for font: UIFont) -> [String: Any] {
    let ctFont = CTFontCreateWithName(font.fontName as CFString, font.pointSize, nil)
    return [
      "uiFontName": font.fontName,
      "postScriptName": CTFontCopyPostScriptName(ctFont) as String,
      "pointSize": Double(font.pointSize),
      "ascender": Double(font.ascender),
      "descender": Double(font.descender),
      "leading": Double(font.leading),
      "capHeight": Double(font.capHeight),
      "xHeight": Double(font.xHeight),
      "lineHeight": Double(font.lineHeight),
      "ctLineHeight": Double(CTFontGetAscent(ctFont) + CTFontGetDescent(ctFont) + CTFontGetLeading(ctFont)),
      "glyphAdvances": strings.map { glyphAdvances(for: ctFont, text: $0) },
    ]
  }

  private static func glyphAdvances(for font: CTFont, text: String) -> [String: Any] {
    var units = Array(text.utf16)
    var glyphs = Array(repeating: CGGlyph(), count: units.count)
    guard CTFontGetGlyphsForCharacters(font, &units, &glyphs, units.count) else { return ["text": text, "available": false] }
    var advances = Array(repeating: CGSize.zero, count: glyphs.count)
    let total = CTFontGetAdvancesForGlyphs(font, .default, glyphs, &advances, glyphs.count)
    return [
      "text": text,
      "available": true,
      "glyphs": glyphs.map { Int($0) },
      "advances": advances.map { ["x": Double($0.width), "y": Double($0.height)] },
      "totalAdvance": total,
    ]
  }
}

@main
struct CanvasTextMetricsApp: App {
  init() {
    CanvasFonts.register()
    RuntimeMetrics.write()
  }

  var body: some Scene { WindowGroup { Color.white.ignoresSafeArea() } }
}
`;

async function prepareRuntimeFixture() {
  const temp = await mkdtemp(join(tmpdir(), "canvas-luna-ios-text-metrics-"));
  const sourceDir = join(temp, "Sources/CanvasTextMetrics");
  const hostDir = join(temp, "SimulatorHost");
  const fontsDir = join(temp, "Resources/Fonts");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(hostDir, { recursive: true });
  await mkdir(fontsDir, { recursive: true });
  await writeFile(join(sourceDir, "CanvasFonts.swift"), await readFile(join(exactEvidence, "swift/CanvasFonts.swift")));
  await writeFile(join(sourceDir, "RuntimeMetrics.swift"), runtimeSwift);
  for (const name of ["a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50.ttf", "fbe825cbfc749317f57a1433d3905aa9d3f388732fd29b8e8a36f34845e3bc3e.ttf"]) {
    await writeFile(join(fontsDir, name), await readFile(join(exactEvidence, "Fonts", name)));
  }
  await mkdir(join(fixtureEvidence, "Sources"), { recursive: true });
  await mkdir(join(fixtureEvidence, "Fonts"), { recursive: true });
  await writeFile(join(fixtureEvidence, "Sources/CanvasFonts.swift"), await readFile(join(sourceDir, "CanvasFonts.swift")));
  await writeFile(join(fixtureEvidence, "Sources/RuntimeMetrics.swift"), runtimeSwift);
  for (const name of ["a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50.ttf", "fbe825cbfc749317f57a1433d3905aa9d3f388732fd29b8e8a36f34845e3bc3e.ttf"]) await writeFile(join(fixtureEvidence, "Fonts", name), await readFile(join(fontsDir, name)));
  await writeFile(join(temp, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleDisplayName</key><string>Canvas Text Metrics</string><key>CFBundleIdentifier</key><string>com.penkra.canvas.qa.textmetrics</string><key>CFBundleName</key><string>Canvas Text Metrics</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>1</string><key>LSRequiresIPhoneOS</key><true/><key>UILaunchScreen</key><dict/></dict></plist>\n`);
  const project = `name: CanvasTextMetrics\noptions:\n  bundleIdPrefix: com.penkra.canvas.qa\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasTextMetrics:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources:\n      - Sources/CanvasTextMetrics\n      - path: Resources/Fonts\n        buildPhase: resources\n    info:\n      path: Info.plist\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: com.penkra.canvas.qa.textmetrics\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"\nschemes:\n  CanvasTextMetrics:\n    build:\n      targets:\n        CanvasTextMetrics: all\n`;
  await writeFile(join(temp, "project.yml"), project);
  await writeFile(join(fixtureEvidence, "project.yml"), project);
  await command("xcodegen", ["generate", "--spec", "project.yml"], { cwd: temp });
  return temp;
}

async function readRuntimeJson(device, size, appData) {
  const outputPath = join(runtimeEvidence, device.key, `${size}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  const dataContainer = (await command("xcrun", ["simctl", "get_app_container", device.id, "com.penkra.canvas.qa.textmetrics", "data"])).stdout.trim();
  await commandAllowFailure("xcrun", ["simctl", "spawn", device.id, "rm", "-f", `${dataContainer}/Documents/runtime-metrics.json`]);
  const launch = await commandAllowFailure("xcrun", ["simctl", "launch", "--terminate-running-process", device.id, "com.penkra.canvas.qa.textmetrics", "--device-id", device.id, "--content-size", size]);
  if (launch.code !== 0) {
    await writeFile(join(runtimeEvidence, device.key, `${size}.launch-failure.log`), `${launch.stdout}\n${launch.stderr}`);
    return { deviceId: device.id, contentSize: size, status: "unmeasured", launchExitCode: launch.code, launchFailurePath: evidenceRelative(join(runtimeEvidence, device.key, `${size}.launch-failure.log`)) };
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
  const jsonPath = `${dataContainer}/Documents/runtime-metrics.json`;
  const runtime = JSON.parse((await command("xcrun", ["simctl", "spawn", device.id, "cat", jsonPath])).stdout);
  runtime.capturePath = evidenceRelative(outputPath);
  runtime.status = "measured";
  await writeFile(outputPath, `${JSON.stringify(runtime, null, 2)}\n`);
  return runtime;
}

async function collectRuntimeFacts() {
  const temp = await prepareRuntimeFixture();
  const derivedData = join(temp, "DerivedData");
  const buildArgs = ["-project", "CanvasTextMetrics.xcodeproj", "-scheme", "CanvasTextMetrics", "-sdk", "iphonesimulator", "-configuration", "Debug", "-derivedDataPath", derivedData, "CODE_SIGNING_ALLOWED=NO", "build", "-jobs", "2"];
  await writeFile(join(evidence, "xcodebuild-command.txt"), `xcodebuild ${buildArgs.join(" ")}\n`);
  let buildExit = 0;
  try { await command("xcodebuild", buildArgs, { cwd: temp }); }
  catch (error) { buildExit = error.exitCode ?? 1; }
  await writeFile(join(evidence, "xcodebuild.log"), `${JSON.stringify(commandLog.at(-1), null, 2)}\n`);
  if (buildExit !== 0) throw new Error(`Runtime metrics fixture build failed: ${buildExit}`);
  const appPath = join(derivedData, "Build/Products/Debug-iphonesimulator/CanvasTextMetrics.app");
  for (const device of devices) await command("xcrun", ["simctl", "install", device.id, appPath]);
  const observed = {};
  const runtime = [];
  try {
    for (const device of devices) {
      observed[device.key] = (await command("xcrun", ["simctl", "ui", device.id, "content_size"])).stdout.trim();
      for (const size of device.sizes) {
        await command("xcrun", ["simctl", "ui", device.id, "content_size", size]);
        runtime.push(await readRuntimeJson(device, size));
      }
    }
  } finally {
    for (const device of devices) if (observed[device.key]) await commandAllowFailure("xcrun", ["simctl", "ui", device.id, "content_size", observed[device.key]]);
  }
  await writeFile(join(evidence, "runtime-summary.json"), `${JSON.stringify({ fixtureTemp: temp, buildExit, observedContentSizes: observed, states: runtime }, null, 2)}\n`);
  return { temp, buildExit, observed, states: runtime };
}

function compareFacts(pixel, canvas, runtime) {
  const stateRows = [];
  for (const state of runtime.states) {
    const pixelEntries = pixel.entries.filter((entry) => entry.deviceId === state.deviceId && entry.contentSize === state.contentSize);
    const regular = canvas.layouts["case-01-text"];
    const bold = canvas.layouts["case-06-text"];
    stateRows.push({
      deviceId: state.deviceId,
      contentSize: state.contentSize,
      status: state.status,
      confirmed: {
        pixelPairs: pixelEntries.map((entry) => ({ caseId: entry.caseId, referenceInkBounds: entry.reference.inkBounds, nativeInkBounds: entry.native.inkBounds, delta: entry.delta })),
        nativeApi: state.status === "measured" ? { regular: state.fonts?.regular, bold: state.fonts?.bold, scaledBodyRegular: state.scaledBody?.regular, scaledBodyBold: state.scaledBody?.bold } : null,
        canvasKit: { regularLines: canvasLineSummary(regular), boldLines: canvasLineSummary(bold), fontHashes: canvas.fontHashes },
      },
      unprovenCausalInference: "Pixel and API metric differences are recorded facts; this dataset does not establish a SwiftUI layout cause or justify an offset/scale fix.",
    });
  }
  return { package: "luna-ios-text-metrics-20260906", states: stateRows };
}

await mkdir(evidence, { recursive: true });
const pixel = await analyzeCommittedPairs();
await writeFile(join(evidence, "pixel-measurements.json"), `${JSON.stringify(pixel, null, 2)}\n`);
const canvas = await measureCanvasDocument();
const runtime = await collectRuntimeFacts();
await writeFile(join(evidence, "comparison-report.json"), `${JSON.stringify(compareFacts(pixel, canvas, { states: runtime.states }), null, 2)}\n`);
await writeFile(join(evidence, "commands.json"), `${JSON.stringify(commandLog.map(({ stdout, stderr, ...entry }) => entry), null, 2)}\n`);
await writeFile(join(evidence, "README.md"), [
  "# iOS exact-catalog text metrics",
  "",
  "This evidence analyzes the committed exact-font-catalog reference/native pairs without translation, scale registration, or tolerance changes.",
  "",
  "- `pixel-measurements.json` retains CanvasKit-decoded hashes, physical/point dimensions, complete row histograms, consecutive ink bands, bounds, and pair deltas for all 30 pairs.",
  "- `runtime-summary.json` and `runtime/` retain actual UIFont/CTFont JSON from the registered catalog-font fixture at iPhone Large, iPhone accessibility-extra-extra-large, and iPad Large.",
  "- `document-text-measurements.json` retains every `measureDocumentText` layout and font hash for the twelve-text fixture nodes.",
  "- `comparison-report.json` separates confirmed pixel/API/CanvasKit facts from unproven SwiftUI causal inference.",
  "- The temporary runtime fixture uses the emitted CanvasFonts registration helper and hash-named Fonts resources; no UIAppFonts bypass was used.",
  "",
  "This is diagnosis evidence only. No emitter, font, engine, IR, capability table, existing script, or Android file was changed.",
  "",
].join("\n"));
console.log(JSON.stringify({ evidence, pixelEntries: pixel.entries.length, runtimeStates: runtime.states.length, buildExit: runtime.buildExit, observedContentSizes: runtime.observed }, null, 2));
