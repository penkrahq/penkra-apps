import { assertCapabilityTotality, capabilityPathInventory } from "./canvas-schema.mjs";

const inventory = capabilityPathInventory();
const native = () => ({ verdict: "native" });
const raster = (why) => ({ verdict: "raster", reason: why });
const ignore = (why) => ({ verdict: "ignore", reason: why });
const unverified = () => ({ verdict: null, status: "unverified" });

export const CAPABILITY_TABLES = Object.freeze({
  slide: table("select-at-export", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.effect.shadow.spread", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.flipX", "properties.flipY", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.lineHeight", "properties.wordSpacing", "properties.textAlign", "properties.textAlignVertical", "properties.text.run.wordSpacing"], "The current PPTX writer has no measured native emission for this construct."),
    ...ignoreRows(["properties.headingLevel", "properties.landmark", "properties.text.paragraph.headingLevel"], "PresentationML has no native heading or landmark semantic for ordinary slide shapes."),
    "properties.fill.gradient.angular": raster("DrawingML has no angular-gradient element."),
    "properties.fill.gradient.mesh": raster("DrawingML has no mesh-gradient element."),
    "properties.fill.shader": raster("DrawingML cannot execute shaders."),
    "properties.effect.background_blur": raster("DrawingML has no backdrop-filter effect."),
    "properties.flow.hover": ignore("PowerPoint has no hover trigger."),
  }),
  page: table("select-at-export", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.fill.gradient.mesh", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox"], "The current PDF writer has no measured native emission for this construct."),
    "properties.fill.shader": raster("PDF cannot execute Canvas shaders."),
    "properties.effect.background_blur": raster("Backdrop blur is flattened for deterministic PDF output."),
    "properties.flow.advance": ignore("Static PDF pages have no advance transition."),
    "properties.flow.hover": ignore("Static PDF has no hover state."),
    "properties.flow.keypress": ignore("Static PDF has no keypress flow."),
  }),
  route: table("emit-conditional", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.effect.background_blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.flipX", "properties.flipY", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.padding", "properties.justifyContent", "properties.alignItems", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.italic", "properties.text.run.underline", "properties.text.run.strikethrough", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current HTML/CSS writer has no measured live emission for this construct."),
    "properties.fill.gradient.mesh": raster("CSS has no portable mesh-gradient primitive."),
    "properties.fill.shader": raster("Static HTML/CSS export does not ship a shader runtime."),
  }),
  ios: table("emit-conditional", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.rotation", "properties.flipX", "properties.flipY", "properties.stroke", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.fill", "properties.padding", "properties.justifyContent", "properties.columnGap", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current SwiftUI writer has no measured live emission for this construct."),
    "properties.fill.gradient.mesh": raster("SwiftUI target emits a rendered asset for mesh geometry."),
    "properties.fill.shader": raster("SwiftUI target does not ship a shader runtime."),
    "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset."),
    "properties.flow.hover": ignore("Touch-first iOS output does not expose Canvas hover flows."),
  }),
  android: table("emit-conditional", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.rotation", "properties.flipX", "properties.flipY", "properties.stroke", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.fill", "properties.padding", "properties.justifyContent", "properties.alignItems", "properties.columnGap", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current Compose writer has no measured live emission for this construct."),
    "properties.fill.gradient.mesh": raster("Compose target emits a rendered asset for mesh geometry."),
    "properties.fill.shader": raster("Compose target does not ship a shader runtime."),
    "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset."),
    "properties.flow.hover": ignore("Touch-first Android output does not expose Canvas hover flows."),
  }),
  svg: table("select-at-export", {
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.text.run.italic", "properties.text.run.underline", "properties.text.run.strikethrough", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The supported SVG writer profile has no measured native emission for this construct."),
    "properties.fill.gradient.mesh": raster("SVG 1.1 has no mesh-gradient primitive in the supported profile."),
    "properties.fill.shader": raster("SVG cannot execute Canvas shaders."),
    "properties.effect.background_blur": raster("Portable SVG has no backdrop blur."),
    "properties.flow.advance": ignore("Standalone SVG export omits document flows."),
    "properties.flow.tap": ignore("Standalone SVG export omits document flows."),
    "properties.flow.hover": ignore("Standalone SVG export omits document flows."),
    "properties.flow.keypress": ignore("Standalone SVG export omits document flows."),
  }),
});

export function unverifiedCapabilityEntries() {
  return Object.entries(CAPABILITY_TABLES).flatMap(([target, tableValue]) =>
    Object.entries(tableValue.properties)
      .filter(([, entry]) => entry.verdict === null && entry.status === "unverified")
      .map(([path]) => ({ target, path })));
}

export function assertAllCapabilityTables() {
  const errors = [];
  for (const [target, tableValue] of Object.entries(CAPABILITY_TABLES)) {
    try { assertCapabilityTotality(tableValue, inventory); }
    catch (error) { errors.push(`${target}: ${error.message}`); }
  }
  if (errors.length) {
    const error = new Error(`Capability tables are not buildable:\n${errors.join("\n")}`);
    error.code = "CANVAS_CAPABILITY_INCOMPLETE";
    throw error;
  }
  return true;
}

function table(axisLowering, overrides) {
  return { axes: axisLowering, properties: Object.fromEntries(inventory.map((path) => [path, overrides[path] ?? unverified()])) };
}
function rasterRows(paths, reason) { return Object.fromEntries(paths.map((path) => [path, raster(reason)])); }
function ignoreRows(paths, reason) { return Object.fromEntries(paths.map((path) => [path, ignore(reason)])); }
