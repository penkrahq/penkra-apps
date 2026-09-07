import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";
import { exportWeb } from "./web.mjs";

const regular = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
const ir = { outputs: [{ id: "screen", name: "Font Screen", width: 200, height: 100, nodes: [{
  id: "label", parent: "screen", z: 0, type: "text", capability: { verdict: "native" },
  geometry: { x: 0, y: 0, localX: 0, localY: 0, w: 200, h: 40 }, paint: {}, layout: {},
  semantics: { content: "Fonts", runs: [{ from: 0, to: 5, fontFamily: "Inter", fontSize: 24 }], paragraphs: [], decorative: false },
}] }] };

test("mobile bundles carry exact font bytes and native loaders, with no silent font substitution", () => {
  for (const writer of [exportSwiftUI, exportCompose]) {
    const files = writer(ir, { fonts: { "Inter:400": regular } });
    const font = [...files].find(([path]) => path.endsWith(".ttf"));
    assert.ok(font);
    assert.deepEqual(font[1], regular);
    assert.equal([...files.keys()].filter((path) => path.endsWith(".ttf")).length, 1);
    assert.ok(files.has("FONT-INTEGRATION.md"));
    assert.throws(() => writer(ir, { fonts: {} }), { code: "CANVAS_MOBILE_FONT_MISSING" });
    const italic = structuredClone(ir);
    italic.outputs[0].nodes[0].semantics.runs[0].italic = true;
    assert.throws(() => writer(italic, { fonts: { "Inter:400": regular } }), { code: "CANVAS_MOBILE_FONT_MISSING" });
    const bold = structuredClone(ir);
    bold.outputs[0].nodes[0].semantics.runs[0].weight = 700;
    assert.throws(() => writer(bold, { fonts: { "Inter:700": regular } }), { code: "CANVAS_MOBILE_FONT_MISMATCH" });
  }
  const swift = exportSwiftUI(ir, { fonts: { "Inter:400": regular } });
  assert.match(swift.get("FontScreen.swift"), /CanvasFonts\.register\(\)/);
  assert.match(swift.get("FontScreen.swift"), /\.custom\("Inter-Regular"/);
  const compose = exportCompose(ir, { fonts: { "Inter:400": regular } });
  assert.match(compose.get("FontScreen.kt"), /fontFamily = canvasFont0/);
  assert.match(compose.get("FontScreen.kt"), /style = androidx\.compose\.ui\.text\.TextStyle\(fontSize = with\(androidx\.compose\.ui\.platform\.LocalDensity\.current\) \{ 24\.dp\.toSp\(\) \}, letterSpacing = 0\.sp, textMotion = androidx\.compose\.ui\.text\.style\.TextMotion\.Animated\)/);
  assert.ok(compose.get("FontScreen.kt").includes("SpanStyle(color = Color(0xFF000000), fontSize = with(androidx.compose.ui.platform.LocalDensity.current) { 24.dp.toSp() }"));
  assert.match(compose.get("_canvas/CanvasFonts.kt"), /assetManager = assets/);
});

test("mobile face validation recognizes the declared typographic family across legacy style groups", async () => {
  for (const [weight, name] of [[500, "Medium"], [600, "SemiBold"], [800, "ExtraBold"]]) {
    const bytes = await readFile(new URL(`../../vendor/open-pencil/fonts/Inter-${name}.ttf`, import.meta.url));
    const styled = structuredClone(ir);
    styled.outputs[0].nodes[0].semantics.runs[0].weight = weight;
    for (const writer of [exportSwiftUI, exportCompose]) {
      const files = writer(styled, { fonts: { [`Inter:${weight}`]: bytes } });
      assert.deepEqual([...files].find(([path]) => path.endsWith(".ttf"))[1], bytes);
      const wrongFamily = structuredClone(styled);
      wrongFamily.outputs[0].nodes[0].semantics.runs[0].fontFamily = "Unrelated Family";
      assert.throws(() => writer(wrongFamily, { fonts: { [`Unrelated Family:${weight}`]: bytes } }), { code: "CANVAS_MOBILE_FONT_MISMATCH" });
    }
  }
});

test("generated source bundles reject normalized name collisions before losing a screen", () => {
  for (const writer of [exportSwiftUI, exportCompose, exportWeb]) {
    const duplicate = structuredClone(ir);
    duplicate.outputs.push({ ...structuredClone(duplicate.outputs[0]), id: "other", name: "Font-Screen" });
    assert.throws(() => writer(duplicate), { code: "CANVAS_EXPORT_NAME_COLLISION" });
  }
  for (const writer of [exportSwiftUI, exportCompose]) {
    const reserved = structuredClone(ir);
    reserved.outputs[0].name = "Canvas Fonts";
    assert.throws(() => writer(reserved), { code: "CANVAS_EXPORT_NAME_COLLISION" });
  }
});
