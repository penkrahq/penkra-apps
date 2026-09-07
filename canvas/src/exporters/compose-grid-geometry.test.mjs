import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityVerificationIR } from "../exporter-ir.mjs";
import { capabilityPathInventory } from "../canvas-schema.mjs";
import { exportCompose } from "./mobile.mjs";

test("Compose grids preserve unequal tracks, explicit cells, padding and paint order", () => {
  for (const columns of [[100, 180], [180, 100]]) {
    const children = [
      { id: "second", type: "rectangle", width: 40, height: 30, gridColumn: 2, gridRow: 2, fill: "#123456" },
      { id: "first", type: "rectangle", width: 40, height: 30, gridColumn: 1, gridRow: 1, fill: "#654321" },
      { id: "overlay", type: "rectangle", x: 7, y: 9, width: 20, height: 10, layoutPosition: "absolute", fill: "#abcdef" },
    ];
    const document = { version: "2.17", module: "mobile", children: [{
      id: "screen", type: "frame", role: "android", name: "Grid Geometry", width: 400, height: 400, layout: "none", children: [{
        id: "grid", type: "frame", x: 20, y: 30, width: 340, height: 300, layout: "grid",
        gridTemplateColumns: columns, gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15,
        padding: [11, 12, 13, 14], clip: true, fill: "#ffffff", children,
      }],
    }] };
    const ir = buildCapabilityVerificationIR(document, { role: "android", frames: ["screen"] }, capabilityPathInventory());
    const source = exportCompose(ir).get("GridGeometry.kt");
    const nodes = ir.outputs[0].nodes;
    const positions = children.map(({ id }) => nodes.find(node => node.id === id).geometry);
    assert.deepEqual(positions.map(({ localX, localY }) => [localX, localY]), [
      [14 + columns[0] + 10, 11 + 60 + 15], [14, 11], [7, 9],
    ]);
    for (const geometry of positions) {
      assert.ok(source.includes(`.offset(${geometry.localX}.dp, ${geometry.localY}.dp).size(${geometry.w}.dp, ${geometry.h}.dp)`));
    }
    assert.doesNotMatch(source, /LazyVerticalGrid\(|\.padding\(/u);
    assert.ok(source.indexOf("0xFF123456") < source.indexOf("0xFF654321"));
    assert.ok(source.indexOf("0xFF654321") < source.indexOf("0xFFABCDEF"));
    assert.match(source, /canvasClipToBounds\(\)/u);
  }
});
