export function exportSvg(ir, output, options = {}) {
  const ids = new Map(output.nodes.map((node) => [node.id, node]));
  const definitions = output.nodes.flatMap((node) => paintLayers(node).flatMap((layer) => svgDefinitions(layer, options)));
  const children = output.nodes.flatMap((node) => paintLayers(node).map((layer) => svgNode(layer, options, inheritedClip(node, ids)))).join("\n");
  const semantics = output.root?.semantics ?? {};
  const access = semantics.decorative ? ` aria-hidden="true"` : semantics.description ? ` aria-label="${esc(semantics.description)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${output.width} ${output.height}" role="img" lang="${esc(ir.lang ?? "en")}"${access}>\n${definitions.length ? `<defs>\n${definitions.join("\n")}\n</defs>\n` : ""}${children}\n</svg>\n`;
}
function paintLayers(node) {
  const paints = Array.isArray(node.paint.fill) ? node.paint.fill.filter((paint) => paint?.enabled !== false) : [];
  if (paints.length <= 1) return [node];
  return paints.map((fill, index) => ({
    ...node,
    id: `${node.id}-paint-${index}`,
    paint: { ...node.paint, fill, stroke: index === paints.length - 1 ? node.paint.stroke : null },
    semantics: index === 0 ? node.semantics : { ...node.semantics, description: null, linkName: null, decorative: true },
  }));
}
function svgNode(node, options, clipId) {
  const { x, y, w, h, rotation } = node.geometry;
  const transform = nodeTransform(node);
  const heading = node.semantics.paragraphs?.find((paragraph) => paragraph.headingLevel)?.headingLevel;
  const role = node.semantics.landmark ?? (heading ? "heading" : null);
  const access = node.semantics.decorative ? ` aria-hidden="true"` : `${node.semantics.description || node.semantics.linkName ? ` aria-label="${esc(node.semantics.linkName ?? node.semantics.description)}"` : ""}${role ? ` role="${esc(role)}"` : ""}${heading ? ` aria-level="${heading}"` : ""}`;
  const clip = clipId ? ` clip-path="url(#clip-${escId(clipId)})"` : "";
  const blend = node.paint.blendMode && !["normal", "pass_through"].includes(node.paint.blendMode) ? ` style="mix-blend-mode:${esc(node.paint.blendMode)}"` : "";
  const filter = hasFilter(node) ? ` filter="url(#filter-${escId(node.id)})"` : "";
  const presentation = `${transform}${clip}${blend}${filter}${access}`;
  const opacity = Number(node.paint.opacity ?? 1);
  if (node.capability.verdict === "ignore") return "";
  if (node.capability.verdict === "raster") {
    const href = options.rasterHref?.(node.id);
    if (!href) throw new Error(`SVG rasterizer is required for ${node.id}.`);
    return `<image id="${esc(node.id)}" x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(href)}" opacity="${opacity}"${presentation}/>`;
  }
  if (node.type === "text") return svgText(node, presentation, opacity);
  const fill = svgFill(node, options); const stroke = color(node.paint.stroke?.fill ?? node.paint.stroke?.color) ?? "none";
  const strokeWidth = Number(node.paint.stroke?.width ?? node.paint.stroke?.thickness ?? 1);
  const strokeStyle = strokeAttributes(node.paint.stroke);
  if (node.vector) {
    const [vx, vy, vw, vh] = node.vector.viewBox;
    const vectorTransform = `translate(${x} ${y}) scale(${w / vw} ${h / vh}) translate(${-vx} ${-vy})`;
    const combined = `${nodeTransformValue(node)} ${vectorTransform}`.trim();
    return `<path id="${esc(node.id)}" d="${esc(node.vector.d)}" fill="${fill}" fill-rule="${node.vector.fillRule}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeStyle} vector-effect="non-scaling-stroke" opacity="${opacity}" transform="${combined}"${clip}${blend}${filter}${access}/>`;
  }
  if (node.type === "ellipse") return `<ellipse id="${esc(node.id)}" cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeStyle} opacity="${opacity}"${presentation}/>`;
  if (node.type === "line") return `<line id="${esc(node.id)}" x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeStyle} opacity="${opacity}"${presentation}/>`;
  const radius = Number(node.paint.cornerRadius ?? 0);
  return `<rect id="${esc(node.id)}" x="${x}" y="${y}" width="${w}" height="${h}"${radius ? ` rx="${radius}" ry="${radius}"` : ""} fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${strokeStyle} opacity="${opacity}"${presentation}/>`;
}
function inheritedClip(node, ids) { let parent = ids.get(node.parent); while (parent) { if (parent.clip) return parent.id; parent = ids.get(parent.parent); } return null; }
function svgText(node, presentation, opacity) {
  const { x, y, w, h } = node.geometry; const paragraphs = node.semantics.paragraphs?.length ? node.semantics.paragraphs : [{ from: 0, to: node.semantics.content.length }];
  const metrics = paragraphs.map((paragraph) => { const run = node.semantics.runs.find((item) => item.from <= paragraph.from && item.to > paragraph.from) ?? node.semantics.runs[0] ?? {}; return { fontSize: Number(run.fontSize ?? 16), lineHeight: Number(run.lineHeight ?? run.fontSize ?? 16) }; });
  const total = metrics.reduce((sum, item) => sum + item.lineHeight, 0); const vertical = node.semantics.textAlignVertical; let top = y; if (vertical === "center") top += (h - total) / 2; else if (["bottom", "end"].includes(vertical)) top += h - total;
  let cursorY = top;
  const body = paragraphs.map((paragraph, index) => {
    const metric = metrics[index]; const align = paragraph.effectiveAlign ?? paragraph.align ?? node.semantics.textAlign ?? "start"; const anchor = align === "center" ? "middle" : ["end", "right"].includes(align) ? "end" : "start"; const cursorX = anchor === "middle" ? x + w / 2 : anchor === "end" ? x + w : x;
    const prefix = paragraph.list ? `${paragraph.list.kind === "number" ? `${Number(paragraph.list.start ?? 1) + index}.` : paragraph.list.character ?? "•"} ` : "";
    const runs = node.semantics.runs.flatMap((run) => { const from = Math.max(run.from, paragraph.from); const to = Math.min(run.to, paragraph.to); if (to <= from) return []; const span = `<tspan${textRunAttributes(run)}>${esc(node.semantics.content.slice(from, to).replace(/\r?\n$/u, ""))}</tspan>`; return [run.link ? `<a href="${esc(run.link)}">${span}</a>` : span]; }).join("");
    cursorY += metric.fontSize; const result = `<tspan x="${cursorX}" y="${cursorY}" text-anchor="${anchor}">${esc(prefix)}${runs}</tspan>`; cursorY += metric.lineHeight - metric.fontSize; return result;
  }).join("");
  return `<text id="${esc(node.id)}" opacity="${opacity}"${presentation}>${body}</text>`;
}
function textRunAttributes(run) { return ` font-family="${esc(run.fontFamily ?? "sans-serif")}" font-size="${run.fontSize ?? 16}" font-weight="${run.weight ?? run.fontWeight ?? 400}"${run.italic || run.fontStyle === "italic" ? ` font-style="italic"` : ""}${run.underline || run.strikethrough ? ` text-decoration="${[run.underline ? "underline" : null, run.strikethrough ? "line-through" : null].filter(Boolean).join(" ")}"` : ""}${run.letterSpacing != null ? ` letter-spacing="${Number(run.letterSpacing)}"` : ""}${run.wordSpacing != null ? ` word-spacing="${Number(run.wordSpacing)}"` : ""}${run.language ? ` lang="${esc(run.language)}"` : ""} fill="${esc(color(run.fill) ?? "#000")}"`; }
function nodeTransform(node) { const value = nodeTransformValue(node); return value ? ` transform="${value}"` : ""; }
function nodeTransformValue(node) { const { x, y, w, h, rotation } = node.geometry; const flipX = node.geometry.flipX ?? node.flipX; const flipY = node.geometry.flipY ?? node.flipY; if (!rotation && !flipX && !flipY) return ""; const cx = x + w / 2; const cy = y + h / 2; return `translate(${cx} ${cy})${rotation ? ` rotate(${rotation})` : ""}${flipX || flipY ? ` scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})` : ""} translate(${-cx} ${-cy})`; }
function svgFill(node, options) { const fill = Array.isArray(node.paint.fill) ? node.paint.fill.find((item) => item?.enabled !== false) : node.paint.fill; if (fill?.type === "gradient") return `url(#fill-${escId(node.id)})`; if (fill?.type === "image") { if (!options.imageHref?.(fill.url)) throw new Error(`SVG image bytes are required for ${node.id}.`); return `url(#fill-${escId(node.id)})`; } return color(fill) ?? "none"; }
function svgDefinitions(node, options) {
  const result = []; const { x, y, w, h } = node.geometry; const fill = Array.isArray(node.paint.fill) ? node.paint.fill.find((item) => item?.enabled !== false) : node.paint.fill;
  if (fill?.type === "gradient" && ["linear", "radial"].includes(fill.gradientType ?? "linear")) { const stops = (fill.colors ?? []).map((stop) => `<stop offset="${Number(stop.position) * 100}%" stop-color="${esc(stop.color)}"/>`).join(""); if ((fill.gradientType ?? "linear") === "radial") { const center = fill.center ?? { x: .5, y: .5 }; const size = fill.size ?? { width: 1, height: 1 }; result.push(`<radialGradient id="fill-${escId(node.id)}" cx="${center.x}" cy="${center.y}" r="0.5" gradientTransform="translate(${center.x} ${center.y}) rotate(${Number(fill.rotation ?? 0)}) scale(${size.width} ${size.height}) translate(${-center.x} ${-center.y})">${stops}</radialGradient>`); } else { const angle = Number(fill.rotation ?? 0) * Math.PI / 180; const dx = Math.cos(angle) / 2; const dy = Math.sin(angle) / 2; result.push(`<linearGradient id="fill-${escId(node.id)}" x1="${.5 - dx}" y1="${.5 - dy}" x2="${.5 + dx}" y2="${.5 + dy}">${stops}</linearGradient>`); } }
  if (fill?.type === "image") { const href = options.imageHref?.(fill.url); if (href) result.push(`<pattern id="fill-${escId(node.id)}" patternUnits="objectBoundingBox" width="1" height="1"><image href="${esc(href)}" width="1" height="1" preserveAspectRatio="${fill.mode === "fit" ? "xMidYMid meet" : "xMidYMid slice"}"/></pattern>`); }
  if (node.clip) result.push(`<clipPath id="clip-${escId(node.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`);
  const effects = (Array.isArray(node.paint.effect) ? node.paint.effect : [node.paint.effect]).filter(Boolean); if (effects.length) { const primitives = effects.map((effect, index) => {
    if (effect.type === "blur") return `<feGaussianBlur stdDeviation="${Number(effect.radius ?? effect.blur ?? 0) / 2}"/>`;
    if (effect.type !== "shadow") return "";
    const spread = Number(effect.spread ?? 0); const blur = Number(effect.blur ?? 0) / 2; const dx = Number(effect.offset?.x ?? 0); const dy = Number(effect.offset?.y ?? 0); const colorValue = esc(effect.color ?? "#000000");
    if (effect.shadowType !== "inner" && spread === 0) return `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur}" flood-color="${colorValue}"/>`;
    const prefix = `s${index}`; const morphology = spread ? `<feMorphology in="SourceAlpha" operator="${spread > 0 ? "dilate" : "erode"}" radius="${Math.abs(spread)}" result="${prefix}Spread"/>` : ""; const input = spread ? `${prefix}Spread` : "SourceAlpha";
    if (effect.shadowType === "inner") return `${morphology}<feOffset in="${input}" dx="${dx}" dy="${dy}" result="${prefix}Offset"/><feGaussianBlur in="${prefix}Offset" stdDeviation="${blur}" result="${prefix}Blur"/><feComposite in="${prefix}Blur" in2="SourceAlpha" operator="out" result="${prefix}Cut"/><feFlood flood-color="${colorValue}" result="${prefix}Color"/><feComposite in="${prefix}Color" in2="${prefix}Cut" operator="in" result="${prefix}Shadow"/><feComposite in="${prefix}Shadow" in2="SourceGraphic" operator="over"/>`;
    return `${morphology}<feOffset in="${input}" dx="${dx}" dy="${dy}" result="${prefix}Offset"/><feGaussianBlur in="${prefix}Offset" stdDeviation="${blur}" result="${prefix}Blur"/><feFlood flood-color="${colorValue}" result="${prefix}Color"/><feComposite in="${prefix}Color" in2="${prefix}Blur" operator="in" result="${prefix}Shadow"/><feMerge><feMergeNode in="${prefix}Shadow"/><feMergeNode in="SourceGraphic"/></feMerge>`;
  }).join(""); if (primitives) result.push(`<filter id="filter-${escId(node.id)}" x="-100%" y="-100%" width="300%" height="300%">${primitives}</filter>`); }
  return result;
}
function hasFilter(node) { return (Array.isArray(node.paint.effect) ? node.paint.effect : [node.paint.effect]).some((effect) => effect?.type === "blur" || effect?.type === "shadow"); }
function strokeAttributes(stroke) { if (!stroke) return ""; const cap = stroke.cap && stroke.cap !== "arrow" ? ` stroke-linecap="${stroke.cap === "square" ? "square" : stroke.cap === "round" ? "round" : "butt"}"` : ""; const join = stroke.join ? ` stroke-linejoin="${stroke.join}"` : ""; const dash = stroke.dashPattern ?? stroke.dash; return `${cap}${join}${Array.isArray(dash) && dash.length ? ` stroke-dasharray="${dash.map(Number).join(" ")}"` : ""}`; }
function color(value) { return typeof value === "string" ? value : value?.color; }
function esc(value) { return String(value).replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function escId(value) { return String(value).replace(/[^A-Za-z0-9_.-]/gu, "-"); }
