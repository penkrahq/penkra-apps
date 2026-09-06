import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { buildTextDecorationDocument, CASES } from "./luna-ios-text-fixture.mjs";
import { buildTextIR, buildFontCatalog, exportExactFontFiles, readExactFontSources, EXACT_CASE_IDS, ITALIC_CASE_IDS } from "./luna-ios-text-font-catalog.mjs";
import { buildUnmeasuredLaunchEntry, evidenceRelativePath } from "./luna-ios-text-harness.mjs";
import { imageIdentity, measureCapture, SCALE_BY_DEVICE } from "./luna-ios-text-verify.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageEvidence = resolve(root, "research/luna-ios-text-20260906");
const evidence = resolve(packageEvidence, "exact-font-catalog");
const baselineEvidence = resolve(packageEvidence, "font-registered");
const devices = [
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", sizes: ["large", "accessibility-extra-extra-large"] },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", sizes: ["large"] },
];
const sourceNames = Object.freeze({
  "case-01": "LunaIOSUnmarkedRegular", "case-02": "LunaIOSFullUnderline", "case-03": "LunaIOSFullStrikethrough",
  "case-04": "LunaIOSUnderlineAndStrikethrough", "case-06": "LunaIOSFullBold700", "case-07": "LunaIOSFirstSixUnderline",
  "case-08": "LunaIOSFirstSixStrikethrough", "case-10": "LunaIOSFirstSixOrangeFill", "case-11": "LunaIOSFullLetterSpacing",
  "case-12": "LunaIOSFirstSixLetterSpacing",
});
const commandLog = [];

async function command(commandName, args, options = {}) {
  const started = new Date().toISOString();
  const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
  commandLog.push({ command: [commandName, ...args].join(" "), exitCode: 0, started, finished: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
  return result;
}

async function commandAllowFailure(commandName, args, options = {}) {
  const started = new Date().toISOString();
  try {
    const result = await runFile(commandName, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
    commandLog.push({ command: [commandName, ...args].join(" "), exitCode: 0, started, finished: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
    return { ...result, code: 0 };
  } catch (error) {
    commandLog.push({ command: [commandName, ...args].join(" "), exitCode: error.code ?? 1, started, finished: new Date().toISOString(), stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) });
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? String(error), code: error.code ?? 1 };
  }
}

function portableRelative(rootPath, targetPath) {
  return relative(rootPath, targetPath).split(sep).join("/");
}

async function writeSelectedReferences(directory, document, caseIds, scale) {
  await mkdir(directory, { recursive: true });
  for (const id of caseIds) {
    const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: [id] }], new Map(), { scale, maxDimension: 4096, failOnDownscale: true });
    await writeFile(join(directory, `${id}.png`), Buffer.from(reference.data, "base64"));
  }
}

function hostFixtureSource() {
  const cases = EXACT_CASE_IDS.map((id) => `    case "${id}": AnyView(${sourceNames[id]}())`).join("\n");
  return `import SwiftUI\n\npublic struct MobileFixture: View {\n  private let selectedId: String = {\n    let args = ProcessInfo.processInfo.arguments\n    guard let index = args.firstIndex(of: "--canvas-case"), args.indices.contains(index + 1) else { return "case-01" }\n    return args[index + 1]\n  }()\n\n  private var selected: AnyView {\n    switch selectedId {\n${cases}\n    default: AnyView(LunaIOSUnmarkedRegular())\n    }\n  }\n\n  public var body: some View {\n    ZStack { selected }\n      .frame(maxWidth: .infinity, maxHeight: .infinity)\n      .background(Color.gray)\n      .ignoresSafeArea()\n  }\n}\n`;
}

