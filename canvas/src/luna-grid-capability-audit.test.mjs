import assert from "node:assert/strict";
import test from "node:test";

import { buildCapabilityVerificationIR } from "./exporter-ir.mjs";
import { capabilityPathInventory, validateCanvasDocument } from "./canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "./exporters/mobile.mjs";

function baseDocument(gridTemplateColumns, role = "ios") {
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "screen", type: "frame", role, width: 320, height: 240, layout: "none", children: [{
        id: "grid", type: "frame", width: 320, height: 240, layout: "grid", gridTemplateColumns,
        gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15, padding: [11, 12, 13, 14], children: [
          { id: "first", type: "rectangle", width: 40, height: 30, gridColumn: 1, gridRow: 1, fill: "#123456" },
          { id: "second", type: "rectangle", width: 40, height: 30, gridColumn: 2, gridRow: 2, fill: "#654321" },
          { id: "overlay", type: "rectangle", x: 7, y: 9, width: 20, height: 10, layoutPosition: "absolute", fill: "#abcdef" },
        ],
      }],
    }],
  };
}

test("schema-valid gridTemplateColumns are explicitly separated from unresolved track keywords", () => {
  for (const tracks of [[100, 180], [180, 100], [0, 240], [320], ["auto", "1fr"], ["1fr", "2fr"], [0, "0fr"]]) {
    assert.equal(validateCanvasDocument(baseDocument(tracks), { throw: false }).valid, true, JSON.stringify(tracks));
  }
  for (const track of ["fill_container", "fit_content"]) {
    const result = validateCanvasDocument(baseDocument([track, 100]), { throw: false });
    assert.equal(result.valid, false, track);
    assert.ok(result.errors.some((error) => error.includes("gridTemplateColumns[0]")), track);
  }
  for (const tracks of [[-1, 100], [NaN, 100], [Infinity, 100], [{ value: 100 }, 100], ["-1fr", 100], ["1.5", 100], [" 1fr", 100], ["minmax(10, 1fr)", 100], ["repeat(2, 1fr)", 100]]) {
    const result = validateCanvasDocument(baseDocument(tracks), { throw: false });
    assert.equal(result.valid, false, JSON.stringify(tracks));
    assert.ok(result.errors.some((error) => error.includes("gridTemplateColumns")));
  }
});

test("numeric grid IR emits resolved child geometry in Swift and Compose source order", () => {
  const expected = [
    { id: "first", x: 14, y: 11, width: 40, height: 30, swiftCenter: "34, y: 26", compose: "offset(14.dp, 11.dp).size(40.dp, 30.dp)" },
    { id: "second", x: 124, y: 86, width: 40, height: 30, swiftCenter: "144, y: 101", compose: "offset(124.dp, 86.dp).size(40.dp, 30.dp)" },
    { id: "overlay", x: 7, y: 9, width: 20, height: 10, swiftCenter: "17, y: 14", compose: "offset(7.dp, 9.dp).size(20.dp, 10.dp)" },
  ];
  for (const role of ["ios", "android"]) {
    const document = baseDocument([100, 180], role);
    const ir = buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, capabilityPathInventory());
    const output = ir.outputs[0];
    for (const item of expected) {
      const node = output.nodes.find(({ id }) => id === item.id);
      assert.deepEqual({ x: node.geometry.localX, y: node.geometry.localY, width: node.geometry.w, height: node.geometry.h }, { x: item.x, y: item.y, width: item.width, height: item.height }, `${role}/${item.id}`);
    }
    const source = role === "ios" ? exportSwiftUI(ir).get("Screen.swift") : exportCompose(ir).get("Screen.kt");
    assert.ok(source, `${role} generated source missing`);
    for (const item of expected) {
      if (role === "ios") {
        assert.match(source, new RegExp(`\\.frame\\(width: ${item.width}, height: ${item.height}[^\\n]*\\)\\.position\\(x: ${item.swiftCenter}\\)`), `${role}/${item.id}`);
      } else {
        assert.ok(source.includes(item.compose), `${role}/${item.id}`);
      }
    }
    const positions = expected.map(({ swiftCenter, compose }) => role === "ios" ? source.indexOf(`position(x: ${swiftCenter})`) : source.indexOf(compose));
    assert.ok(positions.every((position) => position >= 0));
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2], `${role} paint order`);
    if (role === "android") assert.doesNotMatch(source, /LazyVerticalGrid\(/u);
  }
});
