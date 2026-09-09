import assert from "node:assert/strict";
import test from "node:test";

import { buildExporterIR } from "../exporter-ir.mjs";
import { capabilityTableFor } from "../capability-tables.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";

function document(role, children) {
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "screen", name: "Completion", type: "frame", role, width: 360, height: 240, children }],
  };
}

test("mobile production export keeps lines, transforms, angular gradients, clipping, and shape strokes native", () => {
  for (const role of ["ios", "android"]) {
    const source = document(role, [
      { id: "line", type: "line", x: 20, y: 20, width: 120, height: 40, stroke: { fill: "#123456", width: 6, cap: "round", join: "bevel", dash: [8, 4] } },
      { id: "horizontal", type: "line", x: 20, y: 80, width: 120, height: 0, stroke: { fill: "#abcdef", width: 4 } },
      { id: "vertical", type: "line", x: 150, y: 20, width: 0, height: 60, stroke: { fill: "#abcdef", width: 4 } },
      { id: "turned", type: "rectangle", x: 170, y: 20, width: 80, height: 60, fill: "#abcdef", rotation: 27, flipX: true, flipY: true, stroke: { fill: "#102030", width: 4, align: "inside" } },
      { id: "angular", type: "ellipse", x: 20, y: 100, width: 120, height: 90, fill: { type: "gradient", gradientType: "angular", center: { x: 0.4, y: 0.6 }, rotation: 35, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] } },
      { id: "clip", type: "frame", x: 170, y: 110, width: 80, height: 60, overflow: "clip", fill: "#ffffff", children: [{ id: "overflow", type: "rectangle", x: 50, y: 10, width: 60, height: 30, fill: "#654321" }] },
    ]);
    const ir = buildExporterIR(source, { role, frames: ["screen"] });
    assert.deepEqual(ir.rasters, []);
    assert.equal(ir.outputs[0].nodes.find(({ id }) => id === "turned").geometry.flipX, true);
    const generated = role === "ios" ? exportSwiftUI(ir).get("Completion.swift") : exportCompose(ir).get("Completion.kt");
    if (role === "ios") {
      assert.match(generated, /Path \{ path in path\.move[\s\S]*path\.addLine/u);
      assert.match(generated, /frame\(width: 120, height: 4[\s\S]*frame\(width: 4, height: 60/u);
      assert.match(generated, /StrokeStyle\(lineWidth: 6, lineCap: \.round, lineJoin: \.bevel[\s\S]*dash: \[8, 4\]/u);
      assert.match(generated, /scaleEffect\(x: -1, y: -1, anchor: \.center\)\.rotationEffect\(\.degrees\(27\)/u);
      assert.match(generated, /AngularGradient\([\s\S]*center: UnitPoint\(x: 0\.4, y: 0\.6\)[\s\S]*startAngle: \.degrees\(35\)/u);
      assert.match(generated, /\.clipped\(\)/u);
    } else {
      assert.match(generated, /Path\(\)\.apply[\s\S]*moveTo\(0\.0f, 0\.0f\)[\s\S]*lineTo\(120\.0f, 40\.0f\)/u);
      assert.match(generated, /size\(120\.dp, 4\.dp\)[\s\S]*size\(4\.dp, 60\.dp\)/u);
      assert.match(generated, /dashPathEffect\(floatArrayOf\(8\.0f, 4\.0f\)\)/u);
      assert.match(generated, /graphicsLayer \{ rotationZ = 27\.0f; scaleX = -1\.0f; scaleY = -1\.0f/u);
      assert.match(generated, /Brush\.sweepGradient[\s\S]*rotate\(35\.0f, center\)/u);
      assert.match(generated, /canvasClipToBounds\(\)/u);
    }
  }
});

test("mobile raster verdicts name representation limits instead of incomplete writer work", () => {
  for (const target of ["swift", "kotlin"]) for (const [path, row] of Object.entries(capabilityTableFor(target).properties)) {
    if (row.verdict !== "raster") continue;
    assert.doesNotMatch(row.reason, /current (?:SwiftUI|Compose) writer|no measured|unverified|missing emitter|not implemented/iu, `${target}:${path}`);
    assert.match(row.reason, /Canvas|native|platform|symbol|shader|mesh|backdrop|spread|raster|heading|locale|BCP/iu, `${target}:${path}`);
  }
});
