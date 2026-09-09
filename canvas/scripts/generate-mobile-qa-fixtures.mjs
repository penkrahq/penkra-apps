import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { capabilityPathInventory } from "../src/canvas-schema.mjs";
import { exportCompose, exportSwiftUI } from "../src/exporters/mobile.mjs";
import { mobileVectorFixture } from "../compatibility/mobile-vector-fixture.mjs";
import { mobileSurfaceFixture } from "../compatibility/mobile-surface-fixture.mjs";
import { mobilePaintFixture } from "../compatibility/mobile-paint-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const source = {
  version: "2.17", module: "mobile", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "mobile-fixture", type: "frame", role: "ios", name: "Mobile Fixture", width: 393, height: 852, layout: "vertical", gap: 14, padding: 20, fill: "#F6F2EA", description: "Canvas mobile export verification screen", children: [
      { id: "logo", type: "path", width: 88, height: 64, geometry: "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#0B4A6F", decorative: true },
      { id: "heading", type: "text", width: 340, height: 64, content: "Native Canvas", fontFamily: "Inter", fontSize: 30, fontWeight: 700, letterSpacing: 0.5, fill: "#102A43", headingLevel: 1, paragraphs: [{ from: 0, to: 13, headingLevel: 1 }], marks: [], description: "Native Canvas heading" },
      { id: "body", type: "text", width: 340, height: 54, content: "Responsive type and layout", fontFamily: "Inter", fontSize: 18, fontStyle: "italic", underline: true, fill: "#334E68", paragraphs: [{ from: 0, to: 26 }], marks: [{ from: 0, to: 10, type: "weight", value: 700 }] },
      { id: "decoration", type: "text", width: 340, height: 20, content: "Decorative watermark", fontSize: 12, decorative: true, paragraphs: [{ from: 0, to: 20 }], marks: [] },
      { id: "grid", type: "frame", width: 340, height: 220, layout: "grid", gridTemplateColumns: [160, 160], gap: 12, fill: "#FFFFFF", cornerRadius: 18, children: [
        { id: "a", type: "rectangle", width: 160, height: 96, fill: "#D9EAF2", cornerRadius: 12 },
        { id: "b", type: "ellipse", width: 96, height: 96, fill: "#F4A261", description: "Orange circle" },
        { id: "c", type: "rectangle", width: 160, height: 96, fill: "#2A9D8F", cornerRadius: 12 },
        { id: "d", type: "rectangle", width: 160, height: 96, fill: "#E9C46A", cornerRadius: 12 },
      ] },
      { id: "wrap", type: "frame", width: 340, height: 100, layout: "horizontal", wrap: true, gap: 10, rowGap: 10, children: [
        { id: "chip1", type: "rectangle", width: 120, height: 40, fill: "#0B4A6F", cornerRadius: 20 },
        { id: "chip2", type: "rectangle", width: 150, height: 40, fill: "#2A9D8F", cornerRadius: 20 },
        { id: "chip3", type: "rectangle", width: 110, height: 40, fill: "#F4A261", cornerRadius: 20 },
      ] },
    ],
  }],
};

