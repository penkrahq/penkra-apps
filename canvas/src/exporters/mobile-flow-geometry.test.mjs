import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityVerificationIR } from "../exporter-ir.mjs";
import { capabilityPathInventory } from "../canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";

const paths = capabilityPathInventory();

function wrapDocument(role) {
  return {
    version: "2.17",
    module: "mobile",
    children: [{
      id: "screen", type: "frame", role, name: "Fixed Wrap", width: 210, height: 140,
      layout: "horizontal", wrap: true, padding: [8, 12, 6, 14], columnGap: 6, rowGap: 10,
      children: [
        { id: "first", type: "text", width: 80, height: 28, content: "first\nline", textGrowth: "fixed-width-height", fill: "#112233" },
        { id: "second", type: "rectangle", width: 90, height: 18, fill: "#223344" },
        { id: "third", type: "rectangle", width: 70, height: 24, fill: "#334455" },
        { id: "overlay", type: "rectangle", x: 3, y: 4, width: 12, height: 9, layoutPosition: "absolute", fill: "#445566" },
      ],
    }],
  };
}

test("wrapped SwiftUI uses resolved local geometry for rows, gaps, sizing, and overlays", () => {
  const ir = buildCapabilityVerificationIR(wrapDocument("ios"), { role: "ios", frames: ["screen"] }, paths);
  const source = exportSwiftUI(ir).get("FixedWrap.swift");
  const nodes = ir.outputs[0].nodes;
  assert.match(source, /ZStack\(alignment: \.topLeading\)/u);
  assert.doesNotMatch(source, /FlowLayout\(/u);
  for (const node of nodes) {
    const { localX, localY, w, h } = node.geometry;
    assert.match(source, new RegExp(`width: ${w}, height: ${h}[\\s\\S]*position\\(x: ${localX + w / 2}, y: ${localY + h / 2}\\)`));
  }
  assert.ok(source.indexOf("position(x: 9, y: 8.5)") !== -1);
  assert.ok(source.indexOf("0.067") < source.indexOf("0.133"), "wrapped children retain source/paint order");
});

test("wrapped Compose uses resolved local geometry and never invokes FlowRow", () => {
  const ir = buildCapabilityVerificationIR(wrapDocument("android"), { role: "android", frames: ["screen"] }, paths);
  const source = exportCompose(ir).get("FixedWrap.kt");
  assert.match(source, /Box\(modifier = Modifier\.size\(210\.dp, 140\.dp\)/u);
  assert.doesNotMatch(source, /FlowRow\(/u);
  for (const node of ir.outputs[0].nodes) {
    const { localX, localY, w, h } = node.geometry;
    assert.match(source, new RegExp(`offset\\(${localX}\\.dp, ${localY}\\.dp\\)\\.size\\(${w}\\.dp, ${h}\\.dp\\)`));
  }
  assert.ok(source.indexOf("0xFF112233") < source.indexOf("0xFF223344"));
  assert.ok(source.indexOf("0xFF223344") < source.indexOf("0xFF334455"));
  assert.ok(source.indexOf("0xFF334455") < source.indexOf("0xFF445566"));
});

test("wrapped text growth modes retain each resolved box on both mobile targets", () => {
  for (const textGrowth of ["auto", "fixed-width", "fixed-width-height"]) {
    for (const role of ["ios", "android"]) {
      const document = wrapDocument(role);
      document.children[0].children[0] = {
        ...document.children[0].children[0],
        textGrowth,
        content: textGrowth === "auto" ? "intrinsic" : "fixed width\nwith rows",
      };
      const ir = buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths);
      const geometry = ir.outputs[0].nodes.find((node) => node.id === "first").geometry;
      const source = role === "ios"
        ? exportSwiftUI(ir).get("FixedWrap.swift")
        : exportCompose(ir).get("FixedWrap.kt");
      if (role === "ios") {
        assert.match(source, new RegExp(`frame\\(width: ${geometry.w}, height: ${geometry.h},[\\s\\S]*position\\(x: ${geometry.localX + geometry.w / 2}, y: ${geometry.localY + geometry.h / 2}\\)`));
      } else {
        assert.match(source, new RegExp(`offset\\(${geometry.localX}\\.dp, ${geometry.localY}\\.dp\\)\\.size\\(${geometry.w}\\.dp, ${geometry.h}\\.dp`));
      }
    }
  }
});

test("wrapped cross-axis alignment is represented by resolved positions", () => {
  for (const layout of ["horizontal", "vertical"]) for (const alignItems of ["start", "center", "end"]) {
    const document = {
      version: "2.17", module: "mobile", children: [{
        id: "screen", type: "frame", role: "ios", name: "Wrapped Alignment", width: 220, height: 180,
        layout, wrap: true, alignItems, padding: [10, 20, 30, 40], columnGap: 8, rowGap: 12,
        children: [
          { id: "a", type: "rectangle", width: 70, height: 24, fill: "#111111" },
          { id: "b", type: "rectangle", width: 90, height: 14, fill: "#222222" },
          { id: "c", type: "rectangle", width: 60, height: 20, fill: "#333333" },
        ],
      }],
    };
    for (const role of ["ios", "android"]) {
      document.children[0].role = role;
      const ir = buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths);
      const geometries = new Map(ir.outputs[0].nodes.map((node) => [node.id, node.geometry]));
      const source = role === "ios" ? exportSwiftUI(ir).get("WrappedAlignment.swift") : exportCompose(ir).get("WrappedAlignment.kt");
      assert.match(source, role === "ios" ? /ZStack\(alignment: \.topLeading\)/u : /Box\(modifier = Modifier\.size\(220\.dp, 180\.dp\)/u);
      for (const geometry of geometries.values()) {
        if (role === "ios") assert.match(source, new RegExp(`position\\(x: ${geometry.localX + geometry.w / 2}, y: ${geometry.localY + geometry.h / 2}\\)`));
        else assert.match(source, new RegExp(`offset\\(${geometry.localX}\\.dp, ${geometry.localY}\\.dp\\)\\.size\\(${geometry.w}\\.dp, ${geometry.h}\\.dp`));
      }
      if (layout === "horizontal" && geometries.get("b").h < geometries.get("a").h) {
        const expected = { start: geometries.get("a").localY, center: geometries.get("a").localY + 5, end: geometries.get("a").localY + 10 }[alignItems];
        assert.equal(geometries.get("b").localY, expected);
      }
    }
  }
});

test("resolved SwiftUI linear cross-axis alignment covers start, center, end, and stretch", () => {
  for (const layout of ["vertical", "horizontal"]) for (const alignItems of ["start", "center", "end", "stretch"]) {
    const document = {
      version: "2.17", module: "mobile", children: [{
        id: "screen", type: "frame", role: "ios", name: "Alignment", width: 240, height: 180,
        layout, alignItems, padding: [10, 20, 30, 40], children: [
          { id: "a", type: "rectangle", width: 60, height: 20, fill: "#111111" },
          { id: "b", type: "rectangle", width: 80, height: 30, fill: "#222222" },
        ],
      }],
    };
    const ir = buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, paths);
    const source = exportSwiftUI(ir).get("Alignment.swift");
    const index = ["start", "center", "end", "stretch"].indexOf(alignItems);
    const stackAlignment = layout === "vertical"
      ? ["leading", "center", "trailing", "leading"][index]
      : ["top", "center", "bottom", "top"][index];
    assert.match(source, new RegExp(`${layout === "vertical" ? "V" : "H"}Stack\\(alignment: \\.${stackAlignment},`));
    const geometries = ir.outputs[0].nodes.map(({ geometry }) => geometry);
    for (const geometry of geometries) {
      assert.ok(Number.isFinite(geometry.localX) && Number.isFinite(geometry.localY));
      assert.ok(Number.isFinite(geometry.w) && Number.isFinite(geometry.h));
    }
    if (alignItems === "stretch") {
      const crossSize = layout === "vertical" ? 180 : 140;
      assert.deepEqual(geometries.map(({ w, h }) => layout === "vertical" ? w : h), [crossSize, crossSize]);
    }
  }
});

test("resolved wrapped positions preserve multiline row heights and independent gaps", () => {
  const document = wrapDocument("android");
  const ir = buildCapabilityVerificationIR(document, { role: "android", frames: ["screen"] }, paths);
  const byId = new Map(ir.outputs[0].nodes.map((node) => [node.id, node.geometry]));
  assert.equal(ir.outputs[0].root.layout.columnGap, 6);
  assert.equal(ir.outputs[0].root.layout.rowGap, 10);
  assert.equal(byId.get("first").localX, 14);
  assert.equal(byId.get("second").localX, byId.get("first").localX + byId.get("first").w);
  assert.equal(byId.get("third").localX, 14);
  // The fixed exporter preserves the engine's resolved line position rather
  // than reimplementing wrapping (including any engine-specific row-gap
  // behavior) in SwiftUI or Compose.
  assert.equal(byId.get("third").localY, byId.get("first").localY + byId.get("first").h);
  assert.equal(byId.get("overlay").localX, 3);
  assert.equal(byId.get("overlay").localY, 4);
});
