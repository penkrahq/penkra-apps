import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("pinned OpenPencil artifact has one core and CanvasKit singleton", async () => {
  const engine = await readFile(new URL("vendor/open-pencil/engine.mjs", root), "utf8");
  const surface = await readFile(new URL("src/openpencil-surface.mjs", root), "utf8");
  const provenance = JSON.parse(await readFile(
    new URL("vendor/open-pencil/PROVENANCE.json", root),
    "utf8",
  ));
  assert.equal(matches(engine, 'import CanvasKitInit from "canvaskit-wasm";'), 1);
  assert.equal(matches(engine, "async function getCanvasKit("), 1);
  assert.equal(matches(engine, "function createEditor("), 1);
  assert.doesNotMatch(engine, /\bnew Function\s*\(|\bFunction\s*\(\s*["'`]return this/u);
  assert.equal(createHash("sha256").update(engine).digest("hex"), provenance.engineSha256);
  assert.deepEqual(provenance.localPatches, [
    "Map Pencil path vertices and tangents through an explicit viewBox before rendering.",
    "Apply Pencil color alpha exactly once in CanvasKit while preserving combined alpha in SVG export.",
    "Honor Pencil sizing fallbacks, padding shorthands, flex text growth, and instrument optional post-font layout.",
    "Keep fill-less Pencil frames transparent instead of inheriting the scene graph's opaque default.",
    "Interpret Kiwi schemas without dynamic JavaScript evaluation so the engine obeys the App CSP.",
    "Render large scenes through cached descendant bounds and bounded subpixel detail culling instead of walking or recording every expanded node at overview zoom.",
    "Report first-render, font-loading, post-font layout, and ready-render timings through the Canvas lifecycle callback.",
    "Allow Pencil surfaces with authoritative stored geometry to skip the expensive post-font whole-graph layout, matching the upstream Canvas lifecycle.",
    "Accept an already-parsed Pencil document so Canvas avoids a redundant large-scene JSON round trip.",
    "Expose the upstream font manager so Canvas can configure host-mediated providers and a persistent downloaded-face cache.",
    "Relayout deleted-node parents only when the parent actually owns an auto-layout flow.",
    "Map Pencil 2.17 linear, radial, and angular gradients to native scene gradient paints.",
    "Render semantic Pencil icon nodes through provider geometry without changing their document type.",
    "Honor numeric-string font weights, text styling, space-around layout, polygons, groups, and blur effects.",
    "Preserve and render every supported Pencil stroke fill instead of selecting the first fill.",
    "Leave unsupported Pencil node and fill types visually empty instead of approximating them with generic frames or colors.",
    "Honor supported Pencil fill blend modes and path fill rules while leaving unsupported blend modes visually empty.",
    "Represent successfully evaluated Pencil script nodes as transparent transient frames containing derived children.",
    "Register imported Pencil library components outside the visible page while retaining them for instance resolution.",
    "Render multi-opacity semantic icon layers as separate vector regions without flattening their provider geometry.",
    "Render weighted Material Symbols icon nodes through bundled official variable fonts after exact catalog validation.",
    "Apply inside-aligned Pencil strokes as Yoga borders when layoutIncludeStroke is enabled.",
    "Render Pencil Linear Burn and Linear Dodge through exact CanvasKit blend implementations.",
    "Execute Pencil shader fills in a bounded WebGL 1.0 runtime with uniforms, time, mouse, SDF, and backdrop bindings.",
    "Render Pencil mesh gradients from their exact point grid and Bezier handles with adaptive Coons-patch tessellation.",
    "Represent Pencil note, context, and prompt nodes as locked transient visuals backed by bundled JetBrains Mono faces.",
    "Draw Pencil slot semantics without adding persistent stroke data to component or instance nodes.",
    "Render Pencil gradient strokes and stroke-paint blend modes without flattening them into solid strokes.",
    "Map Pencil line nodes to native line geometry instead of treating them as generic paths.",
    "Register document-declared font resources in the shared CanvasKit and browser font providers.",
    "Expose the renderer and descendant visual-bounds primitives required for Pencil-compatible headless screenshots.",
    "Resolve slash-separated component descendant overrides through exact cloned-component identity chains and regenerate overridden semantic icons.",
    "Invalidate overridden text metrics before intrinsic layout and coordinate one exact-font layout before revealing the layered canvas.",
    "Measure auto-width Pencil text intrinsically after fonts resolve so parent constraints cannot turn instance text overrides into wrapped multi-line text.",
    "Grow an instance with omitted width around descendant auto-width text overrides while preserving explicit instance and fixed-width text sizing.",
    "Render every visible top-level Pencil frame name as editor chrome without adding document text nodes.",
  ]);
  assert.match(engine, /MAX_RETAINED_SCENE_NODES = 1e4/u);
  assert.match(engine, /setScenePictureMode\(hasVolatileOverlays \? "volatile" : "direct", cacheMissReason\)/u);
  assert.match(engine, /cacheMissReason = retainFullScene \? .* : "large-scene"/u);
  assert.match(engine, /layer === "scene" && retainFullScene && !hasVolatileOverlays/u);
  assert.match(engine, /function prepareSubtreeCullBounds\(/u);
  assert.match(engine, /const subtreeBounds = r4\.subtreeCullBounds\.get\(node\.id\)/u);
  assert.match(engine, /r4\.zoom >= 0\.25/u);
  assert.match(engine, /function shouldRenderSubtreeDetail\(/u);
  assert.match(engine, /screenArea \/ descendantCount < 0\.75/u);
  assert.match(engine, /r4\.zoom < 0\.1 \? 6 : 2/u);
  assert.match(engine, /subtreeNodeCounts = new Map/u);
  assert.match(engine, /onPerformance\?\.\("engine\.fonts"/u);
  assert.match(engine, /onPerformance\?\.\("engine\.font-layout"/u);
  assert.match(engine, /recomputeLayoutAfterFonts !== false/u);
  assert.equal(surface.match(/recomputeLayoutAfterFonts: false/gu)?.length, 2);
  assert.doesNotMatch(surface, /recomputeLayoutAfterFonts: true/u);
  assert.match(surface, /for \(const page of editor\.graph\.getPages\(\)\) computeAllLayouts\(editor\.graph, page\.id\)/u);
  assert.match(surface, /surfaceReady\.value = true/u);
  assert.match(surface, /layer: "scene"/u);
  assert.match(surface, /layer: "overlays"/u);
  assert.match(engine, /function drawFrameTitles\(/u);
  assert.match(engine, /labelCache\.getFrames\(graph4, r4\.worldViewport\)/u);
  assert.match(surface, /createLayeredSurfaceReadiness/u);
  assert.match(engine, /onPerformance\?\.\("engine\.render-first"/u);
  assert.match(engine, /onPerformance\?\.\("engine\.render-ready"/u);
  assert.match(engine, /typeof json === "string" \? JSON\.parse\(json\) : json/u);
});

test("published OpenPencil packages and expr-eval are outside the dependency graph", async () => {
  const packageJson = await readFile(new URL("package.json", root), "utf8");
  const lockfile = await readFile(new URL("bun.lock", root), "utf8");
  const engine = await readFile(new URL("vendor/open-pencil/engine.mjs", root), "utf8");
  assert.doesNotMatch(`${packageJson}\n${lockfile}`, /@open-pencil\/(?:core|vue)|expr-eval/u);
  assert.doesNotMatch(engine, /(?:from|require\()["']expr-eval/u);
});

test("redistributed rendering assets retain their license notices", async () => {
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
  assert.match(notices, /CanvasKit WASM 0\.40\.0 under the BSD 3-Clause license/u);
  assert.match(notices, /Lucide 1\.31\.0 under the ISC license/u);
  assert.match(notices, /Phosphor icon catalog under the MIT license/u);
  assert.match(notices, /Material Symbols icon catalog and variable font files under the Apache License 2\.0/u);
  assert.match(notices, /Inter font files under the SIL Open Font License 1\.1/u);
  assert.match(notices, /JetBrains Mono font files under the SIL Open Font License 1\.1/u);
  assert.match(interLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(jetBrainsLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);
});

function matches(source, value) {
  return source.split(value).length - 1;
}
