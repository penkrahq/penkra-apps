export function exportSwiftUI(ir, options = {}) {
  const files = new Map([["_canvas/FlowLayout.swift", swiftFlowHelper]]);
  for (const output of ir.outputs) files.set(`${sourceName(output.name)}.swift`, swiftScreen(output, options));
  return files;
}

export function exportCompose(ir, options = {}) {
  const files = new Map([["_canvas/CanvasFlowLayout.kt", composeFlowHelper]]);
  for (const output of ir.outputs) files.set(`${sourceName(output.name)}.kt`, composeScreen(output, options));
  return files;
}

function swiftScreen(output, options) {
  const children = groupChildren(output.nodes);
  const root = output.root ?? rootNode(output);
  return `import SwiftUI\n\npublic struct ${sourceName(output.name)}: View {\n  public init() {}\n  public var body: some View {\n${swiftContainer(root, orderedChildren(root, children), children, options, 2, true)}\n      .accessibilityElement(children: .contain)\n  }\n}\n`;
}

function swiftNode(node, children, options, depth, parentLayout) {
  if (node.capability.verdict === "ignore") return "";
  const indent = "  ".repeat(depth);
  const position = swiftGeometry(node, parentLayout);
  const access = swiftAccessibility(node);
  if (node.capability.verdict === "raster") {
    const data = options.rasterData?.(node.id);
    if (!data) throw new Error(`SwiftUI rasterizer is required for ${node.id}.`);
    return `${indent}CanvasRasterImage(base64: ${JSON.stringify(data)})${position}${access}`;
  }
  if (node.type === "text") return `${indent}${swiftText(node)}${position}${access}`;
  const descendants = orderedChildren(node, children);
  if (descendants.length || ["frame", "group", "ref"].includes(node.type)) return swiftContainer(node, descendants, children, options, depth, false, position, access);
  const shape = node.type === "ellipse" ? "Ellipse()" : `RoundedRectangle(cornerRadius: ${n(Number(node.paint.cornerRadius ?? 0))})`;
  return `${indent}${shape}.fill(${swiftColor(solid(node.paint.fill))}).opacity(${n(node.paint.opacity ?? 1)})${position}${access}`;
}

function swiftContainer(node, descendants, children, options, depth, root = false, geometry = "", access = "") {
  const indent = "  ".repeat(depth);
  const inner = descendants.map((child) => swiftNode(child, children, options, depth + 1, node.layout.layout || (node.layout.wrap ? "wrap" : "none"))).filter(Boolean).join("\n");
  const gap = n(Number(node.layout.gap ?? node.layout.rowGap ?? 0));
  const columns = Math.max(1, node.layout.gridTemplateColumns?.length ?? 1);
  let open;
  if (node.layout.layout === "grid") open = `LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ${gap}), count: ${columns}), spacing: ${gap})`;
  else if (node.layout.wrap) open = `FlowLayout(spacing: ${gap})`;
  else if (node.layout.layout === "horizontal") open = `HStack(alignment: ${swiftAlignment(node.layout.alignItems)}, spacing: ${gap})`;
  else if (node.layout.layout === "vertical") open = `VStack(alignment: ${swiftHorizontalAlignment(node.layout.alignItems)}, spacing: ${gap})`;
  else open = "ZStack(alignment: .topLeading)";
  const background = solid(node.paint.fill) ? `.background(${swiftColor(solid(node.paint.fill))})` : "";
  const rootFrame = root ? `.frame(width: ${n(node.geometry.w)}, height: ${n(node.geometry.h)}, alignment: .topLeading)` : "";
  return `${indent}${open} {\n${inner}\n${indent}}${rootFrame}${background}.opacity(${n(node.paint.opacity ?? 1)})${geometry}${access}`;
}

function swiftText(node) {
  const runs = node.semantics.runs.length ? node.semantics.runs : [{ from: 0, to: node.semantics.content.length }];
  return runs.map((run) => {
    const text = node.semantics.content.slice(run.from, run.to);
    let result = `Text(${JSON.stringify(text)})`;
    result += `.font(.custom(${JSON.stringify(run.fontFamily ?? "Inter")}, size: ${n(run.fontSize ?? 16)}, relativeTo: .body).weight(${swiftWeight(run.weight ?? run.fontWeight)}))`;
    result += `.foregroundColor(${swiftColor(run.fill ?? "#000000")})`;
    if (run.italic || run.fontStyle === "italic") result += ".italic()";
    if (run.underline) result += ".underline()";
    if (run.strikethrough) result += ".strikethrough()";
    return result;
  }).join(" + ");
}

