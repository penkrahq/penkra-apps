import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { capabilityPathInventory } from "../src/canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";
import { mobileFontFixture, mobileFixtureFontNames } from "../compatibility/mobile-font-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(join(tmpdir(), "canvas-font-delivery-"));
const fontNames = mobileFixtureFontNames;
const fonts = Object.fromEntries(await Promise.all(Object.entries(fontNames).map(async ([weight, name]) => [`Inter:${weight}`, await readFile(join(root, `vendor/open-pencil/fonts/Inter-${name}.ttf`))])));
const document = mobileFontFixture({ sizes: process.argv.includes("--sizes"), mixedSizes: process.argv.includes("--mixed-sizes") });
async function write(path, data) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data, { flag: "wx" }); }

const swiftRoot = join(target, "ios");
const swift = exportSwiftUI(buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, capabilityPathInventory()), { fonts });
for (const [path, data] of swift) await write(join(swiftRoot, "Sources", path), data);
await write(join(swiftRoot, "Sources/App.swift"), "import SwiftUI\n@main struct FontDeliveryApp: App { var body: some Scene { WindowGroup { FontScreen() } } }\n");
await write(join(swiftRoot, "project.yml"), "name: CanvasFontDelivery\nsettings:\n  base:\n    SWIFT_VERSION: '6.0'\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  CanvasFontDelivery:\n    type: application\n    platform: iOS\n    deploymentTarget: '16.0'\n    sources:\n      - path: Sources\n        excludes: [Fonts, FONT-INTEGRATION.md]\n      - path: Sources/Fonts\n        buildPhase: resources\n    settings:\n      base:\n        GENERATE_INFOPLIST_FILE: YES\n        PRODUCT_BUNDLE_IDENTIFIER: com.penkra.canvas.qa.fonts\n        INFOPLIST_KEY_UILaunchScreen_Generation: YES\n        TARGETED_DEVICE_FAMILY: '1,2'\n");

const androidRoot = join(target, "android");
await cp(join(root, "compatibility/mobile-fixtures/compose"), androidRoot, { recursive: true, filter: (path) => ![".gradle", "build", "generated", "GeneratedCanvas.kt", "MainActivity.kt"].includes(basename(path)) });
const gradlePath = join(androidRoot, "app/build.gradle.kts");
const gradle = await readFile(gradlePath, "utf8");
await writeFile(gradlePath, gradle.replace('applicationId = "com.penkra.canvas.fixture"', 'applicationId = "com.penkra.canvas.qa.fonts"'));
document.children[0].role = "android";
const compose = exportCompose(buildCapabilityVerificationIR(document, { role: "android", frames: ["screen"] }, capabilityPathInventory()), { fonts });
for (const [path, data] of compose) {
  if (path.startsWith("assets/")) await write(join(androidRoot, "app/src/main", path), data);
  else if (path.endsWith(".kt")) await write(join(androidRoot, "app/src/main/java/generated/canvas", basename(path)), data);
}
await write(join(androidRoot, "app/src/main/java/com/penkra/canvas/fixture/MainActivity.kt"), "package com.penkra.canvas.fixture\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport generated.canvas.FontScreen\nclass MainActivity: ComponentActivity() { override fun onCreate(state: Bundle?) { super.onCreate(state); setContent { FontScreen() } } }\n");
console.log(JSON.stringify({ root: target, ios: swiftRoot, android: androidRoot }));
