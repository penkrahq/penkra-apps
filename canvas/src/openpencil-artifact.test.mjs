import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("owned engine artifact has one core and CanvasKit singleton", async () => {
  const engine = await readFile(new URL("vendor/open-pencil/engine.source.mjs", root), "utf8");
  const surface = await readFile(new URL("src/openpencil-surface.mjs", root), "utf8");
  const provenance = JSON.parse(await readFile(
    new URL("vendor/open-pencil/PROVENANCE.json", root),
    "utf8",
  ));

  assert.equal(matches(engine, 'import CanvasKitInit from "canvaskit-wasm";'), 1);
  assert.equal(matches(engine, "async function getCanvasKit("), 1);
  assert.equal(matches(engine, "function createEditor("), 1);
  assert.equal(createHash("sha256").update(engine).digest("hex"), provenance.sourceEngineSha256);
  assert.doesNotMatch(engine, /\bnew Function\s*\(|\bFunction\s*\(\s*["'`]return this/u);
  assert.match(engine, /function createCanvasSceneGraph\(/u);
  assert.doesNotMatch(engine, /function parsePenFile\(/u);
  assert.match(engine, /MAX_RETAINED_SCENE_NODES = 1e4/u);
  assert.match(engine, /function prepareSubtreeCullBounds\(/u);
  assert.match(engine, /onPerformance\?\.\("engine\.render-first"/u);
  assert.match(engine, /onPerformance\?\.\("engine\.render-ready"/u);
  assert.match(engine, /textarea\.setAttribute\("aria-label", [^)]+\)/u);
  assert.doesNotMatch(engine, /textarea\.setAttribute\("aria-hidden", "true"\)/u);
  assert.match(engine, /while \(hit\.parentId && hit\.parentId !== scope\)/u);
  assert.match(engine, /return editor\.graph\.hitTest\(cx, cy, containerId\)/u);
  assert.match(surface, /createLayeredSurfaceReadiness/u);
  assert.match(surface, /useTextEdit\(overlayCanvasRef, editor\)/u);
  assert.equal(provenance.exports.includes("createCanvasSceneGraph"), true);
  assert.equal(provenance.exports.includes("parsePenFile"), false);
});

test("the pinned CanvasKit build carries ICU instead of requiring client ICU", async () => {
  const { getCanvasKit } = await import("../vendor/open-pencil/engine.source.mjs");
  const canvasKit = await getCanvasKit();
  assert.equal(canvasKit.ParagraphBuilder.RequiresClientICU(), false);
  const wasm = await readFile(new URL("node_modules/canvaskit-wasm/bin/canvaskit.wasm", root));
  assert.ok(wasm.includes(Buffer.from("icudt74l")), "CanvasKit WASM must retain the pinned ICU 74 data symbol");
});

test("published OpenPencil packages and expr-eval are outside the dependency graph", async () => {
  const packageJson = await readFile(new URL("package.json", root), "utf8");
  const lockfile = await readFile(new URL("bun.lock", root), "utf8");
  const engine = await readFile(new URL("vendor/open-pencil/engine.source.mjs", root), "utf8");
  assert.doesNotMatch(`${packageJson}\n${lockfile}`, /@open-pencil\/(?:core|vue)|expr-eval/u);
  assert.doesNotMatch(engine, /(?:from|require\()["']expr-eval/u);
});

test("redistributed rendering assets package their license artifacts", async () => {
  const buildScript = await readFile(new URL("scripts/build.mjs", root), "utf8");
  const notices = await readFile(new URL("THIRD_PARTY_NOTICES.md", root), "utf8");
  const interLicense = await readFile(new URL("licenses/Inter-OFL.txt", root), "utf8");
  const jetBrainsLicense = await readFile(
    new URL("node_modules/@fontsource/jetbrains-mono/LICENSE", root),
    "utf8",
  );

  assert.match(buildScript, /licenses\/Inter-OFL\.txt/u);
  assert.match(buildScript, /JetBrains-Mono-OFL\.txt/u);
  assert.match(buildScript, /"lucide"/u);
  assert.match(buildScript, /phosphor-icons-LICENSE\.txt/u);
  assert.match(buildScript, /material-symbols-LICENSE\.txt/u);
  assert.ok(notices.trim().length > 0);
  assert.ok(interLicense.trim().length > 0);
  assert.ok(jetBrainsLicense.trim().length > 0);
});

function matches(source, value) {
  return source.split(value).length - 1;
}
