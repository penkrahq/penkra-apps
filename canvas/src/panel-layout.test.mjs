import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("hidden desktop panels collapse their grid tracks", async () => {
  const styles = await readFile(new URL("styles.css", root), "utf8");

  assert.match(styles, /\.editor-body\.layers-closed\.inspector-open\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) 286px;/u);
  assert.match(styles, /\.editor-body\.layers-open\.inspector-closed\s*\{\s*grid-template-columns:\s*238px minmax\(0, 1fr\);/u);
  assert.match(styles, /\.editor-body\.layers-closed\.inspector-closed\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/u);
  const desktopMedia = styles.indexOf("@media (min-width: 960px)");
  const tabletMedia = styles.indexOf("@media (max-width: 959px)");
  const closedTracks = styles.indexOf(".editor-body.layers-closed.inspector-open");
  assert.ok(desktopMedia < closedTracks && closedTracks < tabletMedia);
});

test("panel visibility classes update without rebuilding the editor", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.match(app, /state\.layersOpen \? "layers-open" : "layers-closed"/u);
  assert.match(app, /state\.inspectorOpen \? "inspector-open" : "inspector-closed"/u);
  assert.match(app, /body\.classList\.remove\([^\n]*"layers-open"[^\n]*"inspector-closed"/u);
});

test("documents open with layers and inspector collapsed", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.match(app, /activePanel: null,\s+layersOpen: false,\s+inspectorOpen: false,/u);
  assert.match(app, /function closeDocument\(\)[\s\S]*?collapseEditorPanels\(\);/u);
  assert.match(app, /function collapseEditorPanels\(\)\s*\{\s*state\.activePanel = null;\s*state\.layersOpen = false;\s*state\.inspectorOpen = false;/u);
  assert.match(app, /state\.documentUnsubscribe = await performanceMonitor\.measureAsync\([\s\S]*?collapseEditorPanels\(\);\s*state\.loading = false;/u);
});

test("closed layers do not retain or rebuild the document tree", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.match(app, /state\.layersOpen \? renderLayersPanelContent\(layerNodes\) : ""/u);
  assert.match(app, /function renderLayersTree\(\)[\s\S]*?if \(!state\.layersOpen\) \{\s*scroll\.replaceChildren\(\);\s*return;/u);
  assert.match(app, /renderLayersPanelContent\(currentVisibleLayerNodes\(\)\)/u);
  assert.match(app, /if \(panel === "layers" && !wasOpen\) \{\s*renderLayersTree\(\);\s*scrollSelectedLayerIntoView\(\);/u);
});

test("Layers expands and reveals the exact graph path selected on canvas", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.match(app, /canvasSceneLayerAncestorIds\(graph, pageId, nodeId\)/u);
  assert.match(app, /if \(expandSelectedLayerAncestors\(nodeId\)\) renderLayersTree\(\);/u);
  assert.match(app, /scrollIntoView\(\{ block: "nearest" \}\)/u);
  assert.match(app, /data-action="toggle-layer"/u);
});

test("selection remains an internal UI concern without public tab handlers", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.doesNotMatch(app, /runtime\.tab\.handle\("(?:selection\.set|viewport\.focus|performance\.snapshot)"/u);
  assert.match(app, /function selectNode\(nodeId, options = \{\}\)[\s\S]*?editor\?\.graph\.getNode\(nodeId\)\) editor\.select\(\[nodeId\]\);[\s\S]*?renderSelection\(\);/u);
});

test("node shortcuts run from non-text controls without replacing native text copy", async () => {
  const app = await readFile(new URL("./app.mjs", import.meta.url), "utf8");
  const inputGuard = app.indexOf("target instanceof HTMLInputElement");
  const copyShortcut = app.indexOf('command && event.key.toLowerCase() === "c"');
  const controlGuard = app.indexOf('target.closest("button, select, a[href]")');

  assert.ok(inputGuard >= 0 && inputGuard < copyShortcut);
  assert.ok(copyShortcut < controlGuard);
});

test("editor undo explicitly persists nodes restored to the selected graph", async () => {
  const source = await readFile(new URL("app.mjs", import.meta.url), "utf8");
  assert.match(source, /editor\.undoAction\(\);\s*queueRestoredSelectedNodes\(state\.engineSurface\)/u);
  assert.match(source, /if \(existing\.has\(nodeId\)\) continue;/u);
  assert.match(source, /state\.deletedNodeSnapshots\.set\(mutation\.nodeId/u);
  assert.match(source, /const node = deleted\?\.node \?\? \(sceneNode && sceneNodeToPenNode\(sceneNode\)\)/u);
  assert.match(source, /queueEngineMutations\(state\.document\.id, surface, mutations, \{ prepend: true \}\)/u);
});

test("hidden tabs mount the editor without waiting for a paint frame", async () => {
  const app = await readFile(new URL("src/app.mjs", root), "utf8");

  assert.match(app, /requestAnimationFrame === "function" && document\.visibilityState !== "hidden"/u);
  assert.match(app, /requestAnimationFrame\(scheduleAfterPaint\);\s*\} else \{\s*scheduleAfterPaint\(\);/u);
});
