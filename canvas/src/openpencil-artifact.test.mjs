import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("pinned OpenPencil artifact has one core and CanvasKit singleton", async () => {
  const engine = await readFile(new URL("vendor/open-pencil/engine.mjs", root), "utf8");
  assert.equal(matches(engine, 'import CanvasKitInit from "canvaskit-wasm";'), 1);
  assert.equal(matches(engine, "async function getCanvasKit("), 1);
  assert.equal(matches(engine, "function createEditor("), 1);
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