const swiftDir = resolve(root, "compatibility/mobile-fixtures/swiftui/Sources/CanvasSwiftUIFixture");
if (process.argv.includes("--text-alignment")) {
  source.children[0].padding = [80, 20, 20, 20];
  source.children[0].children = ["start", "center", "end"].map((textAlign) => ({
    id: `align-${textAlign}`, type: "frame", width: 340, height: 150, layout: "none", fill: "#FFFFFF", children: [
      { id: `text-${textAlign}`, type: "text", x: 20, y: 20, width: 300, height: 110, content: "Canvas alignment\nShort", fontFamily: "Inter", fontSize: 24, fill: "#123456", textAlign },
    ],
  }));
}
if (process.argv.includes("--accessibility")) {
  source.children[0].padding = [80, 20, 20, 20];
  source.children[0].children = [
    { id: "heading", type: "text", width: 330, height: 70, textGrowth: "fixed-width", content: "Native Canvas", fontFamily: "Inter", fontSize: 20, fontWeight: 700, paragraphs: [{ from: 0, to: 13, headingLevel: 1 }], description: "Native Canvas heading" },
    { id: "body", type: "text", width: 330, height: 60, textGrowth: "fixed-width", content: "Responsive type and layout", fontFamily: "Inter", fontSize: 14 },
    { id: "decoration", type: "text", width: 330, height: 40, content: "Decorative watermark", fontSize: 12, decorative: true, description: "Hidden direct description" },
    { id: "circle", type: "ellipse", width: 96, height: 60, fill: "#F4A261", description: "Orange circle" },
    { id: "hidden-group", type: "frame", width: 330, height: 90, layout: "vertical", fill: "#D9EAF2", decorative: true, description: "Hidden group description", children: [
      { id: "hidden-child", type: "text", width: 300, height: 60, content: "Nested decorative content", fontSize: 12, description: "Hidden nested description" },
    ] },
    { id: "visible-group", type: "frame", width: 330, height: 90, layout: "vertical", fill: "#D9EAF2", description: "Visible group description", children: [
      { id: "visible-child", type: "text", width: 300, height: 60, content: "Visible nested content", fontSize: 12, description: "Visible nested description" },
    ] },
  ];
}
if (process.argv.includes("--corners")) {
  source.children[0].padding = [80, 20, 20, 20];
  source.children[0].children = [20, [0, 20, 40, 60], [80, 120, 160, 200], [40]].flatMap((cornerRadius, index) => ["rectangle", "frame"].map((type) => ({
    id: `corners-${index}-${type}`, type, width: 300, height: 70, cornerRadius, fill: "#F4A261", ...(type === "frame" ? { layout: "none", children: [] } : {}),
  })));
}
if (process.argv.includes("--gaps")) {
  source.children[0].padding = [80, 20, 20, 20];
  const children = (id, count, width, height) => Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, type: "rectangle", width, height, fill: "#F4A261" }));
  source.children[0].children = [
    { id: "horizontal", type: "frame", width: 300, height: 64, layout: "horizontal", gap: 7, columnGap: 30, rowGap: 40, fill: "#0B4A6F", children: children("horizontal", 3, 50, 40) },
    { id: "vertical", type: "frame", width: 300, height: 130, layout: "vertical", gap: 7, columnGap: 30, rowGap: 25, fill: "#0B4A6F", children: children("vertical", 2, 50, 40) },
    { id: "wrap", type: "frame", width: 300, height: 140, layout: "horizontal", wrap: true, gap: 7, columnGap: 30, rowGap: 25, fill: "#0B4A6F", children: children("wrap", 5, 80, 35) },
    { id: "grid", type: "frame", width: 300, height: 140, layout: "grid", gridTemplateColumns: [135, 135], gap: 7, columnGap: 30, rowGap: 25, fill: "#0B4A6F", children: children("grid", 4, 135, 45) },
  ];
}
if (process.argv.includes("--alignment") || process.argv.includes("--padding")) {
  source.children[0].padding = 0;
  source.children[0].children = ["vertical", "horizontal"].flatMap((layout) => ["start", "center", "end"].map((alignItems) => ({
    id: `${layout}-${alignItems}`, type: "frame", layout, alignItems, width: 300, height: 90, fill: "#0B4A6F",
    ...(process.argv.includes("--padding") ? { padding: [10, 20, 10, 40] } : {}),
    children: [{ id: `${layout}-${alignItems}-probe`, type: "rectangle", width: 60, height: 30, fill: "#F4A261" }],
  })));
}
if (process.argv.includes("--growing-text")) {
  for (const node of source.children[0].children) {
    if (["heading", "body"].includes(node.id)) node.textGrowth = "fixed-width";
  }
}
if (process.argv.includes("--strokes") || process.argv.includes("--dashes")) {
  source.children[0].children = ["butt", "round", "square"].map((cap) => ({
    id: `stroke-${cap}`, type: "path", width: 300, height: 120,
    geometry: "M20 20 H260 V100", viewBox: [0, 0, 300, 120],
    stroke: { fill: "#F4A261", width: 8, align: "center", cap, join: "miter", ...(process.argv.includes("--dashes") ? { dash: [12, 12] } : {}) },
  }));
}
if (process.argv.includes("--dash-edge-cases")) {
  source.children[0].children = [
    { id: "odd", dash: [12], cap: "butt" },
    { id: "dots", dash: [0, 12], cap: "round" },
    { id: "zero-gap", dash: [12, 0], cap: "butt" },
    { id: "all-zero", dash: [0, 0], cap: "butt" },
  ].map(({ id, dash, cap }) => ({
    id, type: "path", width: 300, height: 120, geometry: "M20 20 H260 V100", viewBox: [0, 0, 300, 120],
    stroke: { fill: "#F4A261", width: 8, align: "center", cap, join: "miter", dash },
  }));
}
if (process.argv.includes("--stroke-alignment")) {
  source.children[0].children = ["center", "inside", "outside"].map((align) => ({
    id: `stroke-${align}`, type: "path", width: 300, height: 120,
    geometry: "M20 20 H260 V100 H20 Z", viewBox: [0, 0, 300, 120], fill: "#0B4A6F",
    stroke: { fill: "#F4A261", width: 8, align },
  }));
}
if (process.argv.includes("--stroke-compositing")) {
  source.children[0].children = ["center", "inside", "outside"].map((align) => ({
    id: `compositing-${align}`, type: "path", width: 300, height: 120,
    geometry: "M0 20 C0 0 30 0 50 0 H250 C280 0 300 0 300 20 V100 H0 Z M100 30 H200 V70 H100 Z",
    viewBox: [0, 0, 300, 120], fillRule: "evenodd", fill: "#0B4A6F", opacity: 0.5,
    stroke: { fill: "#F4A261", width: 8, align, join: "round" },
  }));
}
if (process.argv.includes("--completion")) {
  source.axes = {
    appearance: { modes: [{ name: "light" }, { name: "dark", media: "(prefers-color-scheme: dark)" }] },
    viewport: { modes: [{ name: "phone", minWidth: 0 }, { name: "wide", minWidth: 450 }] },
  };
  source.children[0].padding = [80, 20, 20, 20];
  source.children[0].gap = 18;
  source.children[0].fill = [{ value: "#F6F2EA" }, { value: "#DCEAF7", when: { appearance: "dark" } }];
  source.children[0].children = [
    { id: "completion-lines", type: "frame", width: 300, height: 48, layout: "none", children: [
      { id: "completion-line", type: "line", width: 300, height: 48, stroke: { fill: "#123456", width: 6, cap: "round", join: "bevel", dash: [12, 8] } },
      { id: "completion-line-horizontal", type: "line", y: 22, width: 300, height: 0, stroke: { fill: "#E76F51", width: 4, cap: "square" } },
      { id: "completion-line-vertical", type: "line", x: 150, width: 0, height: 48, stroke: { fill: "#2A9D8F", width: 4, cap: "butt" } },
    ] },
    { id: "completion-transform", type: "rectangle", width: 180, height: 76, fill: { type: "gradient", gradientType: "linear", center: { x: 0.5, y: 0.5 }, size: { width: 1, height: 1 }, rotation: 0, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] }, rotation: 18, flipX: true, stroke: { fill: "#102030", width: 4, align: "inside" } },
    { id: "completion-angular", type: "ellipse", width: 180, height: 110, fill: { type: "gradient", gradientType: "angular", center: { x: 0.4, y: 0.6 }, rotation: 35, colors: [{ color: "#ff0000", position: 0 }, { color: "#00ff00", position: 0.5 }, { color: "#0000ff", position: 1 }] } },
    { id: "completion-radial", type: "rectangle", width: 180, height: 90, fill: { type: "gradient", gradientType: "radial", center: { x: 0.3, y: 0.65 }, size: { width: 0.7, height: 1.25 }, rotation: 24, colors: [{ color: "#ffffff", position: 0 }, { color: "#6A4C93", position: 1 }] } },
    { id: "completion-clip", type: "frame", width: 300, height: 130, layout: "none", overflow: "clip", fill: "#0B4A6F", children: [
      { id: "completion-overflow", type: "rectangle", x: 240, y: 25, width: 100, height: 70, fill: "#F4A261" },
    ] },
    { id: "completion-justify", type: "frame", width: 300, height: 70, layout: "horizontal", justifyContent: "end", alignItems: "end", columnGap: 10, fill: "#264653", children: [
      { id: "completion-justify-a", type: "rectangle", width: 40, height: 30, fill: "#E9C46A" },
      { id: "completion-justify-b", type: "rectangle", width: 50, height: 20, fill: "#2A9D8F" },
    ] },
    { id: "completion-constraints", type: "frame", width: 300, height: 60, layout: "horizontal", alignItems: "start", fill: "#264653", children: [
      { id: "completion-constrained", type: "rectangle", width: 20, minWidth: 80, maxWidth: 90, height: 100, minHeight: 30, maxHeight: 40, fill: "#E76F51" },
    ] },
    { id: "completion-runtime", type: "rectangle", width: [{ value: 60 }, { value: 140, when: { viewport: "wide" } }], height: 24, fill: [{ value: "#E9C46A" }, { value: "#6A4C93", when: { appearance: "dark" } }] },
  ];
}
if (process.argv.includes("--opacity")) {
  source.children[0].children = [
    { id: "opaque", type: "rectangle", width: 300, height: 100, fill: "#0B4A6F" },
    { id: "half-rectangle", type: "rectangle", width: 300, height: 100, fill: "#0B4A6F", opacity: 0.5 },
    { id: "half-ellipse", type: "ellipse", width: 300, height: 100, fill: "#0B4A6F", opacity: 0.5 },
    { id: "half-group", type: "frame", layout: "none", width: 300, height: 100, fill: "#0B4A6F", opacity: 0.5, children: [
      { id: "group-child", type: "rectangle", x: 50, y: 20, width: 200, height: 60, fill: "#F4A261" },
    ] },
    ...[1, 0.5].map((opacity, index) => ({
      id: `text-opacity-${index}`, type: "text", width: 300, height: 100,
      content: "ABC", fontFamily: "Inter", fontSize: 28, fill: "#0B4A6F", opacity,
    })),
  ];
}
if (process.argv.includes("--solid-colors")) {
  source.children[0].children = [
    "#3698", "#33669988", "rgba(51,102,153,0.5333333333)",
    { type: "color", color: "#336699", opacity: 8 / 15 },
    { type: "color", color: "#33669988", opacity: 0.5 },
    "transparent",
  ].map((fill, index) => ({ id: `color-${index}`, type: "rectangle", width: 300, height: 90, fill }));
}
if (process.argv.includes("--clipping") || process.argv.includes("--rounded-clipping")) {
  source.children[0].padding = [80, 20, 20, 20];
  source.children[0].children = [false, true].flatMap((clip, row) => ["rectangle", "ellipse"].map((shape, column) => ({
    id: `clip-${clip}-${shape}`, type: "frame", width: 300, height: 140, layout: "none", clip, fill: "#0B4A6F", children: [
      { id: `clip-${row}-${column}-inside`, type: shape, x: 20, y: 20, width: 80, height: 80, fill: "#F4A261" },
      { id: `clip-${row}-${column}-overflow`, type: shape, x: 240, y: 35, width: 100, height: 70, fill: "#F4A261" },
    ],
  })));
  if (process.argv.includes("--rounded-clipping")) {
    for (const frame of source.children[0].children) {
      frame.cornerRadius = [30, 10, 40, 0];
      frame.children.push({ id: `${frame.id}-corner`, type: "rectangle", x: 0, y: 0, width: 50, height: 50, fill: "#2A9D8F" });
    }
  }
}
const composeDir = resolve(root, "compatibility/mobile-fixtures/compose/app/src/main/java/generated/canvas");
if (process.argv.includes("--vectors")) Object.assign(source, mobileVectorFixture());
if (process.argv.includes("--surfaces")) Object.assign(source, mobileSurfaceFixture());
if (process.argv.includes("--paints")) Object.assign(source, mobilePaintFixture());
await mkdir(swiftDir, { recursive: true }); await mkdir(composeDir, { recursive: true });
const iosIR = buildCapabilityVerificationIR(source, { role: "ios", frames: ["mobile-fixture"] }, capabilityPathInventory());
for (const [name, contents] of exportSwiftUI(iosIR)) await writeFile(resolve(swiftDir, name.replace(/^_canvas\//u, "")), contents);
const android = structuredClone(source); android.children[0].role = "android";
const androidIR = buildCapabilityVerificationIR(android, { role: "android", frames: ["mobile-fixture"] }, capabilityPathInventory());
for (const [name, contents] of exportCompose(androidIR)) await writeFile(resolve(composeDir, name.replace(/^_canvas\//u, "")), contents);
if (process.argv.includes("--completion")) {
  const evidence = resolve(root, "research/mobile-capability-completion-20260908");
  await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, "fixture.json"), `${JSON.stringify({ ios: source, android }, null, 2)}\n`);
  await writeFile(resolve(evidence, "ir.json"), `${JSON.stringify({ ios: iosIR, android: androidIR }, null, 2)}\n`);
}
