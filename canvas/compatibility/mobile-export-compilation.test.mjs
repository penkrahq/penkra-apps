import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";

const document = {
  version: "2.17",
  module: "mobile",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "screen", type: "frame", role: "ios", name: "Generated Screen",
    width: 390, height: 844, children: [
      { id: "title", type: "text", x: 24, y: 40, width: 300, height: 48,
        content: "Canvas", fontSize: 32, paragraphs: [{ from: 0, to: 6, headingLevel: 1 }],
        marks: [], description: "Screen title" },
      { id: "card", type: "rectangle", x: 24, y: 112, width: 342, height: 160,
        fill: "#123456", description: "Information card" },
    ],
  }],
};
const candidatePaths = [
  "root.axes", "nodes.frame", "nodes.text", "nodes.rectangle",
  "properties.accessibility.description", "properties.fill", "properties.fill.solid",
  "properties.content", "properties.fontSize", "properties.marks", "properties.paragraphs",
  "properties.text.paragraph.headingLevel", "properties.text.run.fontSize",
];

test("SwiftUI exporter output compiles in the pinned fixture", { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-swiftui-"));
  try {
    await cp(new URL("./mobile-fixtures/swiftui/", import.meta.url), root, { recursive: true });
    await rm(join(root, ".build"), { recursive: true, force: true });
    const files = exportSwiftUI(buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, candidatePaths));
    for (const [relative, source] of files) {
      const target = join(root, "Sources/CanvasSwiftUIFixture", relative);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, source);
    }
    const result = await run("swift", ["test"], root);
    assert.equal(result.code, 0, result.output);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Compose exporter output assembles in the pinned fixture", { timeout: 180_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-compose-"));
  try {
    await cp(new URL("./mobile-fixtures/compose/", import.meta.url), root, { recursive: true });
    await rm(join(root, ".gradle"), { recursive: true, force: true });
    await rm(join(root, "app/build"), { recursive: true, force: true });
    const android = structuredClone(document); android.children[0].role = "android";
    const files = exportCompose(buildCapabilityVerificationIR(android, { role: "android", frames: ["screen"] }, candidatePaths));
    const sourceRoot = join(root, "app/src/main/java/generated/canvas");
    await mkdir(sourceRoot, { recursive: true });
    for (const [relative, source] of files) await writeFile(join(sourceRoot, relative.replace(/^_canvas\//u, "")), source);
    const result = await run("./gradlew", ["--no-daemon", ":app:assembleDebug"], root);
    assert.equal(result.code, 0, result.output);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolve({ code, output }));
  });
}
