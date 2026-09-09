import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";

const fonts = { "Inter:400": await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url)) };

const document = {
  version: "2.17",
  module: "mobile",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "screen", type: "frame", role: "ios", name: "Generated Screen",
    width: 390, height: 844, children: [
      { id: "title", type: "text", x: 24, y: 40, width: 300, height: 48,
        content: "Canvas", fontSize: 28.25, paragraphs: [{ from: 0, to: 6, headingLevel: 1 }],
        marks: [{ type: "fontSize", from: 3, to: 6, value: 18.5 }], description: "Screen title" },
      { id: "card", type: "rectangle", x: 24, y: 112, width: 342, height: 160,
        fill: "#123456", description: "Information card" },
      { id: "line", type: "line", x: 30, y: 300, width: 120, height: 40,
        stroke: { fill: "#123456", width: 5, cap: "round", join: "bevel", dash: [8, 4] } },
      { id: "turned", type: "rectangle", x: 180, y: 300, width: 90, height: 60,
        fill: "#abcdef", rotation: 25, flipX: true, stroke: { fill: "#102030", width: 4, align: "inside" } },
      { id: "angular", type: "ellipse", x: 30, y: 390, width: 120, height: 90,
        fill: { type: "gradient", gradientType: "angular", center: { x: 0.4, y: 0.6 }, rotation: 35,
          colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] } },
      { id: "clip", type: "frame", x: 180, y: 390, width: 100, height: 80, overflow: "clip", fill: "#ffffff",
        children: [{ id: "overflow", type: "rectangle", x: 60, y: 10, width: 70, height: 40, fill: "#654321" }] },
    ],
  }],
};
const candidatePaths = [
  "root.axes", "nodes.frame", "nodes.text", "nodes.rectangle",
  "properties.accessibility.description", "properties.fill", "properties.fill.solid",
  "properties.content", "properties.fontSize", "properties.marks", "properties.paragraphs",
  "properties.text.paragraph.headingLevel", "properties.text.run.fontSize",
  "nodes.line", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.align",
  "properties.rotation", "properties.flipX", "properties.fill.gradient.angular", "properties.clip", "properties.overflow",
];

test("SwiftUI exporter output compiles in the pinned fixture", { timeout: 240_000 }, async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-swiftui-"));
  try {
    await cp(new URL("./mobile-fixtures/swiftui/", import.meta.url), root, { recursive: true, filter: fixtureSource });
    const files = exportSwiftUI(buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, candidatePaths));
    for (const [relative, source] of files) {
      const target = join(root, "Sources/CanvasSwiftUIFixture", relative.replace(/^_canvas\//u, ""));
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, source);
    }
    await writeFile(join(root, "Tests/CanvasSwiftUIFixtureTests/CurrentExportTests.swift"), `import XCTest\n@testable import CanvasSwiftUIFixture\nfinal class CurrentExportTests: XCTestCase {\n  func testCurrentExportConstructs() async {\n    await MainActor.run { _ = GeneratedScreen() }\n  }\n}\n`);
    const result = await run("swift", ["test", "--jobs", "2"], root, context.signal);
    assert.equal(result.code, 0, result.output);
    const bundled = exportSwiftUI(buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, candidatePaths), { fonts });
    for (const [relative, source] of bundled) if (relative.endsWith(".swift")) {
      await writeFile(join(root, "Sources/CanvasSwiftUIFixture", relative.replace(/^_canvas\//u, "")), source);
    }
    const fontBuild = await run("swift", ["build", "--jobs", "2"], root, context.signal);
    assert.equal(fontBuild.code, 0, fontBuild.output);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Compose exporter output assembles in the pinned fixture", { timeout: 180_000 }, async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-compose-"));
  try {
    await cp(new URL("./mobile-fixtures/compose/", import.meta.url), root, { recursive: true, filter: fixtureSource });
    const android = structuredClone(document); android.children[0].role = "android";
    const files = exportCompose(buildCapabilityVerificationIR(android, { role: "android", frames: ["screen"] }, candidatePaths), { fonts });
    const sourceRoot = join(root, "app/src/main/java/generated/canvas");
    await mkdir(sourceRoot, { recursive: true });
    for (const [relative, source] of files) {
      const target = relative.startsWith("assets/") ? join(root, "app/src/main", relative) : relative.endsWith(".kt") ? join(sourceRoot, relative.replace(/^_canvas\//u, "")) : null;
      if (!target) continue;
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, source);
    }
    const result = await run("./gradlew", ["--no-daemon", "--max-workers", "2", ":app:assembleDebug"], root, context.signal);
    assert.equal(result.code, 0, result.output);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fixtureSource(path) { return ![".build", ".gradle", "build"].includes(basename(path)); }

function run(command, args, cwd, signal) {
  return new Promise((resolve) => {
    const started = performance.now();
    const label = [command, ...args].join(" ");
    console.error(`[mobile compile] starting ${label}`);
    const child = spawn(command, args, { cwd, env: process.env, signal });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => {
      output += `\n${error.message}`;
      console.error(`[mobile compile] ${label}: ${error.message}\n${output}`);
    });
    child.on("close", (code) => {
      console.error(`[mobile compile] ${label}: exit ${code}, ${Math.round(performance.now() - started)}ms`);
      resolve({ code, output });
    });
  });
}
