import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GRID_CANDIDATE_PATHS,
  GRID_CASE_IDS,
  GRID_COLS,
  GRID_CONTROL_ID,
  GRID_DEVICES,
  GRID_MATRIX_CASE_IDS,
  GRID_PLACEMENTS,
  GRID_ROWS,
  buildGridDocument,
  buildGridIR,
  buildGridProjectYaml,
  buildGridSources,
  compareGridPixels,
  expectedGridGeometry,
  launchArguments,
  readyReceipt,
  sourceFileNameForOutput,
  sourceHashReceipt,
  stableScreenshotHashes,
} from "../scripts/luna-ios-grid-production.mjs";

const evidence = resolve(new URL("../research/luna-ios-grid-production-20260907/", import.meta.url).pathname);

function raster(width, height, fill = [255, 255, 255, 255]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(fill, offset);
  return { width, height, pixels };
}

function paintRect(image, bounds, color) {
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) for (let x = bounds.minX; x <= bounds.maxX; x += 1) image.pixels.set([...color, 255], (y * image.width + x) * 4);
}

const expectedSynthetic = { root: { geometry: { w: 20, h: 20 } }, children: [{ id: "cell", geometry: { x: 4, y: 4, w: 6, h: 6 }, paint: { fill: "#123456" } }] };

test("grid source preparation covers the exact 12-case matrix plus separate control", async () => {
  const document = buildGridDocument();
  assert.equal(document.children.length, 13);
  assert.equal(GRID_MATRIX_CASE_IDS.length, 12);
  assert.equal(GRID_CASE_IDS.at(-1), GRID_CONTROL_ID);
  assert.equal(new Set(GRID_CASE_IDS).size, 13);
  assert.deepEqual(GRID_COLS, [[100, 180], [180, 100]]);
  assert.deepEqual(GRID_ROWS, [[60, 100], [100, 60]]);
  assert.deepEqual(GRID_PLACEMENTS.map(({ id }) => id), ["normal", "reversed", "only-2-2"]);
  for (const frame of document.children) {
    assert.deepEqual([frame.width, frame.height, frame.layout, frame.fill], [340, 400, "none", "#FFFFFF"]);
    const grid = frame.children[0];
    assert.deepEqual([grid.x, grid.y, grid.width, grid.height, grid.columnGap, grid.rowGap], [20, 60, 300, 280, 10, 15]);
    if (frame.id === GRID_CONTROL_ID) assert.deepEqual(grid.padding, [11, 12, 13, 14]);
    else assert.deepEqual(grid.padding, [0, 0, 0, 0]);
  }
  const controlChildren = document.children.at(-1).children[0].children;
  assert.equal(controlChildren.at(-1).id, "absolute-overlay");
  assert.equal(controlChildren.at(-1).layoutPosition, "absolute");
});

