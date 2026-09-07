import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityVerificationIR } from "../exporter-ir.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";

const linearPaths = ["nodes.frame", "nodes.rectangle", "properties.fill", "properties.fill.gradient.linear", "properties.fill.gradient.linear.transformed"];
const radialPaths = ["nodes.frame", "nodes.rectangle", "nodes.ellipse", "properties.fill", "properties.fill.gradient.radial", "properties.fill.gradient.radial.transformed"];
function source(fill, type = "rectangle", extra = {}) {
  return { version: "2.17", module: "mobile", children: [{ id: "screen", name: "Paint", type: "frame", role: "ios", width: 200, height: 120, children: [{ id: "shape", type, width: 160, height: 80, fill, ...extra }] }] };
}
function generated(fill, role, paths, type = "rectangle", extra = {}) {
  const document = source(fill, type, extra);
  document.children[0].role = role;
  return role === "ios"
    ? exportSwiftUI(buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths)).get("Paint.swift")
    : exportCompose(buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths)).get("Paint.kt");
}

test("mobile aggregate fill emits a single solid paint and ignores disabled paints", () => {
  for (const role of ["ios", "android"]) {
    const output = generated([{ type: "color", color: "#000000", enabled: false }, { type: "color", color: "#123456", opacity: 0.5 }], role, ["nodes.frame", "nodes.rectangle", "properties.fill", "properties.fill.solid"]);
    assert.match(output, role === "ios" ? /Color\(red: 0\.071, green: 0\.204, blue: 0\.337, opacity: 0\.5\)/u : /Color\(0x80123456\)/u);
    assert.doesNotMatch(output, /opacity\(0\.5\)|alpha\(0\.5/u, `${role} must not apply paint opacity as a second layer`);
  }
});

test("mobile aggregate fill rejects two active paints without silently dropping one", () => {
  for (const role of ["ios", "android"]) {
    assert.throws(() => generated([{ type: "color", color: "#123456" }, { type: "color", color: "#abcdef" }], role, ["nodes.frame", "nodes.rectangle", "properties.fill", "properties.fill.solid"]), (error) => {
      assert.equal(error.code, "CANVAS_MOBILE_MULTIPAINT_UNSUPPORTED");
      assert.match(error.message, /ordered compositing is not implemented/u);
      return true;
    });
  }
});

test("mobile emits transformed linear gradients with ordered alpha stops and authored geometry", () => {
  const fill = { type: "gradient", gradientType: "linear", center: { x: 0.25, y: 0.75 }, size: { width: 0.8, height: 0.4 }, rotation: 30, colors: [{ color: "#ff000080", position: 0 }, { color: "#00ff00", position: 0.4 }, { color: "#0000ff40", position: 1 }] };
  const swift = generated(fill, "ios", linearPaths);
  assert.match(swift, /LinearGradient\(gradient: Gradient\(stops: \[\.init\(color: Color\(red: 1, green: 0, blue: 0, opacity: 0\.502\), location: 0\), \.init\(color: Color\(red: 0, green: 1, blue: 0, opacity: 1\), location: 0\.4\), \.init\(color: Color\(red: 0, green: 0, blue: 1, opacity: 0\.251\), location: 1\)\]\), startPoint: UnitPoint\(x: -0\.096, y: 0\.65\), endPoint: UnitPoint\(x: 0\.596, y: 0\.85\)\)/u);
  const compose = generated(fill, "android", linearPaths);
  assert.match(compose, /Brush\.linearGradient\(colorStops = arrayOf\(0\.0f to Color\(0x80FF0000\), 0\.4f to Color\(0xFF00FF00\), 1\.0f to Color\(0x400000FF\)\)/u);
  assert.match(compose, /Offset\(-0\.096f \* size\.width, 0\.65f \* size\.height\).*Offset\(0\.596f \* size\.width, 0\.85f \* size\.height\)/u);
});

test("mobile emits off-center anisotropic and rotated radial gradients through native shader transforms", () => {
  const fill = { type: "gradient", gradientType: "radial", center: { x: 0.2, y: 0.7 }, size: { width: 0.5, height: 0.25 }, rotation: 37, colors: [{ color: "#ffffff", position: 0 }, { color: "#00000000", position: 1 }] };
  const swift = generated(fill, "ios", radialPaths);
  assert.match(swift, /let path = Path\(CGRect\(origin: \.zero, size: size\)\)\.applying\(CGAffineTransform\(translationX: center\.x, y: center\.y\).*scaledBy\(x: 2, y: 4\).*scaleBy\(x: 0\.5, y: 0\.25\).*radialGradient\(Gradient\(stops:.*center: center, startRadius: 0, endRadius: 40\)/su);
  const compose = generated(fill, "android", radialPaths);
  assert.match(compose, /Brush\.radialGradient\(colorStops = arrayOf\(0\.0f to Color\(0xFFFFFFFF\), 1\.0f to Color\(0x00000000\)\)/u);
  assert.match(compose, /withTransform\(\{ rotate\(37\.0f, center\); scale\(0\.5f, 0\.25f, center\) \}\)/u);
});

test("Compose container gradients derive coordinates from runtime draw size", () => {
  const fill = { type: "gradient", gradientType: "linear", center: { x: 0.5, y: 0.5 }, size: { width: 1, height: 1 }, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] };
  const document = source(fill, "frame", { children: [{ id: "child", type: "rectangle", width: 20, height: 20, fill: "#ffffff" }] });
  document.children[0].role = "android";
  const kotlin = exportCompose(buildCapabilityVerificationIR(document, { role: "android", frames: ["screen"] }, ["nodes.frame", "nodes.rectangle", "properties.fill", "properties.fill.gradient.linear"])).get("Paint.kt");
  assert.match(kotlin, /drawWithCache\(Modifier\.offset\(0\.dp, 0\.dp\)\.size\(160\.dp, 80\.dp\).*size\.width.*size\.height/su);
  assert.doesNotMatch(kotlin, /Offset\([^)]*200\.0f|Offset\([^)]*120\.0f/u);
});

test("mobile icon properties remain one explicit raster scope with native image wrappers and accessibility", () => {
  const document = source("#00000000", "icon", { icon: "heart", library: "lucide", weight: 700, description: "Favorite" });
  for (const role of ["ios", "android"]) {
    document.children[0].role = role;
    const paths = ["nodes.frame", "properties.fill", "properties.fill.solid", "properties.accessibility.description"];
    const ir = buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, paths);
    assert.equal(ir.rasters.length, 1);
    assert.equal(ir.rasters[0].id, "shape");
    const sourceText = role === "ios" ? exportSwiftUI(ir, { rasterData: () => "AAAA" }).get("Paint.swift") : exportCompose(ir, { rasterData: () => "AAAA" }).get("Paint.kt");
    assert.equal((sourceText.match(/CanvasRasterImage\(/gu) ?? []).length + (sourceText.match(/BitmapFactory\.decodeByteArray/gu) ?? []).length, 1);
    assert.match(sourceText, /Favorite/u);
    assert.doesNotMatch(sourceText, /opacity\(0\.5\)|alpha\(0\.5/u);
  }
});

test("mobile gradient inputs fail closed with stable errors", () => {
  const invalid = [
    [{ type: "gradient", gradientType: "conic", colors: [{ color: "#fff", position: 0 }, { color: "#000", position: 1 }] }, "CANVAS_MOBILE_GRADIENT_UNSUPPORTED", ["properties.fill.gradient.conic"]],
    [{ type: "gradient", gradientType: "linear", colors: [{ color: "#fff", position: 0 }] }, "CANVAS_MOBILE_GRADIENT_INVALID", linearPaths],
    [{ type: "gradient", gradientType: "linear", colors: [{ color: "#fff", position: 0 }, { color: "#000", position: 2 }] }, "CANVAS_MOBILE_GRADIENT_INVALID", linearPaths],
  ];
  for (const [fill, code, paths] of invalid) assert.throws(() => generated(fill, "ios", ["nodes.frame", "nodes.rectangle", "properties.fill", ...paths]), { code });
});
