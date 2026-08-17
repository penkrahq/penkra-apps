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
