import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ANDROID_STATES,
  CASE_IDS,
  CASE_SPECS,
  IOS_STATES,
  buildFlowPaintDocument,
  buildFlowPaintIR,
  compareFlowPaint,
  decodePng,
  parseReadiness,
  prepareFlowPaintEvidence,
  stableHashes,
} from "../scripts/luna-mobile-flow-paint-capture.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";

const evidenceRoot = new URL("../research/luna-mobile-flow-paint-20260907/", import.meta.url);

test("flow+paint fixture is one bounded eleven-case app per mobile platform", () => {
  assert.equal(CASE_IDS.length, 11);
  assert.deepEqual(CASE_SPECS.map(({ id }) => id), CASE_IDS);
  for (const role of ["ios", "android"]) {
    const document = buildFlowPaintDocument(role);
    assert.equal(document.children.length, CASE_IDS.length);
    assert.ok(document.children.every((frame) => frame.role === role && frame.height === 360 && (frame.id === "runtime-appearance-viewport" || frame.width === 420)));
    const ir = buildFlowPaintIR(role, document);
    assert.deepEqual(ir.outputs.map(({ id }) => id), CASE_IDS);
    assert.ok(ir.outputs.every((output) => output.height === 360 && (output.id === "runtime-appearance-viewport" || output.width === 420)));
  }
});

test("fixture covers wrap alignment, independent gaps, overlay, aggregate paint, transformed gradients, and rounded overflow", () => {
  const document = buildFlowPaintDocument("ios");
  const byId = new Map(document.children.map((frame) => [frame.id, frame]));
  for (const id of ["wrap-horizontal-start", "wrap-horizontal-center", "wrap-horizontal-end"]) {
    const wrap = byId.get(id).children[0];
    assert.equal(wrap.layout, "horizontal"); assert.equal(wrap.wrap, true); assert.deepEqual(wrap.padding, [13, 31, 17, 23]);
    assert.equal(wrap.rowGap, 17); assert.equal(wrap.columnGap, 11); assert.equal(wrap.children.length, 4);
  }
  assert.equal(byId.get("wrap-horizontal-start").children[0].alignItems, "start");
  assert.equal(byId.get("wrap-horizontal-center").children[0].alignItems, "center");
  assert.equal(byId.get("wrap-horizontal-end").children[0].alignItems, "end");
  assert.equal(byId.get("wrap-vertical").children[0].layout, "vertical"); assert.equal(byId.get("wrap-vertical").children[0].wrap, true);
  assert.equal(byId.get("absolute-overlay").children[0].children.at(-1).layoutPosition, "absolute");
  const aggregate = byId.get("aggregate-fill").children[0].fill;
  assert.equal(aggregate.filter((paint) => paint.enabled !== false).length, 1);
  assert.equal(byId.get("transformed-linear").children[0].fill.gradientType, "linear");
  assert.equal(byId.get("transformed-radial").children[0].fill.gradientType, "radial");
  assert.deepEqual(byId.get("rounded-scalar-overflow").children[0].cornerRadius, 26);
  assert.deepEqual(byId.get("rounded-corners-overflow").children[0].cornerRadius, [12, 28, 44, 20]);
  for (const id of ["rounded-scalar-overflow", "rounded-corners-overflow"]) assert.equal(byId.get(id).children[0].children[0].x, -16);
  assert.deepEqual(document.axes.appearance.modes, [{ name: "light" }, { name: "dark", media: "(prefers-color-scheme: dark)" }]);
  assert.deepEqual(document.axes.viewport.modes, [{ name: "phone", minWidth: 0 }, { name: "wide", minWidth: 480 }]);
});

test("runtime appearance and viewport variants change active paint and resolved child geometry", () => {
  const ir = buildFlowPaintIR("ios");
  assert.deepEqual(ir.mobileVariants.map(({ modes }) => modes), [
    { appearance: "light", viewport: "phone" }, { appearance: "light", viewport: "wide" },
    { appearance: "dark", viewport: "phone" }, { appearance: "dark", viewport: "wide" },
  ]);
  const panel = (variant) => variant.outputs.find(({ id }) => id === "runtime-appearance-viewport").nodes.find(({ id }) => id === "runtime-panel");
  const child = (variant) => variant.outputs.find(({ id }) => id === "runtime-appearance-viewport").nodes.find(({ id }) => id === "runtime-child");
  assert.equal(panel(ir.mobileVariants[0]).paint.fill, "#264653"); assert.equal(panel(ir.mobileVariants[2]).paint.fill, "#E76F51");
  assert.notEqual(panel(ir.mobileVariants[0]).geometry.x, panel(ir.mobileVariants[1]).geometry.x);
  assert.notEqual(child(ir.mobileVariants[0]).geometry.x, child(ir.mobileVariants[1]).geometry.x);
  assert.equal(ir.mobileVariants[1].outputs.find(({ id }) => id === "runtime-appearance-viewport").width, 700);
});

