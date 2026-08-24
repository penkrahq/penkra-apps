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
  assert.match(surface, /recomputeLayoutAfterFonts: false/u);
  assert.match(surface, /layer: "scene"/u);
  assert.match(surface, /layer: "overlays"/u);
  assert.match(surface, /readyLayers < 2/u);
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

  assert.match(buildScript, /licenses\/Inter-OFL\.txt/u);
  assert.match(buildScript, /"lucide"/u);
  assert.match(notices, /CanvasKit WASM 0\.40\.0 under the BSD 3-Clause license/u);
  assert.match(notices, /Lucide 1\.31\.0 under the ISC license/u);
  assert.match(notices, /Phosphor Icons 2\.1\.1 push-pin vector under the MIT license/u);
  assert.match(notices, /Inter font files under the SIL Open Font License 1\.1/u);
  assert.match(interLicense, /SIL OPEN FONT LICENSE Version 1\.1/u);
});

function matches(source, value) {
  return source.split(value).length - 1;
}