function swiftGeometry(node, parentLayout) {
  const base = `.frame(width: ${n(node.geometry.w)}, height: ${n(node.geometry.h)}, alignment: .topLeading)`;
  if (["grid", "horizontal", "vertical", "wrap"].includes(parentLayout)) return base;
  return `${base}.position(x: ${n(node.geometry.localX + node.geometry.w / 2)}, y: ${n(node.geometry.localY + node.geometry.h / 2)})`;
}

function swiftAccessibility(node) {
  let value = node.semantics.description ? `.accessibilityLabel(${JSON.stringify(node.semantics.description)})` : node.semantics.decorative ? ".accessibilityHidden(true)" : "";
  if (node.type === "text" && node.semantics.paragraphs.some((paragraph) => paragraph.headingLevel)) value += ".accessibilityAddTraits(.isHeader)";
  return value;
}

function composeScreen(output, options) {
  const children = groupChildren(output.nodes);
  const root = output.root ?? rootNode(output);
  return `package generated.canvas\n\nimport android.graphics.BitmapFactory\nimport android.util.Base64\nimport androidx.compose.foundation.Image\nimport androidx.compose.foundation.background\nimport androidx.compose.foundation.layout.*\nimport androidx.compose.foundation.lazy.grid.GridCells\nimport androidx.compose.foundation.lazy.grid.LazyVerticalGrid\nimport androidx.compose.foundation.shape.CircleShape\nimport androidx.compose.foundation.shape.RoundedCornerShape\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.ui.Modifier\nimport androidx.compose.ui.draw.alpha\nimport androidx.compose.ui.graphics.Color\nimport androidx.compose.ui.graphics.asImageBitmap\nimport androidx.compose.ui.semantics.contentDescription\nimport androidx.compose.ui.semantics.heading\nimport androidx.compose.ui.semantics.semantics\nimport androidx.compose.ui.text.SpanStyle\nimport androidx.compose.ui.text.buildAnnotatedString\nimport androidx.compose.ui.text.withStyle\nimport androidx.compose.ui.text.font.FontStyle\nimport androidx.compose.ui.text.font.FontWeight\nimport androidx.compose.ui.text.style.TextDecoration\nimport androidx.compose.ui.unit.dp\nimport androidx.compose.ui.unit.sp\n\n@OptIn(ExperimentalLayoutApi::class)\n@Composable fun ${sourceName(output.name)}() {\n${composeContainer(root, orderedChildren(root, children), children, options, 1, true)}\n}\n`;
}

function composeNode(node, children, options, depth, parentLayout) {
  if (node.capability.verdict === "ignore") return "";
  const indent = "  ".repeat(depth);
  const modifier = composeModifier(node, parentLayout);
  if (node.capability.verdict === "raster") {
    const data = options.rasterData?.(node.id);
    if (!data) throw new Error(`Compose rasterizer is required for ${node.id}.`);
    const name = `bytes${identifier(node.id)}`;
    return `${indent}run { val ${name} = Base64.decode(${JSON.stringify(data)}, Base64.DEFAULT); Image(BitmapFactory.decodeByteArray(${name}, 0, ${name}.size).asImageBitmap(), null, ${modifier}) }`;
  }
  if (node.type === "text") return `${indent}Text(${composeText(node)}, modifier = ${modifier})`;
  const descendants = orderedChildren(node, children);
  if (descendants.length || ["frame", "group", "ref"].includes(node.type)) return composeContainer(node, descendants, children, options, depth, false, modifier);
  const shape = node.type === "ellipse" ? "CircleShape" : `RoundedCornerShape(${n(Number(node.paint.cornerRadius ?? 0))}.dp)`;
  return `${indent}Spacer(${modifier}.background(${composeColor(solid(node.paint.fill))}, ${shape}).alpha(${kotlinFloat(node.paint.opacity ?? 1)}))`;
}

