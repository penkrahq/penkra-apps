import { assertCapabilityTotality, capabilityPathInventory } from "./canvas-schema.mjs";

const inventory = capabilityPathInventory();
const native = (evidence) => ({ verdict: "native", ...(evidence ? { evidence } : {}) });
const raster = (why) => ({ verdict: "raster", reason: why });
const ignore = (why) => ({ verdict: "ignore", reason: why });
const unverified = (reason) => ({ verdict: null, status: "unverified", ...(reason ? { reason } : {}) });

const EMISSION_SUPPORT = Object.freeze({
  pptx: table("select-at-export", [
    structuralRows("Schema, component, identity, geometry and selection fields are validated or lowered before DrawingML emission; the OOXML fixtures inspect their resulting slide objects."),
    layoutLoweringRows("The pinned Yoga/OpenPencil geometry fixtures measure these layout inputs before PPTX emits absolute native shapes."),
    roleRows("slide", "OOXML package fixtures emit and LibreOffice reopens the selected slide sequence."),
    { "root.lang": native("Generated DrawingML run language is inspected in the PPTX package fixture.") },
    { "relationships.import": native("Imports resolve before PPTX emission and are recorded as lowered.") },
    { "relationships.notesFor": native("Generated PPTX fixture contains a notesSlide part for notesFor.") },
    { "relationships.ref": native("Refs resolve to duplicated native shapes and are recorded as lowered.") },
    nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.line", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.cornerRadius", "properties.effect", "properties.effect.shadow", "properties.fill", "properties.fill.solid", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontStyle", "properties.fontWeight", "properties.letterSpacing", "properties.lang", "properties.marks", "properties.paragraphs", "properties.style", "properties.strikethrough", "properties.text.paragraph.align", "properties.text.paragraph.list", "properties.text.paragraph.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.link", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.weight", "properties.underline"], "Generated OOXML fixtures inspect native shapes, editable run/paragraph properties, gradients, shadow and alt text; LibreOffice reopens the package."),
    nativeRows(["nodes.icon", "properties.icon", "properties.library", "properties.weight"], "All supported icon libraries lower to native DrawingML custom geometry; the cross-format icon fixture renders the resulting slide through LibreOffice and verifies that the package contains no picture fallback."),
    nativeRows(["properties.flipX", "properties.flipY"], "PptxGenJS emits native DrawingML horizontal/vertical shape flips; the cross-format feature fixture reopens and renders the slide through LibreOffice."),
    nativeRows(["properties.fill.image", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.effect.blur", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.lineHeight", "properties.textAlign", "properties.textAlignVertical"], "The PPTX feature matrix inspects embedded image parts, transformed gradient geometry, blur/stroke/paragraph DrawingML, alignment attributes and renders the generated package through LibreOffice with positive painted-pixel and geometry assertions."),
    rasterRows(["properties.effect.shadow.spread", "properties.blendMode", "properties.clip", "properties.stroke.align", "properties.wordSpacing", "properties.text.run.wordSpacing"], "PresentationML has no interoperable primitive matching the complete Canvas behavior for this construct; the bounded affected scope is flattened at the measured 96-PPI slide policy."),
    { "properties.overflow": raster("PowerPoint has no live scrolling viewport; scroll containers are rendered as their clipped viewport.") },
    { "properties.decorative": native("Decorative nodes omit alternative text; the OOXML fixture inspects the non-visual shape properties after generation.") },
    ignoreRows(["properties.headingLevel", "properties.accessibility.landmark", "properties.accessibility.linkName", "properties.text.paragraph.headingLevel"], "PresentationML has no native heading, landmark, or link-purpose semantic for ordinary slide shapes."),
    { "properties.fill.gradient.angular": raster("DrawingML has no angular-gradient element.") },
    { "properties.fill.gradient.mesh": raster("DrawingML has no mesh-gradient element.") },
    { "properties.fill.shader": raster("DrawingML cannot execute shaders.") },
    { "properties.effect.background_blur": raster("DrawingML has no backdrop-filter effect.") },
    { "properties.textGrowth": raster("PowerPoint's text autofit algorithms are application-controlled and cannot preserve Canvas text-growth geometry deterministically; the text box is flattened when this authoring behavior is required.") },
    vectorRows("PowerPoint rendered all 20 shared vector cases after fill-rule normalization. compatibility/powerpoint-render-evidence.test.mjs measures 390274 matching interior pixels in the native application screenshot and rejects the former nonzero-hole output (9156 mismatches). Both authored rules are simplified before DrawingML emission; strokes retain authored contours. See research/powerpoint-vector-matrix-fixed and src/vector-path.test.mjs. This is native rendering evidence, not an interactive editing claim in the unactivated Office installation."),
  ], "pptx"),
  html: table("emit-conditional", [
    structuralRows("Schema, component and identity fields lower into the semantic IR; the Chrome fixture inspects the resulting hierarchy and geometry."),
    roleRows("route", "Chrome fixtures load one generated HTML file per selected route."),
    { "root.lang": native("Chrome fixture observes the generated html lang attribute.") },
    { "relationships.import": native("Imports resolve into emitted HTML/CSS and are recorded as lowered.") },
    { "relationships.notesFor": ignore("Speaker-note relationships have no meaning in a web route.") },
    { "relationships.ref": native("Refs resolve into semantic source output and are recorded as lowered.") },
    nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.accessibility.landmark", "properties.decorative", "properties.cornerRadius", "properties.fill", "properties.fill.solid", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontWeight", "properties.gap", "properties.gridColumn", "properties.gridRow", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.layout", "properties.marks", "properties.padding", "properties.paragraphs", "properties.rowGap", "properties.style", "properties.text.paragraph.headingLevel", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.weight", "properties.wrap"], "Generated HTML/CSS is loaded in Chrome; tests inspect semantic hierarchy, native grid/flex rules including asymmetric padding, responsive variants, paint, text and accessibility at three viewport widths."),
    nativeRows(["nodes.icon", "nodes.line", "properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.effect", "properties.effect.shadow", "properties.effect.blur", "properties.effect.background_blur", "properties.blendMode", "properties.clip", "properties.flipX", "properties.flipY", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.justifyContent", "properties.alignItems", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight", "properties.textAlign", "properties.textAlignVertical", "properties.lineHeight", "properties.wordSpacing", "properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "The comprehensive Chrome capability fixture inspects computed paint/effect/layout/text styles, SVG line/icon geometry and list/heading/link accessibility in the loaded export."),
    { "properties.stroke.align": raster("Chromium does not implement SVG 2 stroke-alignment for arbitrary paths; CSS borders/outlines cover boxes but cannot preserve inside/outside alignment for every Canvas path and line.") },
    nativeRows(["properties.columnGap", "properties.fontStyle", "properties.lang", "properties.letterSpacing", "properties.strikethrough", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.link", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.wordSpacing", "properties.underline"], "Chrome parses the emitted span/link language and style attributes in the semantic-source fixture."),
    { "properties.overflow": native("Generated HTML emits independent overflow-x and overflow-y rules; the browser fixture verifies computed styles and scroll extents for horizontal, vertical and two-axis containers.") },
    { "properties.fill.gradient.mesh": raster("Chromium implements neither CSS mesh gradients nor the SVG 2 mesh-gradient elements, so Canvas mesh patches have no native browser primitive.") },
    { "properties.fill.shader": raster("HTML, CSS and SVG cannot execute Canvas SkSL shaders natively; faithful output requires rendering the shader to pixels.") },
    { "properties.accessibility.linkName": native("Chrome accessibility inspection observes linkName as the accessible name of emitted rich-text anchors.") },
    nativeRows(["properties.effect.shadow.spread", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.headingLevel", "properties.icon", "properties.layoutPosition", "properties.library", "properties.textGrowth", "properties.weight"], "The comprehensive Chrome capability fixture verifies spread shadows, transformed SVG-backed gradients, heading and link AX semantics, inline provider icon paths, absolute flow overrides and intrinsic text sizing."),
    measuredVectorRows("HTML"),
  ], "html"),
  swift: table("emit-conditional", [
    structuralRows("Schema, component and identity fields lower into the semantic IR and pinned Swift fixture."),
    roleRows("ios", "The pinned Swift fixture compiles one source file per selected iOS frame."),
    { "relationships.import": native("Imports resolve into generated SwiftUI source and are recorded as lowered.") },
    { "relationships.notesFor": ignore("Speaker-note relationships have no meaning in SwiftUI source.") },
    { "relationships.ref": native("Refs resolve into generated SwiftUI constructs and are recorded as lowered.") },
    mobileCompletedRows("SwiftUI"),
    mobileRepresentationLimits("SwiftUI"),
    { "properties.fill.gradient.mesh": raster("SwiftUI target emits a rendered asset for mesh geometry.") },
    { "properties.fill.shader": raster("SwiftUI target does not ship a shader runtime.") },
    { "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset.") },
    { "properties.effect.shadow.spread": raster("SwiftUI has no native shadow-spread parameter; the complete effect is emitted as a rendered asset.") },
    ignoreRows(["properties.accessibility.landmark", "properties.accessibility.linkName"], "SwiftUI has no faithful landmark or link-purpose semantic for a view without inventing navigation behavior."),
    { "properties.overflow": native("Generated SwiftUI uses ScrollView with horizontal, vertical or combined axes and is compiled by the pinned native fixture.") },
    vectorRows("SwiftUI Path/FillStyle rendered all 20 shared vector cases on iPhone at 3x and iPad at 2x. scripts/verify-mobile-vectors.mjs measures 2079474 and 908950 matching interior pixels against full-resolution Canvas references, with two-pixel boundary and two-channel-step tolerances. Both fill rules, curves, arcs, crossings, polygons, relative commands, offset viewBoxes and open fills are covered. See research/mobile-qa/ios-vector-matrix-3x.png and ipad-vector-matrix-2x.png. Other paint/stroke/layout/semantic rows remain independently gated."),
    mobileCandidateRows("SwiftUI", true),
    swiftGridProductionRows(),
  ], "swift"),
  kotlin: table("emit-conditional", [
    structuralRows("Schema, component and identity fields lower into the semantic IR and pinned Compose fixture."),
    roleRows("android", "The pinned Compose fixture compiles one source file per selected Android frame."),
    { "relationships.import": native("Imports resolve into generated Compose source and are recorded as lowered.") },
    { "relationships.notesFor": ignore("Speaker-note relationships have no meaning in Compose source.") },
    { "relationships.ref": native("Refs resolve into generated Compose constructs and are recorded as lowered.") },
    mobileCompletedRows("Compose"),
    mobileRepresentationLimits("Compose"),
    { "properties.fill.gradient.mesh": raster("Compose target emits a rendered asset for mesh geometry.") },
    { "properties.fill.shader": raster("Compose target does not ship a shader runtime.") },
    { "properties.effect.background_blur": raster("Canvas backdrop semantics are emitted as an isolated asset.") },
    { "properties.effect.shadow.spread": raster("Compose has no native shadow-spread parameter; the complete effect is emitted as a rendered asset.") },
    ignoreRows(["properties.accessibility.landmark", "properties.accessibility.linkName"], "Compose has no faithful landmark or link-purpose semantic for a node without inventing navigation behavior."),
    { "properties.overflow": native("Generated Compose applies horizontalScroll and verticalScroll with independent remembered states and is assembled by the pinned Android fixture.") },
    vectorRows("Compose Path/PathFillType rendered all 20 shared vector cases on API 36 Pixel 8 at 420/320 dpi (2.625x/2x). scripts/verify-mobile-vectors.mjs measures 1577758 and 908950 matching interior pixels against full-resolution Canvas references, with two-pixel boundary and two-channel-step tolerances. Both fill rules, curves, arcs, crossings, polygons, relative commands, offset viewBoxes and open fills are covered. See research/mobile-qa/android-vector-matrix-420dpi.png and android-vector-matrix-320dpi.png. Other paint/stroke/layout/semantic rows remain independently gated."),
    mobileCandidateRows("Compose", false),
    composeGridProductionRows(),
  ], "kotlin"),
  svg: table("select-at-export", [
    structuralRows("Schema, component, identity, geometry and selection fields lower before standalone SVG serialization."),
    layoutLoweringRows("The pinned Yoga/OpenPencil geometry fixtures measure these layout inputs before SVG serializes absolute geometry."),
    roleRows(null, "Standalone SVG serialization accepts a subtree selected through any Canvas export role."),
    { "root.lang": native("Generated SVG carries the document language for accessible text.") },
    { "relationships.import": native("Imports resolve before SVG serialization and are recorded as lowered.") },
    { "relationships.notesFor": ignore("Standalone SVG export omits speaker-note relationships.") },
    { "relationships.ref": native("Refs resolve to SVG elements and are recorded as lowered.") },
    nativeRows(["root.axes", "properties.modes", "properties.varies", "nodes.frame", "nodes.group", "nodes.rectangle", "nodes.ellipse", "nodes.line", "nodes.ref", "nodes.text", "properties.accessibility.description", "properties.decorative", "properties.cornerRadius", "properties.fill", "properties.fill.solid", "properties.opacity", "properties.rotation", "properties.stroke", "properties.stroke.fill", "properties.stroke.width", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontWeight", "properties.marks", "properties.paragraphs", "properties.style", "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.weight"], "Generated SVG is parsed and rendered in Chromium; structural tests inspect vector elements, paint, text runs, transforms and accessibility attributes."),
    nativeRows(["nodes.icon", "properties.icon", "properties.library", "properties.weight"], "All supported icon libraries lower to standalone SVG path data; the cross-format icon fixture renders the result in Chromium and asserts that no image fallback is present."),
    nativeRows(["properties.fill.image", "properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed", "properties.effect", "properties.effect.shadow", "properties.effect.shadow.spread", "properties.effect.blur", "properties.blendMode", "properties.clip", "properties.flipX", "properties.flipY", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.text.run.link"], "The standalone writer emits native SVG patterns, gradients, filters, compositing, clipping, transforms, stroke attributes and anchors; the Chromium feature fixture parses and renders each construct without an image fallback."),
    { "properties.stroke.align": raster("SVG 1.1 supports only centered strokes; Canvas inside/outside stroke geometry is flattened because no portable standalone attribute preserves it.") },
    nativeRows(["properties.text.paragraph.align", "properties.text.paragraph.style", "properties.text.paragraph.list"], "Standalone SVG emits explicit per-paragraph x/y positions, text-anchor and list prefixes from resolved paragraph styles; Chromium layout and painted-pixel assertions exercise the result."),
    { "properties.overflow": native("Standalone SVG clips overflowing descendants to the authored viewport; full-content extraction explicitly expands the selected subtree before serialization. Chromium geometry assertions cover both modes.") },
    nativeRows(["properties.fontStyle", "properties.lang", "properties.letterSpacing", "properties.strikethrough", "properties.text.run.italic", "properties.text.run.language", "properties.text.run.letterSpacing", "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.wordSpacing", "properties.underline", "properties.wordSpacing"], "Generated SVG structural fixtures inspect the emitted run style, language, decoration and spacing attributes, and Chromium renders the file."),
    { "properties.fill.gradient.mesh": raster("SVG 1.1 has no mesh-gradient primitive in the supported profile.") },
    { "properties.fill.gradient.angular": raster("SVG 1.1 has no conic/angular-gradient paint server; the resolved paint is flattened for a portable standalone artifact.") },
    { "properties.fill.shader": raster("SVG cannot execute Canvas shaders.") },
    { "properties.effect.background_blur": raster("Portable SVG has no backdrop blur.") },
    nativeRows(["properties.accessibility.landmark", "properties.accessibility.linkName", "properties.headingLevel", "properties.text.paragraph.headingLevel"], "Standalone SVG emits ARIA landmark/heading roles, aria-level and accessible labels; Chromium accessibility-attribute assertions cover these semantics."),
    nativeRows(["properties.lineHeight", "properties.textAlign", "properties.textAlignVertical", "properties.textGrowth"], "Standalone SVG emits resolved line baselines and explicit horizontal/vertical placement inside the authored text-growth box; Chromium layout and painted-pixel assertions exercise the result."),
    measuredVectorRows("SVG"),
  ], "svg"),
});

export const CAPABILITY_TABLES = Object.freeze(Object.fromEntries(
  ["pptx", "html", "swift", "kotlin"].map((format) => [format, EMISSION_SUPPORT[format]]),
));

// PDF is DEC3's roleless N-node extraction artifact, not a module target.  This
// deliberately contains only concrete node lowering overrides; it is neither a
// role table nor a total document capability contract.  PDF primitives match
// the resolved node model, so unspecified node properties stay native.
const PDF_EXTRACTION_LOWERINGS = Object.freeze({
  "properties.overflow": raster("A static PDF has no scrolling viewport; extraction paints the authored clipped viewport."),
  "properties.fill.shader": raster("PDF cannot execute a Canvas shader program."),
  "properties.effect.background_blur": raster("PDF has no backdrop-filter primitive that can resample already-painted page content."),
});

export function capabilityTableFor(format) {
  return Object.hasOwn(CAPABILITY_TABLES, format) ? CAPABILITY_TABLES[format] : null;
}

// Private writer coverage for truthful fallback while extraction's emitters
// are completed. This is not a role or a deliverable capability contract.
export function extractionEmissionSupport(format) {
  if (format === "pdf") return { kind: "roleless-node-lowerings", properties: PDF_EXTRACTION_LOWERINGS, defaultVerdict: "native" };
  return format === "svg" ? EMISSION_SUPPORT.svg : null;
}

export function unverifiedCapabilityEntries() {
  return [
    ...Object.entries(CAPABILITY_TABLES).flatMap(([target, tableValue]) =>
    Object.entries(tableValue.properties)
      .filter(([, entry]) => entry.status === "unverified")
      .map(([path, entry]) => ({ target, path, verdict: entry.verdict }))),
  ];
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

function table(axisLowering, overrides, format) {
  const entries = mergeCapabilityRows([...overrides, physicalGeometryRows(format), staticExportFlowRows()]);
  return { axes: axisLowering, properties: Object.fromEntries(inventory.map((path) => [path, entries[path] ?? unverified()])) };
}
export function mergeCapabilityRows(groups) {
  const entries = {};
  for (const group of groups) for (const [path, entry] of Object.entries(group)) {
    if (Object.hasOwn(entries, path)) {
      throw new Error(`Conflicting capability declarations: ${path}`);
    }
    entries[path] = entry;
  }
  return entries;
}
function rasterRows(paths, reason) { return Object.fromEntries(paths.map((path) => [path, raster(reason)])); }
function ignoreRows(paths, reason) { return Object.fromEntries(paths.map((path) => [path, ignore(reason)])); }
function nativeRows(paths, evidence) { return Object.fromEntries(paths.map((path) => [path, native(evidence)])); }
function unverifiedRows(paths, reason) { return Object.fromEntries(paths.map((path) => [path, unverified(reason)])); }
function vectorRows(evidence) {
  return nativeRows(["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"], evidence);
}
function measuredVectorRows(format) {
  return nativeRows(["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"],
    `${format}: compatibility/vector-fidelity.test.mjs measures 20 path/polygon cases at 1x and 2x against Canvas: both fill rules, holes, crossings, cubic/quadratic curves, arcs, relative commands, open fills, offset viewBoxes and nonuniform scaling. Chromium SVG/HTML and Poppler PDF match 538716/2265890 interior pixels within two channel steps, excluding a two-physical-pixel antialiasing boundary. Artifacts: research/vector-fidelity-fixed-20260905. Paint, stroke, effects and other properties retain independent gates.`);
}
function mobileCandidateRows(platform, includesAlignItems) {
  return {
    ...nativeRows(["nodes.rectangle", "nodes.ellipse"], `${platform} native shape fixtures ran on the installed simulator/emulator. The 2026-09-05 shape-opacity screenshots verify 300x100 rectangles and true ellipses, opaque and translucent paint; earlier grid fixtures verify square circles and authored dimensions. See research/export-verification-2026-09-05.md. Other paint, layout, effect and accessibility property rows remain independently gated.`),
    ...nativeRows(["properties.gap", "properties.rowGap", "properties.columnGap"], `${platform} independent-gap fixture ran on the installed simulator/emulator. Fourteen measured rectangles verify horizontal and vertical stacks, wrapping rows and a two-column grid, including row/column overrides of gap, within two physical pixels at 3x and 2.625x density. See scripts/verify-mobile-gaps.mjs and research/mobile-qa/*-independent-gaps.png. Grid sizing, alignment and other layout properties retain separate gates.`),
    ...nativeRows(["nodes.frame", "nodes.group", "nodes.ref", "properties.opacity"], `${platform} six-case surface fixture verifies opaque and half-opacity frames, groups and component references with overlapping child paint. Actual iPhone 3x, iPad 2x and Android 420/320 dpi screenshots match Canvas within two channel steps outside two-pixel boundaries. This exposed and repaired dropped instance placement and legacy-only reference root paint inheritance. See scripts/verify-mobile-vectors.mjs --surfaces and research/mobile-qa/*surfaces-fixed*.png. Layout, effects, clipping and text remain independently gated.`),
    "properties.fill.solid": native(`${platform} six-case solid-color matrix verifies shorthand/full hex alpha, numeric rgba, independent paint opacity, multiplied color/paint alpha and transparent paint on iPhone 3x, iPad 2x and Android 420/320 dpi. Every uniform interior matches Canvas within two channel steps; retained native captures and the former Canvas opacity defect are checked by compatibility/mobile-paint-fidelity.test.mjs. The parent fill row remains gated for aggregate paint handling.`),
    "properties.cornerRadius": native(`${platform} rectangle and container backgrounds retain scalar and independent TL/TR/BR/BL radii, omitted array entries and proportional overlap normalization. Eight native-device regions match Skia round-rectangle coverage within two physical boundary pixels at 3x/2.625x density. See scripts/verify-mobile-corners.mjs, src/rounded-rectangle.test.mjs and research/mobile-qa/*-independent-corners.png.`),
    ...nativeRows(["properties.accessibility.description", "properties.decorative"], `${platform} native accessibility tests verify root/text/shape/group descriptions, independent visible child labels, and removal of direct/decorative-group descendant labels while preserving paint. iPhone accessibility XXL, iPad large and Android font scales 1.0/2.0 passed; see research/mobile-qa/*nested-accessibility*. These rows do not claim heading levels, language, speech quality or typography fidelity.`),
  };
}

function mobileCompletedRows(platform) {
  return {
    ...nativeRows(["nodes.line"], `${platform} completion captures measure diagonal, zero-height horizontal and zero-width vertical native lines; the diagonal has 16 stable dash components. Stroke cap/dash geometry is measured in research/mobile-capability-completion-20260908/*phone-light* and the multi-segment join controls remain in research/mobile-qa/*vector-strokes.png.`),
    ...nativeRows(["properties.stroke", "properties.stroke.width", "properties.stroke.align", "properties.stroke.cap", "properties.stroke.join", "properties.stroke.dash", "properties.stroke.fill"], `${platform} retained vector-strokes, vector-dashes, dash-edge-cases, stroke-alignment and stroke-compositing captures measure solid width/color, butt/round/square caps, miter/round/bevel joins on multi-segment paths, normalized dash arrays and center/inside/outside clipping. The completion capture additionally measures an inside stroke over a transformed gradient.`),
    ...nativeRows(["properties.fill.gradient.linear", "properties.fill.gradient.radial", "properties.fill.gradient.angular", "properties.fill.gradient.linear.transformed", "properties.fill.gradient.radial.transformed"], `${platform} stable completion captures measure stop-color regions for linear, sweep/angular and nonuniform rotated radial gradients. Centroids verify the authored linear flip/rotation and angular center/rotation; radial corner/background samples verify the authored off-center 0.3/0.65, 0.7x1.25 scale and 24-degree transform. See compatibility/mobile-capability-completion-evidence.test.mjs.`),
    ...nativeRows(["properties.rotation", "properties.flipX", "properties.flipY"], `${platform} stable completion captures measure a flipped 18-degree native gradient rectangle: the blue centroid is left of and above the red centroid, while its four-pixel inside stroke provides the transformed bounds control.`),
    ...nativeRows(["properties.clip"], `${platform} completion captures measure the overflow child at exactly 60/300 of the clipped frame width; retained rounded-clipping fixtures cover independent corner radii.`),
    ...nativeRows(["properties.alignItems", "properties.justifyContent", "properties.minWidth", "properties.maxWidth", "properties.minHeight", "properties.maxHeight"], `${platform} completion captures measure end/end linear placement and an 80x40 resolved child authored as 20x100 with minWidth 80, maxWidth 90, minHeight 30 and maxHeight 40. SwiftUI uses the resolver's fixed positions for non-start justification; Compose's native arrangement produces the same bounds.`),
    ...nativeRows(["properties.wrap"], `${platform} independent-gap capture measures wrapped line breaks plus row/column gaps; the retained flow-paint wrap controls cover start/center/end cross-axis positions.`),
    ...nativeRows(["properties.modes", "properties.varies", "root.axes"], `${platform} completion runtime was captured in light/dark phone and light wide states. Exact root/probe colors verify appearance selection and the probe changes from 60 to 140 authored points at the 450-point viewport threshold; consecutive representative captures are hash-stable.`),
  };
}

function mobileRepresentationLimits(platform) {
  const textEngine = `${platform} native text shaping does not reproduce CanvasKit line boxes and glyph rasterization exactly. Retained unregistered measurements show equal authored frame dimensions but persistent engine-originated baseline/ink deltas (including the iOS 1–2 physical-pixel y delta); the exporter therefore keeps the visual text node as one rendered asset instead of hiding the mismatch with translation or tolerance inflation.`;
  return {
    "nodes.text": raster(textEngine),
    ...Object.fromEntries([
      "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontStyle", "properties.fontWeight", "properties.letterSpacing", "properties.lineHeight",
      "properties.marks", "properties.paragraphs", "properties.strikethrough", "properties.text.run.fill", "properties.text.run.fontFamily",
      "properties.text.run.fontSize", "properties.text.run.italic", "properties.text.run.letterSpacing", "properties.text.run.strikethrough",
      "properties.text.run.underline", "properties.text.run.weight", "properties.textGrowth", "properties.underline", "properties.textAlign", "properties.textAlignVertical",
      "properties.text.paragraph.align", "properties.text.paragraph.style",
    ].map((path) => [path, raster(`${textEngine} This row changes glyph selection, ink, baseline, wrapping, or intrinsic text bounds and is therefore included in that exact text raster scope.`)])),
    "properties.wordSpacing": raster(`${platform} exposes no portable exact word-advance control matching CanvasKit; distributing additional advance across Unicode word boundaries is shaping-engine dependent.`),
    "properties.text.run.wordSpacing": raster(`${platform} exposes no portable per-run exact word-advance control matching CanvasKit, especially across bidi and script boundaries.`),
    "properties.text.run.link": raster(`${platform} link widgets introduce platform navigation, hit-testing and styling semantics that do not preserve Canvas's inert authored run exactly; the text remains visually rasterized and its spoken content is retained.`),
    "properties.text.paragraph.list": raster(`${platform} has no native rich-text paragraph-list primitive that preserves Canvas marker geometry, indentation, numbering and accessibility without synthesizing different text content.`),
    "properties.text.run.language": raster(`${platform} cannot retain per-run spoken-language ranges after the visually exact text node is emitted as one image; applying one image-level locale would collapse mixed-language content.`),
    "properties.lang": raster(`${platform} cannot attach an exact BCP-47 speech-language range to the visually rasterized text node without collapsing its authored run boundaries.`),
    "root.lang": raster(`${platform} locale environments influence formatting but do not provide document-language metadata for every rasterized descendant equivalent to Canvas's root language contract.`),
    "properties.headingLevel": raster(`${platform} cannot preserve Canvas's numbered heading hierarchy on every rasterized node: SwiftUI exposes one heading level per accessibility element and Compose exposes only an unnumbered heading boolean.`),
    "properties.text.paragraph.headingLevel": raster(`${platform} cannot preserve distinct numbered heading levels for multiple paragraphs represented by one raster image accessibility element.`),
    "nodes.icon": raster(`${platform} system-symbol catalogs do not contain stable one-to-one identities for Canvas's versioned Lucide, Phosphor and Material icon paths; a rendered asset preserves the selected library glyph exactly.`),
    "properties.icon": raster(`${platform} cannot map every Canvas icon identifier to a stable native symbol without changing its path geometry.`),
    "properties.library": raster(`${platform} native symbol libraries are not equivalent to Canvas's version-pinned icon libraries; the library choice is preserved in the rendered icon asset.`),
    "properties.weight": raster(`${platform} icon weights are library-specific path variants rather than a portable native stroke-weight parameter.`),
    "properties.fill": raster(`${platform} has no single native shape-fill primitive for Canvas's ordered multi-paint stack with independent enablement, alpha and blend isolation; the stack is composited as one exact asset.`),
    "properties.fill.image": raster(`${platform} native image views do not by themselves preserve the complete Canvas image-paint contract (crop transform, repeat, per-paint alpha/blend and shape masking) as one editable fill.`),
    "properties.effect": raster(`${platform} effect primitives use platform-specific kernels and compositing bounds that do not reproduce CanvasKit's ordered effect stack exactly.`),
    "properties.effect.shadow": raster(`${platform} native shadows use platform-specific blur kernels and clipping, so Canvas shadow radius/offset/color cannot be promised pixel-equivalent.`),
    "properties.effect.blur": raster(`${platform} native blur uses a platform-specific kernel and edge treatment that differs from CanvasKit's foreground blur.`),
    "properties.blendMode": raster(`${platform} blend modifiers isolate and composite subtrees differently from Canvas's paint/node backdrop scopes; the owning backdrop scope is rasterized to preserve the authored result.`),
  };
}
function swiftGridProductionRows() {
  const matrixEvidence = "Retained iOS native-run-02 grid matrix plus bounded follow-ups account for 39/39 unique iPhone/iPad cases, all pass with zero measured mismatches (34 + 4 + 1). The three measurements hashes are ee924c633b62fe18b9b87f53b004d23f56a9aa4450f88056cd185e70d5f138e0, 4ed5e19a8044e475d64eab031d8ddac5a7dc74d82b6e55e0aa2695b937a5f4cb and 22a934bc775b5dadac7db840a049190b96ed3c92a53b881b13a68a959e12f3de; every package records source cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11 and executable 56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065. Cases vary column/row tracks, explicit cells, sparse cells and source order.";
  const controlEvidence = "The same retained iOS run includes passing asymmetric-padding and absolute-overlay controls on iPhone Large, iPhone accessibility XXL and iPad Large, bound to measurements hash ee924c633b62fe18b9b87f53b004d23f56a9aa4450f88056cd185e70d5f138e0 and the identical source/executable hashes.";
  return {
    ...nativeRows(["properties.layout", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow"], matrixEvidence),
    ...nativeRows(["properties.padding", "properties.layoutPosition"], controlEvidence),
  };
}
function composeGridProductionRows() {
  const matrixEvidence = "Retained Android API 36 Pixel 8 production Compose grid matrix: 12 resolver-generated cases × density 420/320 × font scale 1/2 (48 captures), every row pass with zero mismatched pixels and positive per-child comparisons; measurements.json sha256=4121f668954dcfc99e933280f25b9239feeb22b55b1b61eb1980bc4ec4defa8d. Cases vary [100,180]/[180,100] columns, [60,100]/[100,60] rows, explicit (1,1)/(2,1)/(1,2)/(2,2) cells and source order. Captures and compiled-source hashes are retained under research/luna-android-grid-production-20260907 and are remeasured by compatibility/luna-android-grid-production-matrix.test.mjs.";
  const controlEvidence = "Retained translated-control-y110 uses the same production resolver/exporter with asymmetric padding [11,12,13,14] and an absolute child; both 420/font1 and 320/font2 captures pass with zero mismatches and positive per-child comparisons. translated-control-y110/measurements.json sha256=30393a5c0ba06200aa506f63c6d9c8e01da02d1cb3ae9263ddfe859e418b8f95. Its exact source, selection receipts, captures and compiled-byte hashes are revalidated by compatibility/luna-android-grid-production-translated-control-matrix.test.mjs. The original padded control's 320/font2 occlusion failure remains retained and is not counted as a pass.";
  return {
    ...nativeRows(["properties.layout", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.gridColumn", "properties.gridRow"], matrixEvidence),
    ...nativeRows(["properties.padding", "properties.layoutPosition"], controlEvidence),
  };
}
function layoutLoweringRows(evidence) {
  return nativeRows(["properties.alignItems", "properties.columnGap", "properties.gap", "properties.gridColumn", "properties.gridRow", "properties.gridTemplateColumns", "properties.gridTemplateRows", "properties.justifyContent", "properties.layout", "properties.layoutPosition", "properties.maxHeight", "properties.maxWidth", "properties.minHeight", "properties.minWidth", "properties.padding", "properties.rowGap", "properties.wrap"], evidence);
}
function structuralRows(evidence) {
  return Object.fromEntries([
    "root.module", "root.variables",
    "root.paragraphStyles", "root.imports", "root.children",
    "properties.id", "properties.type", "properties.name", "properties.x", "properties.y",
    "properties.width", "properties.height", "properties.enabled", "properties.export",
    "properties.role", "properties.size", "properties.physical", "properties.properties",
    "properties.bind", "properties.visible",
    "properties.ref", "properties.props", "properties.notesFor",
  ].map((path) => [path, native(evidence)]));
}
function roleRows(selectedRole, evidence) {
  return Object.fromEntries(["slide", "route", "ios", "android"].map((role) => [
    `roles.${role}`,
    selectedRole === null || role === selectedRole ? native(evidence) : ignore(`Role ${role} cannot occur in this exporter's module.`),
  ]));
}
function physicalGeometryRows(format) {
  if (format === "pdf") return {
    "properties.bleed": native("Generated PDF fixture measures MediaBox, CropBox, BleedBox and TrimBox against the declared point bleed."),
    "properties.folds": ignore("Fold positions are authoring guides and emit no PDF marks."),
    "properties.safeMargin": ignore("safeMargin is an authoring guide and is not a PDF page box."),
  };
  return ignoreRows(["properties.bleed", "properties.folds", "properties.safeMargin"], "Bleed boxes belong to PDF extraction; fold positions and safe margins are non-emitting authoring guides.");
}
function staticExportFlowRows() {
  return Object.fromEntries([
    "root.flows", "relationships.flow", "properties.flow.advance", "properties.flow.tap",
    "properties.flow.hover", "properties.flow.keypress",
  ].map((path) => [path, ignore("Product decision 2026-09-04: Canvas exports static designs; prototype flows are not exported and exporter IR emits an empty flows array.")]));
}
