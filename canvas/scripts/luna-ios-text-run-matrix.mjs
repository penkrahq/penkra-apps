import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, cp, unlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { generateSwiftEvidence, CASES, readInterFonts } from "./luna-ios-text-fixture.mjs";
import { buildUnmeasuredLaunchEntry, evidenceRelativePath } from "./luna-ios-text-harness.mjs";
import { imageIdentity, measureCapture, SCALE_BY_DEVICE, writeReferences } from "./luna-ios-text-verify.mjs";

const runFile = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const evidence = resolve(root, "research/luna-ios-text-20260906");
const runEvidence = resolve(evidence, "font-registered");
const devices = [
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", sizes: ["large", "accessibility-extra-extra-large"] },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", sizes: ["large"] },
];
const commandLog = [];

async function command(command, args, options = {}) {
  const started = new Date().toISOString();
  const result = await runFile(command, args, { ...options, maxBuffer: 50 * 1024 * 1024 });
  commandLog.push({ command: [command, ...args].join(" "), exitCode: 0, started, finished: new Date().toISOString(), stdout: result.stdout, stderr: result.stderr });
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

async function setupProject(temp, sources, fonts) {
  const sourceDir = join(temp, "Sources/CanvasSwiftUIFixture");
  const hostDir = join(temp, "SimulatorHost");
  const fontDir = join(temp, "Resources/Fonts");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(hostDir, { recursive: true });
  await mkdir(fontDir, { recursive: true });
  for (const [relative, source] of Object.entries(sources)) {
    const path = join(sourceDir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
  }
  for (const [name, bytes] of Object.entries(fonts)) await writeFile(join(fontDir, name), bytes);
  await writeFile(join(hostDir, "App.swift"), `import SwiftUI\n\n@main\nstruct CanvasTextEvidenceApp: App {\n  var body: some Scene { WindowGroup { MobileFixture() } }\n}\n`);
  await writeFile(join(sourceDir, "MobileFixture.swift"), `import SwiftUI\n\npublic struct MobileFixture: View {\n  private let selectedId: String = {\n    let args = ProcessInfo.processInfo.arguments\n    guard let index = args.firstIndex(of: "--canvas-case"), args.indices.contains(index + 1) else { return "case-01" }\n    return args[index + 1]\n  }()\n\n  private var selected: AnyView {\n    switch selectedId {\n    case "case-01": AnyView(LunaIOSUnmarkedRegular())\n    case "case-02": AnyView(LunaIOSFullUnderline())\n    case "case-03": AnyView(LunaIOSFullStrikethrough())\n    case "case-04": AnyView(LunaIOSUnderlineAndStrikethrough())\n    case "case-05": AnyView(LunaIOSFullItalic())\n    case "case-06": AnyView(LunaIOSFullBold700())\n    case "case-07": AnyView(LunaIOSFirstSixUnderline())\n    case "case-08": AnyView(LunaIOSFirstSixStrikethrough())\n    case "case-09": AnyView(LunaIOSFirstSixItalic())\n    case "case-10": AnyView(LunaIOSFirstSixOrangeFill())\n    case "case-11": AnyView(LunaIOSFullLetterSpacing())\n    case "case-12": AnyView(LunaIOSFirstSixLetterSpacing())\n    default: AnyView(LunaIOSUnmarkedRegular())\n    }\n  }\n\n  public var body: some View {\n    ZStack { selected }\n      .frame(maxWidth: .infinity, maxHeight: .infinity)\n      .background(Color.gray)\n      .ignoresSafeArea()\n  }\n}\n`);
  await writeFile(join(hostDir, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>CFBundleDisplayName</key><string>Canvas Text Evidence</string>\n<key>CFBundleIdentifier</key><string>com.penkra.canvas.qa.text</string>\n<key>CFBundleName</key><string>Canvas Text Evidence</string>\n<key>CFBundlePackageType</key><string>APPL</string>\n<key>CFBundleShortVersionString</key><string>1.0</string>\n<key>CFBundleVersion</key><string>1</string>\n<key>LSRequiresIPhoneOS</key><true/>\n<key>UILaunchScreen</key><dict/>\n<key>UISupportedInterfaceOrientations</key><array><string>UIInterfaceOrientationPortrait</string></array>\n<key>UIAppFonts</key><array><string>Inter-Regular.ttf</string><string>Inter-Bold.ttf</string></array>\n</dict></plist>\n`);
  await writeFile(join(temp, "project.yml"), `name: CanvasTextEvidence\noptions:\n  bundleIdPrefix: com.penkra.canvas.qa\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasTextEvidence:\n    type: application\n    platform: iOS\n    deploymentTarget: "16.0"\n    sources:\n      - Sources/CanvasSwiftUIFixture\n      - SimulatorHost/App.swift\n      - path: Resources/Fonts\n        buildPhase: resources\n    info:\n      path: SimulatorHost/Info.plist\n      properties:\n        UIAppFonts:\n          - Inter-Regular.ttf\n          - Inter-Bold.ttf\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: com.penkra.canvas.qa.text\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: "1,2"\nschemes:\n  CanvasTextEvidence:\n    build:\n      targets:\n        CanvasTextEvidence: all\n`);
  await command("xcodegen", ["generate", "--spec", "project.yml"], { cwd: temp });
}

async function listBundleFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listBundleFiles(join(directory, entry.name), relativePath));
    else files.push(relativePath);
  }
  return files;
}

async function inspectFontBundle(appPath, installedDevices, expectedFonts) {
  const plistXml = (await command("plutil", ["-convert", "xml1", "-o", "-", join(appPath, "Info.plist")])).stdout;
  const uiAppFontsBlock = plistXml.match(/<key>UIAppFonts<\/key>\s*<array>([\s\S]*?)<\/array>/u)?.[1] ?? "";
  const uiAppFonts = [...uiAppFontsBlock.matchAll(/<string>([^<]+)<\/string>/gu)].map((match) => match[1]);
  const bundleFiles = await listBundleFiles(appPath);
  const bundledFontFiles = bundleFiles.filter((path) => /\.(?:ttf|otf)$/iu.test(path));
  const fontHashes = {};
  for (const [name, expectedBytes] of Object.entries(expectedFonts)) {
    const bundledPath = join(appPath, name);
    const bundledBytes = bundleFiles.includes(name) ? await readFile(bundledPath) : null;
    const vendoredSha256 = createHash("sha256").update(expectedBytes).digest("hex");
    const bundledSha256 = bundledBytes ? createHash("sha256").update(bundledBytes).digest("hex") : null;
    fontHashes[name] = { vendoredSha256, bundledSha256, matches: bundledSha256 === vendoredSha256 };
  }
  const requiredFonts = Object.keys(expectedFonts);
  const missingBundleFonts = requiredFonts.filter((font) => !bundleFiles.includes(font));
  const missingUIAppFonts = requiredFonts.filter((font) => !uiAppFonts.includes(font));
  const hashMismatches = requiredFonts.filter((font) => !fontHashes[font].matches);
  return {
    bundlePath: appPath,
    bundleIdentifier: plistXml.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/u)?.[1] ?? null,
    uiAppFonts,
    bundledFontFiles,
    uiAppFontsDeclared: uiAppFonts.length > 0,
    uiAppFontsAllPresent: requiredFonts.every((font) => uiAppFonts.includes(font)),
    requiredFonts,
    missingBundleFonts,
    missingUIAppFonts,
    fontHashes,
    valid: missingBundleFonts.length === 0 && missingUIAppFonts.length === 0 && hashMismatches.length === 0,
    installedDevices,
  };
}

async function capture(device, contentSize, temp, derivedData) {
  const scale = SCALE_BY_DEVICE[device.key];
  const stateDir = join(runEvidence, "captures", device.key, contentSize);
  const referenceDir = join(runEvidence, "references", `${device.key}-${contentSize}`);
  await mkdir(stateDir, { recursive: true });
  await mkdir(referenceDir, { recursive: true });
  await writeReferences(referenceDir, scale);
  await command("xcrun", ["simctl", "ui", device.id, "content_size", contentSize]);
  const results = [];
  for (const { id } of CASES) {
    const fullPath = join(temp, `${device.key}-${contentSize}-${id}-full.png`);
    const capturePath = join(stateDir, `${id}.png`);
    const referencePath = join(referenceDir, `${id}.png`);
    const launch = await commandAllowFailure("xcrun", ["simctl", "launch", "--terminate-running-process", device.id, "com.penkra.canvas.qa.text", "--canvas-case", id]);
    if (launch.code !== 0) {
      const failureLogPath = join(stateDir, `${id}.launch-failure.log`);
      await writeFile(failureLogPath, `${launch.stdout}\n${launch.stderr}`);
      const failedEntry = buildUnmeasuredLaunchEntry({ caseId: id, deviceId: device.id, contentSize, scale, evidenceRoot: runEvidence, referencePath, failureLogPath, exitCode: launch.code });
      results.push(failedEntry);
      await writeFile(join(stateDir, `${id}.measurement.json`), `${JSON.stringify(failedEntry, null, 2)}\n`);
      continue;
    }
    // simctl launch returns after process creation. Allow SwiftUI layout and
    // font registration to settle before taking the native capture.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await command("xcrun", ["simctl", "io", device.id, "screenshot", "--type=png", fullPath]);
    const expectedWidth = Math.ceil(340 * scale);
    const expectedHeight = Math.ceil(180 * scale);
    await command("sips", ["-c", String(expectedHeight), String(expectedWidth), fullPath, "--out", capturePath]);
    const measurement = await measureCapture(referencePath, capturePath, scale);
    const entry = { ...measurement, caseId: id, deviceId: device.id, contentSize, scale, referencePath: evidenceRelativePath(runEvidence, referencePath), capturePath: evidenceRelativePath(runEvidence, capturePath) };
    results.push(entry);
    await writeFile(join(stateDir, `${id}.measurement.json`), `${JSON.stringify(entry, null, 2)}\n`);
    // Keep only the per-frame native crop as evidence; full-device screenshots
    // are temporary owned artifacts and are not used for measurement.
    await unlink(fullPath);
  }
  const identityCaseIds = ["case-01", "case-05", "case-06", "case-09"];
  const identityEntries = identityCaseIds.map((id) => results.find((entry) => entry.caseId === id));
  const identityPaths = identityEntries.map((entry) => entry?.capturePath ? join(runEvidence, entry.capturePath) : null);
  const missingIdentityCases = identityEntries.filter((entry) => !entry?.capturePath).map((entry, index) => entry?.caseId ?? identityCaseIds[index]);
  const identity = missingIdentityCases.length
    ? { byteSizes: null, sha256: null, pixelDimensions: null, byteIdentical: false, pixelIdentical: false, status: "unmeasured", notes: `Identity check unmeasured because launch failed for ${missingIdentityCases.join(", ")}; no prior app screenshot was reused.` }
    : { ...await imageIdentity(identityPaths), status: undefined, notes: undefined };
  const identityGroups = (values) => {
    const groups = new Map();
    values.forEach((value, index) => groups.set(value, [...(groups.get(value) ?? []), identityCaseIds[index]]));
    return [...groups.values()].filter((group) => group.length > 1);
  };
  const byteIdentityGroups = missingIdentityCases.length ? [] : identityGroups(identity.sha256);
  const pixelIdentityGroups = missingIdentityCases.length ? [] : identityGroups(identity.pixelSha256);
  const identicalGroups = [...new Map([...byteIdentityGroups.map((group) => [group.join("\u0000"), { cases: group, kinds: ["byte"] }]), ...pixelIdentityGroups.map((group) => [group.join("\u0000"), { cases: group, kinds: ["pixel"] }])]).values()];
  for (const group of identicalGroups) {
    if (byteIdentityGroups.some((candidate) => candidate.join("\u0000") === group.cases.join("\u0000"))) group.kinds.push("byte");
    if (pixelIdentityGroups.some((candidate) => candidate.join("\u0000") === group.cases.join("\u0000"))) group.kinds.push("pixel");
    group.kinds = [...new Set(group.kinds)];
  }
  return {
    results,
    identity: {
      deviceId: device.id,
      contentSize,
      caseIds: identityCaseIds,
      paths: identityPaths.map((path) => path ? evidenceRelativePath(runEvidence, path) : null),
      ...identity,
      byteIdentityGroups,
      pixelIdentityGroups,
      identicalGroups,
      status: identity.status ?? (identicalGroups.length ? "missing-styling-evidence" : "distinct-native-output"),
      notes: identity.notes ?? (identicalGroups.length
        ? `Identical native output groups: ${identicalGroups.map(({ cases, kinds }) => `${cases.join("/")} (${kinds.join("+")})`).join(", ")}; this is missing styling evidence, not proof that the style visibly rendered.`
        : "Native hashes and pixels are not all identical; this identity check does not by itself establish style fidelity."),
    },
  };
}

const temp = await mkdtemp(join(tmpdir(), "canvas-luna-ios-text-"));
await mkdir(runEvidence, { recursive: true });
const generated = await generateSwiftEvidence(runEvidence);
const fonts = await readInterFonts();
await setupProject(temp, generated.sources, fonts);
const derivedData = join(temp, "DerivedData");
const buildArgs = ["-project", "CanvasTextEvidence.xcodeproj", "-scheme", "CanvasTextEvidence", "-sdk", "iphonesimulator", "-configuration", "Debug", "-derivedDataPath", derivedData, "CODE_SIGNING_ALLOWED=NO", "build", "-jobs", "2"];
await writeFile(join(runEvidence, "xcodebuild-command.txt"), `xcodebuild ${buildArgs.join(" ")}\n`);
let buildExit = 0;
try { await command("xcodebuild", buildArgs, { cwd: temp }); }
catch (error) {
  buildExit = error.code ?? 1;
  commandLog.push({ command: ["xcodebuild", ...buildArgs].join(" "), exitCode: buildExit, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) });
}
await writeFile(join(runEvidence, "xcodebuild.log"), JSON.stringify(commandLog.at(-1), null, 2) + "\n");
if (buildExit !== 0) throw new Error(`xcodebuild failed with exit ${buildExit}; see ${join(runEvidence, "xcodebuild.log")}`);
const appPath = join(derivedData, "Build/Products/Debug-iphonesimulator/CanvasTextEvidence.app");
for (const device of devices) await command("xcrun", ["simctl", "install", device.id, appPath]);
let fontBundleFacts;
try {
  fontBundleFacts = await inspectFontBundle(appPath, devices.map(({ id }) => id), fonts);
} catch (error) {
  await writeFile(join(runEvidence, "font-registration-failure.log"), String(error?.stack ?? error));
  throw error;
}
await writeFile(join(runEvidence, "font-registration-facts.json"), `${JSON.stringify(fontBundleFacts, null, 2)}\n`);
if (!fontBundleFacts.valid) {
  const diagnostic = `Font registration validation failed before capture.\n${JSON.stringify(fontBundleFacts, null, 2)}\n`;
  await writeFile(join(runEvidence, "font-registration-failure.log"), diagnostic);
  throw new Error(diagnostic);
}
const observedSizes = {};
for (const device of devices) observedSizes[device.key] = (await command("xcrun", ["simctl", "ui", device.id, "content_size"])).stdout.trim();
const allResults = [];
const identityChecks = [];
try {
  for (const device of devices) for (const contentSize of device.sizes) {
    const state = await capture(device, contentSize, temp, derivedData);
    allResults.push(...state.results);
    identityChecks.push(state.identity);
  }
} finally {
  for (const device of devices) await commandAllowFailure("xcrun", ["simctl", "ui", device.id, "content_size", observedSizes[device.key]]);
}
await writeFile(join(runEvidence, "measurements.json"), `${JSON.stringify({ package: "luna-ios-rich-text-decoration-20260906", worktree: process.cwd(), sourceCommit: (await command("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(), tempProject: temp, buildExit, observedContentSizes: observedSizes, fontBundleFacts, identityChecks, entries: allResults }, null, 2)}\n`);
await writeFile(join(runEvidence, "commands.json"), `${JSON.stringify(commandLog.map(({ stdout, stderr, ...entry }) => entry), null, 2)}\n`);
await writeFile(join(runEvidence, "README.md"), [
  "# iOS rich-text decoration evidence",
  "",
  "This directory is retained evidence for the twelve Canvas-authored text cases in `fixture.json`. Each case is a separate 340x180 frame selected by source ID through the temporary Swift host.",
  "",
  "- Generated Swift is under `swift/`; the source was produced by `exportSwiftUI(buildCapabilityVerificationIR(...))`.",
  "- Canvas references are under `references/`, and cropped settled native captures are under `captures/`.",
  "- The pre-font-registration 36-case baseline is preserved at `../baseline-pre-font-registration/` and is not used by these tests.",
  "- `measurements.json` contains all 36 case/device/content-size entries. Evidence paths are relative to this directory; `pass` and `mismatch` are distinct measured statuses, while `unmeasured` records a missing capture/reference limitation.",
  "- Comparison uses the existing 2-physical-pixel boundary exclusion and 2-channel-step tolerance. Registration is reported separately as the explicit center crop of the authored frame.",
  "- `identityChecks` records SHA-256, byte size, and decoded-pixel identity for cases 01, 05, 06, and 09 at every device/content-size state. Any identical output is explicitly `missing-styling-evidence`, not visibly rendered style evidence.",
  `- Observed content sizes were ${JSON.stringify(observedSizes)} and are restored in the capture cleanup finally block.`,
  `- Installed bundle font facts: UIAppFonts declared=${fontBundleFacts.uiAppFontsDeclared}, values=${JSON.stringify(fontBundleFacts.uiAppFonts)}, bundled font files=${JSON.stringify(fontBundleFacts.bundledFontFiles)}, all declared fonts present=${fontBundleFacts.uiAppFontsAllPresent}.`,
  `- Identity results: ${identityChecks.map(({ deviceId, contentSize, status, identicalGroups }) => `${deviceId}/${contentSize}=${status}; groups=${identicalGroups.map(({ cases, kinds }) => `${cases.join("/")} (${kinds.join("+")})`).join(", ") || "none"}`).join("; ")}`,
  `- The temporary build project is retained at \`${temp}\`; \`xcodebuild-command.txt\` and \`xcodebuild.log\` preserve the exact compiler command and result.`,
  "",
  "This is decoration/style evidence only. No capability table or verdict was changed.",
  "",
].join("\n"));
console.log(JSON.stringify({ evidence: runEvidence, tempProject: temp, buildExit, entries: allResults.length, statuses: Object.groupBy(allResults, (entry) => entry.status), observedContentSizes: observedSizes, identityChecks, fontBundleFacts }, null, 2));