function composeContainer(node, descendants, children, options, depth, root = false, suppliedModifier = "Modifier") {
  const indent = "  ".repeat(depth);
  const gap = n(Number(node.layout.gap ?? node.layout.rowGap ?? 0));
  const content = descendants.map((child) => composeNode(child, children, options, depth + 1, node.layout.layout || (node.layout.wrap ? "wrap" : "none"))).filter(Boolean).join("\n");
  let modifier = root ? `Modifier.size(${n(node.geometry.w)}.dp, ${n(node.geometry.h)}.dp)` : suppliedModifier;
  if (solid(node.paint.fill)) modifier += `.background(${composeColor(solid(node.paint.fill))})`;
  if (node.paint.opacity != null) modifier += `.alpha(${kotlinFloat(node.paint.opacity)})`;
  if (node.layout.layout === "grid") {
    const columns = Math.max(1, node.layout.gridTemplateColumns?.length ?? 1);
    return `${indent}LazyVerticalGrid(columns = GridCells.Fixed(${columns}), modifier = ${modifier}, horizontalArrangement = Arrangement.spacedBy(${gap}.dp), verticalArrangement = Arrangement.spacedBy(${gap}.dp)) {\n${descendants.map((child) => `${indent}  item {\n${composeNode(child, children, options, depth + 2, "grid")}\n${indent}  }`).join("\n")}\n${indent}}`;
  }
  if (node.layout.wrap) return `${indent}FlowRow(modifier = ${modifier}, horizontalArrangement = Arrangement.spacedBy(${gap}.dp), verticalArrangement = Arrangement.spacedBy(${gap}.dp)) {\n${content}\n${indent}}`;
  if (node.layout.layout === "horizontal") return `${indent}Row(modifier = ${modifier}, horizontalArrangement = Arrangement.spacedBy(${gap}.dp)) {\n${content}\n${indent}}`;
  if (node.layout.layout === "vertical") return `${indent}Column(modifier = ${modifier}, verticalArrangement = Arrangement.spacedBy(${gap}.dp)) {\n${content}\n${indent}}`;
  return `${indent}Box(modifier = ${modifier}) {\n${content}\n${indent}}`;
}

function composeText(node) {
  const runs = node.semantics.runs.length ? node.semantics.runs : [{ from: 0, to: node.semantics.content.length }];
  const body = runs.map((run) => {
    const decorations = [run.underline ? "TextDecoration.Underline" : null, run.strikethrough ? "TextDecoration.LineThrough" : null].filter(Boolean);
    const style = [`color = ${composeColor(run.fill ?? "#000000")}`, `fontSize = ${n(run.fontSize ?? 16)}.sp`, `fontWeight = FontWeight(${Number(run.weight ?? run.fontWeight ?? 400)})`, (run.italic || run.fontStyle === "italic") ? "fontStyle = FontStyle.Italic" : null, decorations.length ? `textDecoration = ${decorations.length === 1 ? decorations[0] : `TextDecoration.combine(listOf(${decorations.join(", ")}))`}` : null].filter(Boolean).join(", ");
    return `withStyle(SpanStyle(${style})) { append(${JSON.stringify(node.semantics.content.slice(run.from, run.to))}) }`;
  }).join("; ");
  return `buildAnnotatedString { ${body} }`;
}

function composeModifier(node, parentLayout) {
  let value = "Modifier";
  if (!["grid", "horizontal", "vertical", "wrap"].includes(parentLayout)) value += `.offset(${n(node.geometry.localX)}.dp, ${n(node.geometry.localY)}.dp)`;
  value += `.size(${n(node.geometry.w)}.dp, ${n(node.geometry.h)}.dp)`;
  if (node.semantics.description) value += `.semantics { contentDescription = ${JSON.stringify(node.semantics.description)} }`;
  if (node.type === "text" && node.semantics.paragraphs.some((paragraph) => paragraph.headingLevel)) value += ".semantics { heading() }";
  return value;
}