test("candidate verification and Swift sources use resolved IR geometry", async () => {
  const { ir, sources } = buildGridSources();
  assert.deepEqual(ir.outputs.map(({ id }) => id), GRID_CASE_IDS);
  assert.ok(ir.outputs.every(({ root }) => root.capability.verdict === "native"));
  assert.ok(ir.outputs.flatMap(({ nodes }) => nodes).every(({ capability }) => capability.verdict === "native"));
  assert.deepEqual(GRID_CANDIDATE_PATHS, [...new Set(GRID_CANDIDATE_PATHS)]);
  const expected = expectedGridGeometry(ir);
  for (const entry of expected) {
    const source = sources.get(sourceFileNameForOutput(ir.outputs.find(({ id }) => id === entry.caseId)));
    assert.ok(source, `missing generated Swift source for ${entry.caseId}`);
    for (const child of entry.children) assert.match(source, new RegExp(`\\.position\\(x: ${child.geometry.localX + child.geometry.w / 2}, y: ${child.geometry.localY + child.geometry.h / 2}\\)`, "u"));
    assert.doesNotMatch(source, /LazyVGrid\(|\.padding\(/u);
  }
  const control = expected.find(({ caseId }) => caseId === GRID_CONTROL_ID);
  assert.ok(control.children.some(({ id }) => id === "absolute-overlay"));
});

test("generated host has independent case/nonce identity and rejects unknown cases", async () => {
  const { sources } = buildGridSources();
  const host = sources.get("GridFixtureHost.swift");
  assert.ok(host.includes('.accessibilityIdentifier("luna-grid-fixture-\\(caseID)")'));
  assert.match(host, /NSLog\("LUNA_GRID_READY case=%@ nonce=%@", caseID, nonce\)/u);
  assert.match(host, /default: preconditionFailure\("Unknown grid fixture case:/u);
  assert.match(host, /--grid-case/u);
  assert.match(host, /--grid-nonce/u);
  assert.throws(() => launchArguments("not-a-grid-case", "nonce"), /Unknown grid fixture case/);
  assert.deepEqual(launchArguments(GRID_MATRIX_CASE_IDS[0], "nonce-1"), ["--grid-case", GRID_MATRIX_CASE_IDS[0], "--grid-nonce", "nonce-1"]);
  assert.equal(readyReceipt(GRID_MATRIX_CASE_IDS[0], "nonce-1", `prefix LUNA_GRID_READY case=${GRID_MATRIX_CASE_IDS[0]} nonce=nonce-1\n`), true);
  const metacharCase = "case[1].+$^(){}|\\?";
  const metacharNonce = "nonce(.*)+$[x]\\?";
  assert.equal(readyReceipt(metacharCase, metacharNonce, `prefix LUNA_GRID_READY case=${metacharCase} nonce=${metacharNonce}\n`), true);
  assert.equal(readyReceipt(metacharCase, metacharNonce, `LUNA_GRID_READY case=${metacharCase} nonce=wrong\n`), false);
  assert.equal(readyReceipt(metacharCase, metacharNonce, `LUNA_GRID_READY case=wrong nonce=${metacharNonce}\n`), false);
  assert.equal(readyReceipt(metacharCase, metacharNonce, `LUNA_GRID_READY case=${metacharCase} nonce=${metacharNonce.slice(0, -1)}`), false);
  assert.equal(readyReceipt(GRID_MATRIX_CASE_IDS[0], "nonce-2", `LUNA_GRID_READY case=${GRID_MATRIX_CASE_IDS[0]} nonce=nonce-1\n`), false);
  assert.equal(readyReceipt(GRID_MATRIX_CASE_IDS[0], "nonce-1", `LUNA_GRID_READY case=wrong-case nonce=nonce-1\n`), false);
  assert.equal(readyReceipt(GRID_MATRIX_CASE_IDS[0], "nonce-1", `prefix LUNA_GRID_READY case=${GRID_MATRIX_CASE_IDS[0]} nonce=nonce-1-partial`), false);
  assert.equal(stableScreenshotHashes(["a".repeat(64), "a".repeat(64)]), true);
  assert.equal(stableScreenshotHashes([undefined, undefined]), false);
  assert.equal(stableScreenshotHashes(["", ""]), false);
  assert.equal(stableScreenshotHashes(["a", "a"]), false);
  assert.equal(stableScreenshotHashes(["A".repeat(64), "A".repeat(64)]), false);
  assert.equal(stableScreenshotHashes(["a".repeat(63), "a".repeat(63)]), false);
  assert.equal(stableScreenshotHashes(["a".repeat(64), "b".repeat(64)]), false);
  assert.equal(stableScreenshotHashes([undefined, "a".repeat(64)]), false);
});

test("committed source hashes and resolved geometry receipts are reproducible", async () => {
  const { ir, sources } = buildGridSources();
  const receipt = JSON.parse(await readFile(resolve(evidence, "source-hashes.json"), "utf8"));
  assert.deepEqual(sourceHashReceipt(sources), receipt);
  const candidateReceipt = JSON.parse(await readFile(resolve(evidence, "candidate-paths.json"), "utf8"));
  assert.equal(candidateReceipt.mode, "candidate-verification");
  assert.equal(candidateReceipt.publicCapabilityPromotion, false);
  assert.deepEqual(candidateReceipt.paths, GRID_CANDIDATE_PATHS);
  const expected = JSON.parse(await readFile(resolve(evidence, "expected-bounds.json"), "utf8"));
  assert.deepEqual(expectedGridGeometry(ir), expected);
  const capturePlan = JSON.parse(await readFile(resolve(evidence, "capture-plan.json"), "utf8"));
  assert.equal(capturePlan.expectedPrimaryEntries, 36);
  assert.deepEqual(capturePlan.matrixCases, GRID_MATRIX_CASE_IDS);
  assert.equal(capturePlan.controlCase, GRID_CONTROL_ID);
  assert.equal(await readFile(resolve(evidence, "project.yml"), "utf8"), buildGridProjectYaml());
  const projectHash = JSON.parse(await readFile(resolve(evidence, "project-hash.json"), "utf8"));
  assert.equal(projectHash.path, "project.yml");
});

test("grid pixel comparison rejects zero samples and three-pixel shifts while accepting identical pixels", () => {
  const color = [0x12, 0x34, 0x56];
  const image = raster(20, 20);
  paintRect(image, { minX: 4, minY: 4, maxX: 9, maxY: 9 }, color);
  assert.equal(compareGridPixels(expectedSynthetic, image, 1).status, "pass");
  const identicalResult = compareGridPixels(expectedSynthetic, image, 1);
  assert.equal(identicalResult.failures.length, 0);
  assert.equal(identicalResult.registration, "none");
  assert.equal(identicalResult.comparedChildren, 1);
  assert.equal(identicalResult.sampleCounts.length, 1);
  assert.ok(Number.isFinite(identicalResult.sampleCounts[0].samples) && identicalResult.sampleCounts[0].samples > 0);
  const shifted = raster(20, 20);
  paintRect(shifted, { minX: 7, minY: 4, maxX: 12, maxY: 9 }, color);
  const shiftedResult = compareGridPixels(expectedSynthetic, shifted, 1);
  assert.equal(shiftedResult.status, "mismatch");
  assert.equal(shiftedResult.failures[0].kind, "edge-displacement");
  const blankResult = compareGridPixels(expectedSynthetic, raster(20, 20), 1);
  assert.equal(blankResult.status, "mismatch");
  assert.equal(blankResult.failures[0].kind, "zero-solid-color-samples");
  assert.equal(blankResult.sampleCounts[0].samples, 0);
  assert.equal(compareGridPixels({ root: { geometry: { w: 20, h: 20 } }, children: [] }, image, 1).reason, "zero-child-geometry");
  assert.equal(compareGridPixels({ root: { geometry: { w: 20, h: 20 } }, children: [{ id: "bad", geometry: { x: 0, y: 0, w: 0, h: 1 }, paint: { fill: "#123456" } }] }, image, 1).reason, "nonfinite-or-nonpositive-child-geometry");
});

test("reference set contains all 13 cases for each assigned scale state", async () => {
  const expectedStates = GRID_DEVICES.flatMap(({ key, contentSizes, scale }) => contentSizes.map((contentSize) => ({ state: `${key}-${contentSize}`, scale })));
  for (const { state, scale } of expectedStates) for (const caseID of GRID_CASE_IDS) {
    const bytes = await readFile(resolve(evidence, "references", state, `${caseID}.png`));
    assert.ok(bytes.length > 100, `${state}/${caseID} reference is empty`);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.deepEqual({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, { width: 340 * scale, height: 400 * scale });
  }
});
