// Executable ownership/evidence inventory for the non-typography mobile lane.
// A row remains unverified until every listed runtime check has retained evidence.
export const TYPOGRAPHY_ROWS = new Set([
  "nodes.text", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.fontStyle",
  "properties.letterSpacing", "properties.marks", "properties.paragraphs", "properties.strikethrough",
  "properties.text.run.fill", "properties.text.run.fontFamily", "properties.text.run.fontSize",
  "properties.text.run.italic", "properties.text.run.letterSpacing", "properties.text.run.strikethrough",
  "properties.text.run.underline", "properties.textGrowth", "properties.underline",
]);

const both = (fixture, checks, priorEvidence = []) => ({ targets: ["swift", "kotlin"], fixture, checks, priorEvidence });

export const MOBILE_NONTEXT_MATRIX = Object.freeze({
  "properties.alignItems": { targets: ["swift"], fixture: "layout-constraints", checks: ["iphone-3x", "ipad-2x"], priorEvidence: ["ios-linear-alignment-painted.png"] },
  "properties.fill": both("effects-and-fills", ["iphone-3x", "ipad-2x", "android-420dpi", "android-320dpi"], ["*-paint-matrix*"]),
  "properties.fill.gradient.linear.transformed": both("effects-and-fills", ["iphone-3x", "ipad-2x", "android-420dpi", "android-320dpi"]),
  "properties.fill.gradient.radial.transformed": both("effects-and-fills", ["iphone-3x", "ipad-2x", "android-420dpi", "android-320dpi"]),
  "properties.headingLevel": both("accessibility-semantics", ["ios-tree-iphone", "ios-tree-ipad", "android-tree-font1", "android-tree-font2"]),
  "properties.lang": both("accessibility-semantics", ["ios-tree-iphone", "ios-tree-ipad", "android-tree-font1", "android-tree-font2"]),
  "properties.modes": both("appearance-viewport", ["ios-light-dark", "ios-compact-regular", "android-light-dark", "android-narrow-wide"]),
  "properties.text.paragraph.headingLevel": both("accessibility-semantics", ["ios-tree-iphone", "ios-tree-ipad", "android-tree-font1", "android-tree-font2"]),
  "properties.varies": both("appearance-viewport", ["ios-light-dark", "ios-compact-regular", "android-light-dark", "android-narrow-wide"]),
  "properties.wrap": both("layout-constraints", ["iphone-3x", "ipad-2x", "android-420dpi", "android-320dpi"], ["*-independent-gaps.png"]),
  "root.axes": both("appearance-viewport", ["ios-light-dark", "ios-compact-regular", "android-light-dark", "android-narrow-wide"]),
  "root.lang": both("accessibility-semantics", ["ios-tree-iphone", "ios-tree-ipad", "android-tree-font1", "android-tree-font2"]),
});