function groupChildren(nodes) { const map = new Map(); for (const node of nodes) { const list = map.get(node.parent) ?? []; list.push(node); map.set(node.parent, list); } return map; }
function orderedChildren(node, children) { return children.get(node.id) ?? []; }
function rootNode(output) { return { id: output.id, type: "frame", geometry: { x: 0, y: 0, localX: 0, localY: 0, w: output.width, h: output.height }, paint: {}, semantics: {}, layout: {} }; }
function sourceName(value) { const name = String(value).normalize("NFC").replace(/[^A-Za-z0-9]+/gu, " ").trim().split(/\s+/u).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(""); if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(name)) throw new Error(`Frame name ${value} is not a safe source identifier.`); return name; }
function identifier(value) { const result = String(value).replace(/[^A-Za-z0-9]/gu, ""); return result ? result[0].toUpperCase() + result.slice(1) : "Raster"; }
function n(value) { return Number(Number(value).toFixed(3)); }
function kotlinFloat(value) { const rounded = Number(Number(value).toFixed(3)); return Number.isInteger(rounded) ? `${rounded}.0f` : `${rounded}f`; }
function solid(fill) { return typeof fill === "string" ? fill : fill?.color ?? null; }
function swiftColor(value) { const rgba = rgbaHex(value); return `Color(red: ${rgba.r}, green: ${rgba.g}, blue: ${rgba.b}, opacity: ${rgba.a})`; }
function composeColor(value) { return `Color(0x${rgbaHex(value).argb})`; }
function rgbaHex(value) { const raw = String(value ?? "#00000000").replace(/^#/u, ""); const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") + "FF" : raw.length === 6 ? raw + "FF" : raw.padEnd(8, "F").slice(0, 8); const parts = [0,2,4,6].map((i) => parseInt(hex.slice(i, i + 2), 16)); return { r: n(parts[0] / 255), g: n(parts[1] / 255), b: n(parts[2] / 255), a: n(parts[3] / 255), argb: `${hex.slice(6,8)}${hex.slice(0,6)}`.toUpperCase() }; }
function swiftWeight(weight) { const value = Number(weight ?? 400); if (value >= 700) return ".bold"; if (value >= 600) return ".semibold"; if (value >= 500) return ".medium"; return ".regular"; }
function swiftAlignment(value) { return value === "end" ? ".bottom" : value === "center" ? ".center" : ".top"; }
function swiftHorizontalAlignment(value) { return value === "end" ? ".trailing" : value === "center" ? ".center" : ".leading"; }

const swiftFlowHelper = `import SwiftUI\n#if canImport(UIKit)\nimport UIKit\n#elseif canImport(AppKit)\nimport AppKit\n#endif\npublic struct CanvasRasterImage: View { let base64: String; public init(base64: String) { self.base64 = base64 }; @ViewBuilder public var body: some View {\n#if canImport(UIKit)\n if let data = Data(base64Encoded: base64), let image = UIImage(data: data) { Image(uiImage: image).resizable() }\n#elseif canImport(AppKit)\n if let data = Data(base64Encoded: base64), let image = NSImage(data: data) { Image(nsImage: image).resizable() }\n#endif\n} }\npublic struct FlowLayout: Layout { public let spacing: CGFloat; public init(spacing: CGFloat = 0) { self.spacing = spacing }\n public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize { let width = proposal.width ?? 0; var x: CGFloat = 0; var y: CGFloat = 0; var row: CGFloat = 0; for view in subviews { let size = view.sizeThatFits(.unspecified); if x > 0 && x + size.width > width { x = 0; y += row + spacing; row = 0 }; x += size.width + spacing; row = max(row, size.height) }; return CGSize(width: width, height: y + row) }\n public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) { var x=bounds.minX; var y=bounds.minY; var row: CGFloat=0; for view in subviews { let size=view.sizeThatFits(.unspecified); if x>bounds.minX && x+size.width>bounds.maxX { x=bounds.minX; y += row + spacing; row=0 }; view.place(at: CGPoint(x:x,y:y), proposal: ProposedViewSize(size)); x += size.width + spacing; row=max(row,size.height) } } }\n`;
const composeFlowHelper = `package generated.canvas\nimport androidx.compose.foundation.layout.ExperimentalLayoutApi\nimport androidx.compose.foundation.layout.FlowRow\nimport androidx.compose.runtime.Composable\n@OptIn(ExperimentalLayoutApi::class)\n@Composable fun CanvasFlowLayout(content: @Composable () -> Unit) { FlowRow { content() } }\n`;