async function setupProject(temp, files) {
  const sourceDir = join(temp, "Sources/CanvasSwiftUIFixture");
  const hostDir = join(temp, "SimulatorHost");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(hostDir, { recursive: true });
  for (const [name, bytes] of files) {
    if (name.startsWith("Fonts/")) {
      const path = join(temp, "Resources", name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    } else if (name.endsWith(".swift")) {
      const path = join(sourceDir, name.replace(/^_canvas\//u, ""));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }
  }
  await writeFile(join(sourceDir, "MobileFixture.swift"), hostFixtureSource());
  await writeFile(join(hostDir, "App.swift"), `import SwiftUI\n\n@main\nstruct CanvasTextEvidenceApp: App {\n  var body: some Scene { WindowGroup { MobileFixture() } }\n}\n`);
  await writeFile(join(hostDir, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundleDisplayName</key><string>Canvas Exact Font Evidence</string>\n<key>CFBundleIdentifier</key><string>com.penkra.canvas.qa.exactfont</string>\n<key>CFBundleName</key><string>Canvas Exact Font Evidence</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleShortVersionString</key><string>1.0</string>\n<key>CFBundleVersion</key><string>1</string>\n<key>LSRequiresIPhoneOS</key><true/>\n<key>UILaunchScreen</key><dict/>\n</dict></plist>\n`);
  await writeFile(join(temp, "project.yml"), `name: CanvasExactFontEvidence\noptions:\n  bundleIdPrefix: com.penkra.canvas.qa\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasExactFontEvidence:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources:\n      - Sources/CanvasSwiftUIFixture\n      - SimulatorHost/App.swift\n      - path: Resources/Fonts\n        buildPhase: resources\n    info:\n      path: SimulatorHost/Info.plist\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: com.penkra.canvas.qa.exactfont\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"\nschemes:\n  CanvasExactFontEvidence:\n    build:\n      targets:\n        CanvasExactFontEvidence: all\n`);
  await command("xcodegen", ["generate", "--spec", "project.yml"], { cwd: temp });
}

async function listBundleFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listBundleFiles(join(directory, entry.name), path));
    else files.push(path);
  }
  return files;
}

async function inspectBuiltFonts(appPath, catalog) {
  const plist = (await command("plutil", ["-convert", "xml1", "-o", "-", join(appPath, "Info.plist")])).stdout;
  const block = plist.match(/<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/u)?.[1] ?? "";
  const uiAppFonts = [...block.matchAll(/<string>([^<]+)<\/string>/gu)].map((match) => match[1]);
  const bundleFiles = await listBundleFiles(appPath);
  const fontHashes = {};
  for (const [key, face] of catalog) {
    const bundledPath = bundleFiles.find((path) => path.split("/").at(-1) === face.filename);
    const bundledBytes = bundledPath ? await readFile(join(appPath, bundledPath)) : null;
    const bundledSha256 = bundledBytes ? createHash("sha256").update(bundledBytes).digest("hex") : null;
    fontHashes[key] = { filename: face.filename, postscriptName: face.postscriptName, bundledPath, catalogSha256: face.filename.replace(/\.ttf$/u, ""), bundledSha256, matches: bundledSha256 === face.filename.replace(/\.ttf$/u, "") };
  }
  const missingFiles = Object.values(fontHashes).filter((font) => !font.bundledPath).map((font) => font.filename);
  const hashMismatches = Object.values(fontHashes).filter((font) => !font.matches).map((font) => font.filename);
  return { bundlePath: appPath, bundleFiles, uiAppFonts, fontHashes, missingFiles, hashMismatches, valid: !missingFiles.length && !hashMismatches.length, registrationUsesUIAppFonts: uiAppFonts.length > 0 };
}

function resultForLaunchFailure({ caseId, deviceId, contentSize, scale, referencePath, failureLogPath, exitCode }) {
  return buildUnmeasuredLaunchEntry({ caseId, deviceId, contentSize, scale, evidenceRoot: evidence, referencePath, failureLogPath, exitCode });
}

async function captureState(device, contentSize, temp, document) {
  const scale = SCALE_BY_DEVICE[device.key];
  const stateDir = join(evidence, "captures", device.key, contentSize);
  const referenceDir = join(evidence, "references", `${device.key}-${contentSize}`);
  await mkdir(stateDir, { recursive: true });
  await writeSelectedReferences(referenceDir, document, EXACT_CASE_IDS, scale);
  await command("xcrun", ["simctl", "ui", device.id, "content_size", contentSize]);
  const entries = [];
  for (const caseId of EXACT_CASE_IDS) {
    const fullPath = join(temp, `${device.key}-${contentSize}-${caseId}-full.png`);
    const capturePath = join(stateDir, `${caseId}.png`);
    const referencePath = join(referenceDir, `${caseId}.png`);
    const launch = await commandAllowFailure("xcrun", ["simctl", "launch", "--terminate-running-process", device.id, "com.penkra.canvas.qa.exactfont", "--canvas-case", caseId]);
    if (launch.code !== 0) {
      const failureLogPath = join(stateDir, `${caseId}.launch-failure.log`);
      await writeFile(failureLogPath, `${launch.stdout}\n${launch.stderr}`);
      const failed = resultForLaunchFailure({ caseId, deviceId: device.id, contentSize, scale, referencePath, failureLogPath, exitCode: launch.code });
      entries.push(failed);
      await writeFile(join(stateDir, `${caseId}.measurement.json`), `${JSON.stringify(failed, null, 2)}\n`);
      continue;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2500));
    await command("xcrun", ["simctl", "io", device.id, "screenshot", "--type=png", fullPath]);
    await command("sips", ["-c", String(Math.ceil(180 * scale)), String(Math.ceil(340 * scale)), fullPath, "--out", capturePath]);
    const measured = await measureCapture(referencePath, capturePath, scale);
    const baselinePath = join(baselineEvidence, "captures", device.key, contentSize, `${caseId}.png`);
    const baselineIdentity = await imageIdentity([baselinePath, capturePath]);
    const entry = { ...measured, caseId, deviceId: device.id, contentSize, scale, referencePath: evidenceRelativePath(evidence, referencePath), capturePath: evidenceRelativePath(evidence, capturePath), baselineCapturePath: portableRelative(evidence, baselinePath), baselineComparison: { byteIdentical: baselineIdentity.byteIdentical, pixelIdentical: baselineIdentity.pixelIdentical, sha256: baselineIdentity.sha256, pixelSha256: baselineIdentity.pixelSha256 } };
    entries.push(entry);
    await writeFile(join(stateDir, `${caseId}.measurement.json`), `${JSON.stringify(entry, null, 2)}\n`);
    await unlink(fullPath);
  }
  return entries;
}

function catalogMetadata(catalog) {
  return [...catalog].map(([key, face]) => ({ key, filename: face.filename, postscriptName: face.postscriptName, weight: face.weight, italic: face.italic }));
}

function rejection(fn) {
  try { fn(); return { status: "accepted", code: null, message: null }; }
  catch (error) { return { status: "rejected", code: error.code ?? null, message: error.message }; }
}

const document = buildTextDecorationDocument();
const sources = await readExactFontSources();
const fullIR = buildTextIR(CASES.map(({ id }) => id), document);
const rejectionEvidence = {
  full12Case: rejection(() => buildFontCatalog(fullIR, sources)),
  italicCases: Object.fromEntries(ITALIC_CASE_IDS.map((caseId) => [caseId, rejection(() => buildFontCatalog(buildTextIR([caseId], document), sources))])),
  mislabeledRegularUnderItalic: rejection(() => buildFontCatalog(buildTextIR(["case-05"], document), { "Inter:400:italic": sources["Inter:400"] })),
};
if (rejectionEvidence.full12Case.code !== "CANVAS_MOBILE_FONT_MISSING") throw new Error(`Full fixture did not reject missing italic face: ${JSON.stringify(rejectionEvidence.full12Case)}`);
for (const caseId of ITALIC_CASE_IDS) if (rejectionEvidence.italicCases[caseId].code !== "CANVAS_MOBILE_FONT_MISSING") throw new Error(`${caseId} did not reject missing exact face: ${JSON.stringify(rejectionEvidence.italicCases[caseId])}`);
if (rejectionEvidence.mislabeledRegularUnderItalic.code !== "CANVAS_MOBILE_FONT_MISMATCH") throw new Error(`Mislabeled italic face did not reject mismatch: ${JSON.stringify(rejectionEvidence.mislabeledRegularUnderItalic)}`);
const exactIR = buildTextIR(EXACT_CASE_IDS, document);
const catalog = buildFontCatalog(exactIR, sources);
const catalogEntries = catalogMetadata(catalog);
if (catalogEntries.length !== 2 || !catalogEntries.some((face) => face.key === "Inter:400:normal" && face.weight === 400 && !face.italic) || !catalogEntries.some((face) => face.key === "Inter:700:normal" && face.weight === 700 && !face.italic)) throw new Error(`Unexpected exact catalog: ${JSON.stringify(catalogEntries)}`);
rejectionEvidence.correctCatalog = { status: "accepted", entries: catalogEntries };
await mkdir(evidence, { recursive: true });
await writeFile(join(evidence, "fixture.json"), `${JSON.stringify({ ...document, selectedCaseIds: EXACT_CASE_IDS }, null, 2)}\n`);
await writeFile(join(evidence, "ir.json"), `${JSON.stringify(exactIR, null, 2)}\n`);
await writeFile(join(evidence, "catalog.json"), `${JSON.stringify(rejectionEvidence, null, 2)}\n`);
const files = exportExactFontFiles(exactIR, catalog);
for (const [name, value] of files) {
  const output = name.startsWith("Fonts/") ? join(evidence, name) : name.endsWith(".swift") ? join(evidence, "swift", name.replace(/^_canvas\//u, "")) : join(evidence, name);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
}
const registrationSources = EXACT_CASE_IDS.map((caseId) => ({ caseId, source: sourceNames[caseId], callsRegister: files.get(`${sourceNames[caseId]}.swift`)?.includes("CanvasFonts.register()") ?? false }));
await writeFile(join(evidence, "registration-sources.json"), `${JSON.stringify({ helper: files.has("_canvas/CanvasFonts.swift"), cases: registrationSources }, null, 2)}\n`);
if (!files.has("_canvas/CanvasFonts.swift") || registrationSources.some(({ callsRegister }) => !callsRegister)) throw new Error("Exact catalog export did not retain generated CanvasFonts registration helper/calls.");
const temp = await mkdtemp(join(tmpdir(), "canvas-luna-ios-text-font-catalog-"));
await setupProject(temp, files);
const derivedData = join(temp, "DerivedData");
const buildArgs = ["-project", "CanvasExactFontEvidence.xcodeproj", "-scheme", "CanvasExactFontEvidence", "-sdk", "iphonesimulator", "-configuration", "Debug", "-derivedDataPath", derivedData, "CODE_SIGNING_ALLOWED=NO", "build", "-jobs", "2"];
await writeFile(join(evidence, "xcodebuild-command.txt"), `xcodebuild ${buildArgs.join(" ")}\n`);
let buildExit = 0;
try { await command("xcodebuild", buildArgs, { cwd: temp }); }
catch (error) { buildExit = error.code ?? 1; commandLog.push({ command: ["xcodebuild", ...buildArgs].join(" "), exitCode: buildExit, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) }); }
await writeFile(join(evidence, "xcodebuild.log"), `${JSON.stringify(commandLog.at(-1), null, 2)}\n`);
if (buildExit !== 0) throw new Error(`xcodebuild failed with exit ${buildExit}; see ${join(evidence, "xcodebuild.log")}`);
const appPath = join(derivedData, "Build/Products/Debug-iphonesimulator/CanvasExactFontEvidence.app");
for (const device of devices) await command("xcrun", ["simctl", "install", device.id, appPath]);
const fontFacts = await inspectBuiltFonts(appPath, catalog);
await writeFile(join(evidence, "font-registration-facts.json"), `${JSON.stringify(fontFacts, null, 2)}\n`);
if (!fontFacts.valid) {
  const diagnostic = `Exact font registration validation failed before capture.\n${JSON.stringify(fontFacts, null, 2)}\n`;
  await writeFile(join(evidence, "font-registration-failure.log"), diagnostic);
  throw new Error(diagnostic);
}
const observedSizes = {};
for (const device of devices) observedSizes[device.key] = (await command("xcrun", ["simctl", "ui", device.id, "content_size"])).stdout.trim();
const entries = [];
try {
  for (const device of devices) for (const contentSize of device.sizes) entries.push(...await captureState(device, contentSize, temp, document));
} finally {
  for (const device of devices) await commandAllowFailure("xcrun", ["simctl", "ui", device.id, "content_size", observedSizes[device.key]]);
}
await writeFile(join(evidence, "measurements.json"), `${JSON.stringify({ package: "luna-ios-text-exact-font-catalog-20260906", worktree: process.cwd(), sourceCommit: (await command("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(), tempProject: temp, buildExit, observedContentSizes: observedSizes, fontFacts, entries }, null, 2)}\n`);
await writeFile(join(evidence, "commands.json"), `${JSON.stringify(commandLog.map(({ stdout, stderr, ...entry }) => entry), null, 2)}\n`);
const identitySummary = entries.filter(({ caseId }) => caseId === "case-01" || caseId === "case-06").length;
await writeFile(join(evidence, "README.md"), [
  "# iOS exact mobile font-catalog evidence",
  "",
  "This subtree uses the production mobile font catalog path for ten cases. Cases 05 and 09 are intentionally excluded from native capture because the catalog correctly rejects their missing exact italic face.",
  "",
  "- `catalog.json` records full-fixture, independent italic, mislabeled-face, and correct regular/bold catalog results.",
  "- Generated Swift and the generated `CanvasFonts.swift` registration helper are under `swift/`; emitted font bytes are under `Fonts/`.",
  "- `font-registration-facts.json` verifies built-app font filenames and SHA-256 bytes against the catalog. The host intentionally has no UIAppFonts bypass; generated initializers call `CanvasFonts.register()`.",
  "- `measurements.json` contains 30 case/device/content-size entries with evidence-relative paths, strict existing comparison tolerance, and baseline comparisons against `../font-registered/`.",
  "- Cases 01/05/06/09 identity was not treated as italic fidelity. This run captures no italic cases; any missing-face rejection remains explicit and no capability verdict was changed.",
  `- Observed content sizes were ${JSON.stringify(observedSizes)} and are restored in the capture cleanup finally block. ${identitySummary} identity-participating captures are retained per state.`,
  `- The temporary build project is retained at \`${temp}\`; \`xcodebuild-command.txt\` and \`xcodebuild.log\` preserve the exact compiler command/result.`,
  "",
  "This is evidence only. No mobile emitter, capability table, vendor font, or font asset was edited.",
  "",
].join("\n"));
console.log(JSON.stringify({ evidence, tempProject: temp, buildExit, entries: entries.length, statuses: Object.groupBy(entries, (entry) => entry.status), observedContentSizes: observedSizes, catalog: catalogEntries, rejections: rejectionEvidence }, null, 2));
