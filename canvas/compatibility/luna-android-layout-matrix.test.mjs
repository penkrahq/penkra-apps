import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportCompose } from "../src/exporters/mobile.mjs";
import {
  CASE_IDS, DENSITIES, FONT_SCALES, buildCase,
} from "../scripts/luna-android-layout-generate.mjs";

const evidence = new URL("../research/luna-android-layout-20260906/", import.meta.url);

test("Android layout package builds all twelve cases from resolved Canvas graph bounds", () => {
  assert.equal(CASE_IDS.length, 12);
  for (const caseId of CASE_IDS) {
    const built = buildCase(caseId);
    assert.equal(built.output.width, 340);
    assert.equal(built.output.height, 300);
    assert.equal(Object.keys(built.expectedBounds).length, built.output.nodes.filter((node) => node.type !== "frame").length);
    for (const bounds of Object.values(built.expectedBounds)) {
      assert.ok(bounds.x >= 0 && bounds.y >= 0);
      assert.ok(bounds.x + bounds.width <= 340 && bounds.y + bounds.height <= 300);
      assert.ok(Number.isFinite(bounds.x + bounds.y + bounds.width + bounds.height));
    }
  }
});

test("Compose verification source retains the authorized grid lowering and absolute overlay lowering", () => {
  const grid = exportCompose(buildCase("10").ir).get("MobileFixture.kt");
  assert.match(grid, /wrapContentSize\(androidx\.compose\.ui\.Alignment\.TopStart\)\.size\(96\.dp, 96\.dp\)/u);
  const ordinaryGrid = exportCompose(buildCase("09").ir).get("MobileFixture.kt");
  assert.match(ordinaryGrid, /LazyVerticalGrid\(columns = GridCells\.Fixed\(2\), modifier = Modifier\.offset\(10\.dp, 50\.dp\)\.size\(320\.dp, 200\.dp\)/u);
  const absolute = exportCompose(buildCase("12").ir).get("MobileFixture.kt");
  assert.match(absolute, /Row\(modifier = Modifier,/u);
  assert.match(absolute, /offset\(180\.dp, 70\.dp\)\.size\(40\.dp, 30\.dp\)/u);
  assert.doesNotMatch(absolute, /absolute-child.*Row/u);
});

test("retained Android measurement report accounts for all 48 captures and tests structured measurements", async () => {
  const rows = JSON.parse(await readFile(new URL("measurements.json", evidence), "utf8"));
  assert.equal(rows.length, CASE_IDS.length * DENSITIES.length * FONT_SCALES.length);
  const keys = new Set();
  for (const row of rows) {
    keys.add(`${row.caseId}/${row.density}/${row.fontScale}`);
    for (const key of ["caseId", "density", "fontScale", "scale", "referencePath", "capturePath", "expectedBounds", "observedBounds", "comparedPixels", "mismatchedPixels", "status"]) assert.ok(Object.hasOwn(row, key), `${key} missing`);
    assert.ok(["pass", "fail"].includes(row.status));
    assert.ok(row.comparedPixels > 0);
    assert.ok(Number.isInteger(row.mismatchedPixels) && row.mismatchedPixels >= 0);
    assert.ok(Object.keys(row.expectedBounds).length > 0);
    assert.equal(Object.keys(row.expectedBounds).length, Object.keys(row.observedBounds).length);
  }
  assert.equal(keys.size, 48);
});
