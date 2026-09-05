import { assertCapabilityTotality, capabilityPathInventory } from "./canvas-schema.mjs";

const inventory = capabilityPathInventory();
const native = (evidence) => ({ verdict: "native", ...(evidence ? { evidence } : {}) });
const raster = (why) => ({ verdict: "raster", reason: why });
const ignore = (why) => ({ verdict: "ignore", reason: why });
const unverified = () => ({ verdict: null, status: "unverified" });

export const CAPABILITY_TABLES = Object.freeze({
  slide: table("select-at-export", {
    ...structuralRows("Schema, component, identity, geometry and selection fields are validated or lowered before DrawingML emission; the OOXML fixtures inspect their resulting slide objects."),
    ...layoutLoweringRows("The pinned Yoga/OpenPencil geometry fixtures measure these layout inputs before PPTX emits absolute native shapes."),
    ...roleRows("slide", "OOXML package fixtures emit and LibreOffice reopens the selected slide sequence."),
    "root.lang": native("Generated DrawingML run language is inspected in the PPTX package fixture."),
    "root.flows": native("Generated PPTX fixtures preserve supported flows as slide relationships."),
    "relationships.flow": native("Generated PPTX tap-flow fixture contains an internal slide relationship."),
    "relationships.import": native("Imports resolve before PPTX emission and are recorded as lowered."),
    "relationships.notesFor": native("Generated PPTX fixture contains a notesSlide part for notesFor."),
    "relationships.ref": native("Refs resolve to duplicated native shapes and are recorded as lowered."),
    ...nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.line", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.cornerRadius", "properties.effect", "properties.effect.shadow", "properties.fill", "properties.fill.solid", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontStyle", "properties.fontWeight", "properties.letterSpacing", "properties.lang", "properties.marks", "properties.paragraphs", "properties.style", "properties.strikethrough", "properties.text.paragraph.align", "properties.text.paragraph.list", "properties.text.paragraph.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.link", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.weight", "properties.underline", "properties.flow.tap"], "Generated OOXML fixtures inspect native shapes, editable run/paragraph properties, gradients, shadow, alt text and tap hyperlinks; LibreOffice reopens the package."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.effect.shadow.spread", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.flipX", "properties.flipY", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.lineHeight", "properties.wordSpacing", "properties.textAlign", "properties.textAlignVertical", "properties.text.run.wordSpacing"], "The current PPTX writer has no measured native emission for this construct."),
    ...ignoreRows(["properties.headingLevel", "properties.accessibility.landmark", "properties.accessibility.linkName", "properties.decorative", "properties.text.paragraph.headingLevel"], "PresentationML has no native heading, landmark, or link-purpose semantic for ordinary slide shapes in the supported writer."),
    "properties.fill.gradient.angular": raster("DrawingML has no angular-gradient element."),
    "properties.fill.gradient.mesh": raster("DrawingML has no mesh-gradient element."),
    "properties.fill.shader": raster("DrawingML cannot execute shaders."),
    "properties.effect.background_blur": raster("DrawingML has no backdrop-filter effect."),
    "properties.flow.hover": ignore("PowerPoint has no hover trigger."),
    "properties.flow.keypress": ignore("The supported PowerPoint interaction subset has no keypress trigger."),
    ...rasterRows(["properties.icon", "properties.library", "properties.weight", "properties.textGrowth"], "The current PPTX writer has no measured native emission for this construct."),
  }),
  page: table("select-at-export", {
    ...structuralRows("Schema, component, identity, geometry and selection fields are validated or lowered before PDF emission; the generated PDF fixture measures their resulting page objects."),
    ...layoutLoweringRows("The pinned Yoga/OpenPencil geometry fixtures measure these layout inputs before PDF emits absolute drawing operations."),
    ...roleRows("page", "PDF fixtures emit the selected page sequence with declared MediaBox dimensions."),
    "root.lang": native("The PDF/UA fixture emits the document Lang entry and passes veraPDF."),
    "root.flows": ignore("Static PDF export omits Canvas flows."),
    "relationships.flow": ignore("Static PDF export omits Canvas flows."),
    "relationships.import": native("Imports resolve before PDF emission and are recorded as lowered."),
    "relationships.notesFor": ignore("Speaker-note relationships have no meaning in static PDF output."),
    "relationships.ref": native("Refs resolve to native PDF drawing operations and are recorded as lowered."),
    ...nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.line", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.decorative", "properties.fill", "properties.fill.solid", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontWeight", "properties.lang", "properties.marks", "properties.paragraphs", "properties.style", "properties.text.paragraph.headingLevel", "properties.text.paragraph.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.language", "properties.text.run.weight"], "Generated PDF fixtures inspect page geometry, native vector operators, embedded text/fonts, language and tagged accessibility structure; PDF/A-3b and PDF/UA-1 pass the pinned veraPDF run."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.fill.gradient.mesh", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox"], "The current PDF writer has no measured native emission for this construct."),
    "properties.fill.shader": raster("PDF cannot execute Canvas shaders."),
    "properties.effect.background_blur": raster("Backdrop blur is flattened for deterministic PDF output."),
    "properties.flow.advance": ignore("Static PDF pages have no advance transition."),
    "properties.flow.hover": ignore("Static PDF has no hover state."),
    "properties.flow.keypress": ignore("Static PDF has no keypress flow."),
    "properties.flow.tap": ignore("The supported static PDF writer emits no interactive Canvas flows."),
    ...ignoreRows(["properties.accessibility.landmark", "properties.accessibility.linkName", "properties.text.run.link"], "The supported static PDF profile has no lowering for this semantic."),
    ...rasterRows(["properties.cornerRadius", "properties.flipX", "properties.flipY", "properties.opacity", "properties.rotation", "properties.fontStyle", "properties.letterSpacing", "properties.lineHeight", "properties.strikethrough", "properties.text.paragraph.align", "properties.text.paragraph.list", "properties.text.run.italic", "properties.text.run.letterSpacing", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.wordSpacing", "properties.textAlign", "properties.textAlignVertical", "properties.textGrowth", "properties.underline", "properties.wordSpacing"], "The current PDF writer has no measured native emission for this construct."),
    ...rasterRows(["properties.effect.shadow.spread", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.headingLevel", "properties.icon", "properties.library", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.dash", "properties.stroke.join", "properties.weight"], "The current PDF writer has no measured native emission for this construct."),
  }),
  route: table("emit-conditional", {
    ...structuralRows("Schema, component and identity fields lower into the semantic IR; the Chrome fixture inspects the resulting hierarchy and geometry."),
    ...roleRows("route", "Chrome fixtures load one generated HTML file per selected route."),
    "root.lang": native("Chrome fixture observes the generated html lang attribute."),
    "relationships.import": native("Imports resolve into emitted HTML/CSS and are recorded as lowered."),
    "relationships.notesFor": ignore("Speaker-note relationships have no meaning in a web route."),
    "relationships.ref": native("Refs resolve into semantic source output and are recorded as lowered."),
    ...nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.accessibility.landmark", "properties.decorative", "properties.cornerRadius", "properties.fill", "properties.fill.solid", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontWeight", "properties.gap", "properties.gridColumn", "properties.gridRow", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.layout", "properties.marks", "properties.paragraphs", "properties.rowGap", "properties.style", "properties.text.paragraph.headingLevel", "properties.text.paragraph.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.weight", "properties.wrap"], "Generated HTML/CSS is loaded in Chrome; tests inspect semantic hierarchy, native grid/flex rules, responsive variants, paint, text and accessibility at three viewport widths."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.effect.background_blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.flipX", "properties.flipY", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.padding", "properties.justifyContent", "properties.alignItems", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.italic", "properties.text.run.underline", "properties.text.run.strikethrough", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current HTML/CSS writer has no measured live emission for this construct."),
    ...nativeRows(["properties.columnGap", "properties.fontStyle", "properties.lang", "properties.letterSpacing", "properties.strikethrough", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.link", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.wordSpacing", "properties.underline"], "Chrome parses the emitted span/link language and style attributes in the semantic-source fixture."),
    "properties.fill.gradient.mesh": raster("CSS has no portable mesh-gradient primitive."),
    "properties.fill.shader": raster("Static HTML/CSS export does not ship a shader runtime."),
    "properties.accessibility.linkName": ignore("No link-purpose field is emitted without a link element."),
    ...rasterRows(["properties.effect.shadow.spread", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.headingLevel", "properties.icon", "properties.layoutPosition", "properties.library", "properties.textGrowth", "properties.weight"], "The current HTML/CSS writer has no measured live emission for this construct."),
  }),
  ios: table("emit-conditional", {
    ...structuralRows("Schema, component and identity fields lower into the semantic IR and pinned Swift fixture."),
    ...roleRows("ios", "The pinned Swift fixture compiles one source file per selected iOS frame."),
    "relationships.import": native("Imports resolve into generated SwiftUI source and are recorded as lowered."),
    "relationships.notesFor": ignore("Speaker-note relationships have no meaning in SwiftUI source."),
    "relationships.ref": native("Refs resolve into generated SwiftUI constructs and are recorded as lowered."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.rotation", "properties.flipX", "properties.flipY", "properties.stroke", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.fill", "properties.padding", "properties.justifyContent", "properties.columnGap", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current SwiftUI writer has no measured live emission for this construct."),
    "properties.fill.gradient.mesh": raster("SwiftUI target emits a rendered asset for mesh geometry."),
    "properties.fill.shader": raster("SwiftUI target does not ship a shader runtime."),
    "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset."),
    "properties.flow.hover": ignore("Touch-first iOS output does not expose Canvas hover flows."),
  }),
  android: table("emit-conditional", {
    ...structuralRows("Schema, component and identity fields lower into the semantic IR and pinned Compose fixture."),
    ...roleRows("android", "The pinned Compose fixture compiles one source file per selected Android frame."),
    "relationships.import": native("Imports resolve into generated Compose source and are recorded as lowered."),
    "relationships.notesFor": ignore("Speaker-note relationships have no meaning in Compose source."),
    "relationships.ref": native("Refs resolve into generated Compose constructs and are recorded as lowered."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.rotation", "properties.flipX", "properties.flipY", "properties.stroke", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.fill", "properties.padding", "properties.justifyContent", "properties.alignItems", "properties.columnGap", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The current Compose writer has no measured live emission for this construct."),
    "properties.fill.gradient.mesh": raster("Compose target emits a rendered asset for mesh geometry."),
    "properties.fill.shader": raster("Compose target does not ship a shader runtime."),
    "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset."),
    "properties.flow.hover": ignore("Touch-first Android output does not expose Canvas hover flows."),
  }),
  svg: table("select-at-export", {
    ...structuralRows("Schema, component, identity, geometry and selection fields lower before standalone SVG serialization."),
    ...layoutLoweringRows("The pinned Yoga/OpenPencil geometry fixtures measure these layout inputs before SVG serializes absolute geometry."),
    ...roleRows(null, "Standalone SVG serialization accepts a subtree selected through any Canvas export role."),
    "root.lang": native("Generated SVG carries the document language for accessible text."),
    "root.flows": ignore("Standalone SVG export omits document flows."),
    "relationships.flow": ignore("Standalone SVG export omits document flows."),
    "relationships.import": native("Imports resolve before SVG serialization and are recorded as lowered."),
    "relationships.notesFor": ignore("Standalone SVG export omits speaker-note relationships."),
    "relationships.ref": native("Refs resolve to SVG elements and are recorded as lowered."),
    ...nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.line", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.decorative", "properties.cornerRadius", "properties.fill", "properties.fill.solid", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontWeight", "properties.marks", "properties.paragraphs", "properties.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.weight"], "Generated SVG is parsed and rendered in Chromium; structural tests inspect vector elements, paint, text runs, transforms and accessibility attributes."),
    ...rasterRows(["nodes.path", "nodes.polygon", "nodes.icon", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.fillRule", "properties.geometry", "properties.viewBox", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.text.run.italic", "properties.text.run.underline", "properties.text.run.strikethrough", "properties.text.run.letterSpacing", "properties.text.run.wordSpacing", "properties.text.run.language", "properties.text.run.link", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The supported SVG writer profile has no measured native emission for this construct."),
    ...nativeRows(["properties.fontStyle", "properties.lang", "properties.letterSpacing", "properties.strikethrough", "properties.stroke.width", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.wordSpacing", "properties.underline", "properties.wordSpacing"], "Generated SVG structural fixtures inspect the emitted run style, language, decoration, spacing and stroke-width attributes, and Chromium renders the file."),
    "properties.fill.gradient.mesh": raster("SVG 1.1 has no mesh-gradient primitive in the supported profile."),
    "properties.fill.shader": raster("SVG cannot execute Canvas shaders."),
    "properties.effect.background_blur": raster("Portable SVG has no backdrop blur."),
    "properties.flow.advance": ignore("Standalone SVG export omits document flows."),
    "properties.flow.tap": ignore("Standalone SVG export omits document flows."),
    "properties.flow.hover": ignore("Standalone SVG export omits document flows."),
    "properties.flow.keypress": ignore("Standalone SVG export omits document flows."),
    ...ignoreRows(["properties.accessibility.landmark", "properties.accessibility.linkName", "properties.headingLevel", "properties.text.paragraph.headingLevel"], "The supported standalone SVG profile does not emit this document semantic."),
    ...rasterRows(["properties.effect.shadow.spread", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.flipX", "properties.flipY", "properties.icon", "properties.library", "properties.lineHeight", "properties.textAlign", "properties.textAlignVertical", "properties.textGrowth", "properties.weight"], "The supported SVG writer profile has no measured native emission for this construct."),
  }),
});

export const PAGE_PROFILE_DELTAS = Object.freeze({
  none: Object.freeze({ status: "verified", requires: [], errors: [], properties: {} }),
  "PDF/A-3": Object.freeze({
    status: "verified",
    evidence: "Pinned veraPDF 1.30.2 validates the generated PDF/A-3b fixture.",
    requires: ["embedded-fonts", "output-intent", "no-external-references"],
    errors: ["unembeddable-font", "external-reference"],
    properties: {},
  }),
  "PDF/UA-1": Object.freeze({
    status: "verified",
    evidence: "Pinned veraPDF 1.30.2 validates the generated PDF/UA-1 fixture and its tag tree.",
    requires: ["description-on-every-non-decorative-node", "document-tree-order", "document-language", "heading-levels", "tagged-content"],
    errors: ["missing-description"],
    properties: {},
  }),
  "PDF/X-4": Object.freeze({
    status: "unverified",
    requires: ["embedded-fonts", "bleed-box", "trim-box", "output-intent"],
    errors: ["unembeddable-font", "missing-bleed"],
    properties: {},
  }),
});

export function capabilityTableFor(role, profile = null) {
  const base = CAPABILITY_TABLES[role];
  if (!base) return null;
  if (role !== "page") return base;
  const key = profile ?? "none";
  const delta = PAGE_PROFILE_DELTAS[key];
  if (!delta) {
    const error = new Error(`Unknown PDF profile ${String(profile)}.`);
    error.code = "CANVAS_PDF_PROFILE_UNKNOWN";
    throw error;
  }
  return { ...base, profile: key, requirements: delta, properties: { ...base.properties, ...delta.properties } };
}

export function unverifiedCapabilityEntries() {
  return [
    ...Object.entries(CAPABILITY_TABLES).flatMap(([target, tableValue]) =>
    Object.entries(tableValue.properties)
      .filter(([, entry]) => entry.status === "unverified")
      .map(([path, entry]) => ({ target, path, verdict: entry.verdict }))),
    ...Object.entries(PAGE_PROFILE_DELTAS).flatMap(([profile, entry]) => entry.status === "unverified"
      ? [{ target: `page:${profile}`, path: "profile", verdict: null }]
      : []),
  ];
}

export function assertAllCapabilityTables() {
  const errors = [];
  for (const [target, tableValue] of Object.entries(CAPABILITY_TABLES)) {
    try { assertCapabilityTotality(tableValue, inventory); }
    catch (error) { errors.push(`${target}: ${error.message}`); }
  }
  for (const [profile, delta] of Object.entries(PAGE_PROFILE_DELTAS)) {
    try { assertCapabilityTotality(capabilityTableFor("page", profile), inventory); }
    catch (error) { errors.push(`page:${profile}: ${error.message}`); }
    if (delta.status === "unverified") errors.push(`page:${profile}: profile evidence is unverified`);
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
function nativeRows(paths, evidence) { return Object.fromEntries(paths.map((path) => [path, native(evidence)])); }
function layoutLoweringRows(evidence) {
  return nativeRows(["properties.alignItems", "properties.columnGap", "properties.gap", "properties.gridColumn", "properties.gridRow", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.justifyContent", "properties.layout", "properties.layoutPosition", "properties.maxHeight", "properties.maxWidth", "properties.minHeight", "properties.minWidth", "properties.padding", "properties.rowGap", "properties.wrap"], evidence);
}
function structuralRows(evidence) {
  return Object.fromEntries([
    "root.canvasSchemaVersion", "root.version", "root.module", "root.variables",
    "root.paragraphStyles", "root.imports", "root.children",
    "properties.id", "properties.type", "properties.name", "properties.x", "properties.y",
    "properties.width", "properties.height", "properties.enabled", "properties.export",
    "properties.role", "properties.size", "properties.physical", "properties.properties",
    "properties.bind", "properties.visible",
    "properties.ref", "properties.props", "properties.style", "properties.notesFor",
  ].map((path) => [path, native(evidence)]));
}
function roleRows(target, evidence) {
  return Object.fromEntries(["slide", "page", "route", "ios", "android"].map((role) => [
    `roles.${role}`,
    target === null || role === target ? native(evidence) : ignore(`Role ${role} cannot occur in this exporter's module.`),
  ]));
}