test("generated native sources retain all eleven selections and preserve disabled aggregate decoys", () => {
  const ios = exportSwiftUI(buildFlowPaintIR("ios")); const android = exportCompose(buildFlowPaintIR("android"));
  const swiftHost = ios.get("FlowPaintWrapHorizontalStart.swift"); const composeHost = android.get("FlowPaintWrapHorizontalStart.kt");
  assert.ok(swiftHost && composeHost); assert.match(swiftHost, /ZStack\(alignment: \.topLeading\)/u); assert.match(composeHost, /Box\(modifier = Modifier/u);
  assert.ok([...ios.values()].every((source) => !source.includes("FF00FF")));
  assert.ok([...android.values()].every((source) => !source.includes("FF00FF")));
  assert.match(ios.get("FlowPaintTransformedRadial.swift"), /Canvas \{ context, size in/u);
  assert.match(android.get("FlowPaintTransformedRadial.kt"), /withTransform\(/u);
});

test("prebuilt Canvas references are complete and compare to themselves with exact dimensions", async () => {
  await access(new URL("fixture.json", evidenceRoot));
  const index = JSON.parse(await readFile(new URL("reference-index.json", evidenceRoot), "utf8"));
  assert.deepEqual(Object.keys(index.ios), IOS_STATES.map(({ key }) => key)); assert.deepEqual(Object.keys(index.android), ANDROID_STATES.map(({ key }) => key));
  for (const [platform, states] of [["ios", IOS_STATES], ["android", ANDROID_STATES]]) for (const state of states) {
    assert.deepEqual(Object.keys(index[platform][state.key]), ["light", "dark"]);
    for (const appearance of ["light", "dark"]) for (const caseId of CASE_IDS) {
      const record = index[platform][state.key][appearance][caseId]; const bytes = await readFile(join(evidenceRoot.pathname, record.path)); const image = await decodePng(bytes);
      assert.equal(image.width, record.width); assert.equal(image.height, record.height);
      const viewport = platform === "ios" ? (state.key === "ipad-large" ? "wide" : "phone") : state.density === 320 ? "wide" : "phone";
      const ir = buildFlowPaintIR(platform === "ios" ? "ios" : "android", buildFlowPaintDocument(platform === "ios" ? "ios" : "android"), { appearance, viewport });
      const comparison = compareFlowPaint(image, image, ir, caseId, state.scale);
      assert.equal(comparison.status, "pass"); assert.equal(comparison.mismatchedPixels, 0); assert.equal(comparison.boundMismatches.length, 0);
    }
  }
});

test("readiness is nonce-bound and stability accepts only two equal full-frame SHA-256 values", () => {
  const nonce = "flow-paint-ios-state-case-nonce";
  const log = `LUNA_FLOW_PAINT_READY case=wrap-horizontal-start nonce=${nonce}\nLUNA_FLOW_PAINT_ROOT case=wrap-horizontal-start nonce=${nonce} frame=5.000,8.000 420.000x360.000 scale=3.000`;
  assert.deepEqual(parseReadiness(log, "wrap-horizontal-start", nonce, "ios"), { root: { x: 5, y: 8, width: 420, height: 360 }, scale: 3 });
  assert.equal(parseReadiness(log, "wrap-horizontal-start", "wrong", "ios"), null);
  assert.equal(stableHashes(["a".repeat(64), "a".repeat(64)]), true); assert.equal(stableHashes(["a".repeat(64), "b".repeat(64)]), false);
});

test("preparation is deterministic and can be rerun without a compiler or device", async () => {
  const prepared = await prepareFlowPaintEvidence(evidenceRoot.pathname);
  assert.equal(prepared.sourceReceipt.files.length, 28);
  assert.equal(Object.keys(prepared.references.ios).length, IOS_STATES.length);
  assert.equal(Object.keys(prepared.references.android).length, ANDROID_STATES.length);
});
