import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityVerificationIR, buildExporterIR } from "./exporter-ir.mjs";
import { capabilityPathInventory } from "./canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "./exporters/mobile.mjs";

const inventory = capabilityPathInventory();

function documentFor(role = "ios") {
  return {
    module: "mobile",
    axes: {
      appearance: { modes: [{ name: "light" }, { name: "dark", media: "(prefers-color-scheme: dark)" }] },
      viewport: { modes: [{ name: "phone", minWidth: 0 }, { name: "wide", minWidth: 600 }] },
    },
    variables: {
      ink: { tokenType: "color", cascade: [{ value: "#111111" }, { value: "#eeeeee", when: { appearance: "dark" } }] },
    },
    children: [{ id: "screen", name: "Runtime Screen", role, type: "frame", layout: "none", width: 320, height: 200, children: [
      { id: "panel", type: "rectangle", x: [{ value: 10 }, { value: 80, when: { viewport: "wide" } }], width: 100, height: 60, fill: [{ value: "${ink}" }, { value: "#ff0000", when: { appearance: "dark" } }] },
      { id: "label", type: "text", x: 10, y: 80, width: 200, height: 30, content: "Runtime", fill: "${ink}", paragraphs: [{ from: 0, to: 7 }], marks: [] },
    ] }],
  };
}

function irFor(role = "ios", modes) {
  return buildCapabilityVerificationIR(documentFor(role), { role, frames: ["screen"], ...(modes ? { modes } : {}) }, inventory);
}

test("mobile IR resolves dark/light paint and text plus viewport geometry per combination", () => {
  const ir = irFor();
  assert.deepEqual(ir.mobileVariants.map(({ modes }) => modes), [
    { appearance: "light", viewport: "phone" }, { appearance: "light", viewport: "wide" },
    { appearance: "dark", viewport: "phone" }, { appearance: "dark", viewport: "wide" },
  ]);
  const light = ir.mobileVariants[0].outputs[0].nodes;
  const dark = ir.mobileVariants[2].outputs[0].nodes;
  assert.equal(light.find((node) => node.id === "panel").paint.fill, "#111111");
  assert.equal(dark.find((node) => node.id === "panel").paint.fill, "#ff0000");
  assert.equal(light.find((node) => node.id === "label").semantics.runs[0].fill, "#111111");
  assert.equal(dark.find((node) => node.id === "label").semantics.runs[0].fill, "#eeeeee");
  assert.equal(light.find((node) => node.id === "panel").geometry.x, 10);
  assert.equal(ir.mobileVariants[1].outputs[0].nodes.find((node) => node.id === "panel").geometry.x, 80);
});

test("explicit request modes remain the base selection while runtime variants retain all defaults", () => {
  const ir = irFor("ios", { appearance: "dark", viewport: "wide" });
  assert.deepEqual(ir.modes, { appearance: "dark", viewport: "wide" });
  assert.equal(ir.outputs[0].nodes.find((node) => node.id === "panel").paint.fill, "#ff0000");
  assert.equal(ir.outputs[0].nodes.find((node) => node.id === "panel").geometry.x, 80);
  assert.deepEqual(ir.mobileVariants[0].modes, { appearance: "light", viewport: "phone" });
});

test("mobile runtime lowering is deterministic and emits fixed branch subtrees", () => {
  const ios = irFor();
  assert.deepEqual(JSON.parse(JSON.stringify(irFor())), JSON.parse(JSON.stringify(ios)));
  const swift = exportSwiftUI(ios).get("RuntimeScreen.swift");
  assert.match(swift, /@Environment\(\\.colorScheme\)/u);
  assert.match(swift, /GeometryReader \{ proxy in/u);
  assert.match(swift, /colorScheme == \.dark && proxy\.size\.width >= 600/u);
  assert.match(swift, /position\(x: 130, y: 30\)/u);
  const android = irFor("android");
  const compose = exportCompose(android).get("RuntimeScreen.kt");
  assert.match(compose, /isSystemInDarkTheme\(\)/u);
  assert.match(compose, /BoxWithConstraints/u);
  assert.match(compose, /canvasDark == true && maxWidth >= 600\.0f\.dp/u);
  assert.match(compose, /offset\(80\.dp, 0\.dp\)/u);
});

test("mobile runtime metadata rejects invalid and ambiguous declarations", () => {
  const cases = [
    { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    { appearance: { modes: [{ name: "one", media: "prefers-color-scheme: dark" }, { name: "two", media: "prefers-color-scheme: dark" }] } },
    { viewport: { modes: [{ name: "phone", minWidth: 0 }, { name: "wide", minWidth: 0 }] } },
    { viewport: { modes: [{ name: "phone", minWidth: -1 }] } },
  ];
  for (const axes of cases) assert.throws(() => buildExporterIR({ module: "mobile", axes, children: [] }, { role: "ios", frames: [] }), { code: "CANVAS_MOBILE_AXIS_METADATA" });
});

test("mobile runtime combinations are bounded", () => {
  const axes = {
    appearance: { modes: [{ name: "light" }, { name: "dark", media: "prefers-color-scheme: dark" }] },
    viewport: { modes: Array.from({ length: 33 }, (_, index) => ({ name: `v${index}`, minWidth: index })) },
  };
  assert.throws(() => buildExporterIR({ module: "mobile", axes, children: [] }, { role: "ios", frames: [] }), { code: "CANVAS_MOBILE_AXIS_COMBINATIONS" });
});

test("runtime raster changes fail instead of reusing base rasterData bytes", () => {
  const document = documentFor();
  document.children[0].children = [{ id: "image", type: "rectangle", width: 100, height: 50, export: "image", fill: [
    { value: "#111111" }, { value: "#eeeeee", when: { appearance: "dark" } },
  ] }];
  assert.throws(() => buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"] }, inventory), { code: "CANVAS_MOBILE_RASTER_VARIANT_UNSAFE" });
});
