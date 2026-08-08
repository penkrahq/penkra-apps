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

function matches(source, value) {
  return source.split(value).length - 1;
}
