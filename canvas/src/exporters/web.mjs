import { pencilIconVectorDefinition } from "../pencil-icon-provider.mjs";

export function exportWeb(ir, options = {}) {
  const names = ir.outputs.map((output) => `${slug(output.name)}.html`);
  if (new Set(names).size !== names.length) throw Object.assign(new Error("Route names collide in the generated HTML bundle."), { code: "CANVAS_EXPORT_NAME_COLLISION" });
  const files = new Map([["styles.css", baseCss(ir)]]);
  ir.outputs.forEach((output) => files.set(`${slug(output.name)}.html`, `<!doctype html>\n<html lang="${esc(ir.lang ?? "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body>${tree(output, options)}</body></html>\n`));
  return files;
}

function tree(output, options) {
  const children = group(output.nodes);
  const root = output.root ?? { id: output.id, type: "frame", geometry: { x: 0, y: 0, w: output.width, h: output.height }, paint: {}, semantics: {}, layout: {}, variants: {} };
  const tag = ({ nav: "nav", main: "main", header: "header", footer: "footer", aside: "aside", region: "section" })[root.semantics.landmark] ?? "main";
  const rootClasses = ["canvas-output", root.layout.layout === "grid" ? "canvas-grid" : ["horizontal", "vertical"].includes(root.layout.layout) ? "canvas-flex" : ""].filter(Boolean).join(" ");
  return `<${tag} id="${esc(output.id)}" class="${rootClasses}" style="${esc(style(root, null, options))}"${semantics(root)}>${ordered(root, children).map((node) => html(node, children, root, options)).join("")}</${tag}>`;
}

function html(node, children, parent, options) {
  if (node.capability.verdict === "ignore") return "";
  if (node.capability.verdict === "raster") {
    const src = options.rasterHref?.(node.id);
    if (!src) throw new Error(`Web rasterizer is required for ${node.id}.`);
    return `<img id="${esc(node.id)}" class="node raster" src="${esc(src)}" alt="${esc(node.semantics.description ?? "")}" style="${esc(style(node, parent, options))}">`;
  }
  if (node.type === "icon") return icon(node, parent, options);
  if (node.type === "line") return line(node, parent, options);
  if (node.vector) return vector(node, parent, options);
  const text = node.type === "text" ? textContent(node) : null;
  const tag = text?.tag ?? "div";
  const content = text?.content ?? ordered(node, children).map((child) => html(child, children, node, options)).join("");
  return `<${tag} id="${esc(node.id)}" class="${classes(node)}" style="${esc(style(node, parent, options))}"${semantics(node)}>${content}</${tag}>`;
}

function icon(node, parent, options) {
  const def = pencilIconVectorDefinition(node.icon?.library, node.icon?.name, node.icon?.weight);
  if (!def?.geometry) throw new Error(`Web vector icon definition is unavailable for ${node.icon?.library ?? "unknown"}/${node.icon?.name ?? "unknown"}.`);
  const color = solid(node.paint.fill) ?? "currentColor";
  const paths = (def.layers ?? [{ geometry: def.geometry, opacity: 1 }]).map((layer) => `<path d="${esc(layer.geometry)}" ${def.paint === "stroke" ? `fill="none" stroke="${esc(color)}" stroke-width="${def.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${esc(color)}"`} opacity="${layer.opacity ?? 1}"/>`).join("");
  return `<svg id="${esc(node.id)}" class="node icon" viewBox="${def.viewBox.join(" ")}" preserveAspectRatio="xMidYMid meet" style="${esc(style(node, parent, options))}"${semantics(node, true)}>${paths}</svg>`;
}

function line(node, parent, options) {
  const stroke = node.paint.stroke ?? {}; const width = Math.max(1, Number(node.geometry.w)); const height = Math.max(1, Number(node.geometry.h));
  return `<svg id="${esc(node.id)}" class="node line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="${esc(`${style(node, parent, options)};overflow:visible`)}"${semantics(node, true)}><line x1="0" y1="0" x2="${Number(node.geometry.w)}" y2="${Number(node.geometry.h)}" stroke="${esc(solid(stroke.fill ?? stroke.color) ?? "#000")}" ${strokeAttrs(stroke)}/></svg>`;
}

function vector(node, parent, options) {
  const stroke = node.paint.stroke ?? {};
  return `<svg id="${esc(node.id)}" class="node ${esc(node.type)}" viewBox="${node.vector.viewBox.join(" ")}" preserveAspectRatio="none" style="${esc(style(node, parent, options))}"${semantics(node, true)}><path d="${esc(node.vector.d)}" fill="${esc(solid(node.paint.fill) ?? "none")}" fill-rule="${node.vector.fillRule}" stroke="${esc(solid(stroke.fill ?? stroke.color) ?? "none")}" ${strokeAttrs(stroke)} vector-effect="non-scaling-stroke"/></svg>`;
}

function strokeAttrs(stroke) {
  const width = Number(stroke.width ?? stroke.thickness ?? 1); const dash = dashArray(stroke.dash ?? stroke.dashPattern);
  return [`stroke-width="${width}"`, `stroke-linecap="${esc(stroke.cap ?? "butt")}"`, `stroke-linejoin="${esc(stroke.join ?? "miter")}"`, dash.length ? `stroke-dasharray="${dash.join(" ")}"` : "", `data-stroke-align="${esc(stroke.align ?? "center")}"`].filter(Boolean).join(" ");
}

function textContent(node) {
  const paragraphs = node.semantics.paragraphs?.length ? node.semantics.paragraphs : [{ from: 0, to: node.semantics.content.length }];
  const body = (paragraph) => node.semantics.runs.flatMap((run) => {
    const from = Math.max(run.from, paragraph.from); const to = Math.min(run.to, paragraph.to);
    return from < to ? [runHtml(run, node.semantics.content.slice(from, to), node.semantics.linkName)] : [];
  }).join("");
  const paragraph = (item) => {
    const level = Number(item.headingLevel); const tag = level >= 1 && level <= 6 ? `h${level}` : "p"; const css = paragraphCss(item);
    return `<${tag}${css ? ` style="${esc(css)}"` : ""}>${body(item)}</${tag}>`;
  };
  if (paragraphs.length === 1 && !paragraphs[0].list) {
    const item = paragraphs[0]; const level = Number(item.headingLevel); const tag = level >= 1 && level <= 6 ? `h${level}` : "p";
    return { tag, content: body(item) };
  }
  let content = "";
  for (let index = 0; index < paragraphs.length;) {
    if (!paragraphs[index].list) { content += paragraph(paragraphs[index++]); continue; }
    const orderedList = ["number", "ordered"].includes(paragraphs[index].list.kind); const tag = orderedList ? "ol" : "ul"; const items = [];
    while (index < paragraphs.length && paragraphs[index].list && ["number", "ordered"].includes(paragraphs[index].list.kind) === orderedList) {
      const item = paragraphs[index++]; items.push(`<li data-level="${Number(item.list.level ?? 0)}"${paragraphCss(item) ? ` style="${esc(paragraphCss(item))}"` : ""}>${body(item)}</li>`);
    }
    content += `<${tag}>${items.join("")}</${tag}>`;
  }
  return { tag: "div", content };
}

function paragraphCss(item) {
  const source = item.resolvedStyle ?? {}; const result = [];
  if (item.effectiveAlign ?? source.align) result.push(`text-align:${item.effectiveAlign ?? source.align}`);
  if (source.lineHeight != null) result.push(`line-height:${length(source.lineHeight)}`);
  if (source.fontSize != null) result.push(`font-size:${Number(source.fontSize)}px`);
  if (source.fontFamily) result.push(`font-family:${source.fontFamily}`);
  return result.join(";");
}

function style(node, parent, options) {
  const flowing = parent && ["grid", "horizontal", "vertical"].includes(parent.layout.layout) && node.layout.layoutPosition !== "absolute";
  const out = [];
  if (!flowing) out.push("position:absolute", `left:${node.geometry.localX ?? node.geometry.x}px`, `top:${node.geometry.localY ?? node.geometry.y}px`);
  else if (node.layout.layoutPosition === "relative") out.push("position:relative");
  if (flowing && ["grid", "horizontal", "vertical"].includes(node.layout.layout) && node.layout.layoutPosition !== "relative") out.push("position:relative");
  if (node.layout.overflow && node.layout.overflow !== "visible" && flowing) out.push("position:relative");
  out.push(`width:${node.geometry.w}px`, `height:${node.geometry.h}px`);
  for (const [key, css] of [["minWidth", "min-width"], ["maxWidth", "max-width"], ["minHeight", "min-height"], ["maxHeight", "max-height"]]) if (node.layout[key] != null) out.push(`${css}:${dimension(node.layout[key])}`);
  const bg = background(node.paint.fill, node, options);
  if (bg.image && !node.vector && node.type !== "icon") out.push(`background-image:${bg.image}`, ...bg.extra);
  else if (bg.color && !node.vector && node.type !== "icon") out.push(`background:${bg.color}`);
  if (node.paint.stroke && !node.vector && node.type !== "line") out.push(...boxStroke(node.paint.stroke));
  if (node.type === "ellipse") out.push("border-radius:50%");
  else if (node.paint.cornerRadius != null) out.push(`border-radius:${Array.isArray(node.paint.cornerRadius) ? padding(node.paint.cornerRadius) : `${Number(node.paint.cornerRadius)}px`}`);
  if (node.paint.opacity != null) out.push(`opacity:${node.paint.opacity}`);
  const effects = (Array.isArray(node.paint.effect) ? node.paint.effect : [node.paint.effect]).filter((item) => item && item.enabled !== false);
  const shadows = effects.filter((item) => item.type === "shadow").map(shadow); if (shadows.length) out.push(`box-shadow:${shadows.join(",")}`);
  const blur = effects.find((item) => item.type === "blur"); if (blur) out.push(`filter:blur(${Number(blur.radius ?? blur.blur ?? 0)}px)`);
  const backdrop = effects.find((item) => ["background_blur", "backgroundBlur"].includes(item.type)); if (backdrop) out.push(`backdrop-filter:blur(${Number(backdrop.radius ?? backdrop.blur ?? 0)}px)`);
  const paintBlend = (Array.isArray(node.paint.fill) ? node.paint.fill : [node.paint.fill]).find((item) => item && ![undefined, "normal", "pass_through"].includes(item.blendMode))?.blendMode;
  if (![undefined, "normal", "pass_through"].includes(node.paint.blendMode) || paintBlend) out.push(`mix-blend-mode:${blend(paintBlend ?? node.paint.blendMode)}`);
  if (["horizontal", "vertical"].includes(node.layout.layout)) out.push(`flex-direction:${node.layout.layout === "horizontal" ? "row" : "column"}`);
  if (node.layout.wrap) out.push("flex-wrap:wrap");
  for (const [key, css] of [["gap", "gap"], ["rowGap", "row-gap"], ["columnGap", "column-gap"]]) if (node.layout[key] !== undefined) out.push(`${css}:${node.layout[key]}px`);
  if (node.layout.padding !== undefined) out.push(`padding:${padding(node.layout.padding)}`);
  if (node.layout.justifyContent) out.push(`justify-content:${alignment(node.layout.justifyContent)}`);
  if (node.layout.alignItems) out.push(`align-items:${alignment(node.layout.alignItems)}`);
  if (node.layout.gridTemplateColumns) out.push(`grid-template-columns:${tracks(node.layout.gridTemplateColumns)}`);
  if (node.layout.gridTemplateRows) out.push(`grid-template-rows:${tracks(node.layout.gridTemplateRows)}`);
  if (node.layout.gridColumn) out.push(`grid-column:${node.layout.gridColumn}`);
  if (node.layout.gridRow) out.push(`grid-row:${node.layout.gridRow}`);
  const overflow = node.layout.overflow;
  if (overflow === "visible") out.push("overflow:visible"); else if (overflow === "clip") out.push("overflow:hidden"); else if (overflow === "scroll-x") out.push("overflow-x:auto", "overflow-y:hidden"); else if (overflow === "scroll-y") out.push("overflow-x:hidden", "overflow-y:auto"); else if (overflow === "scroll-both") out.push("overflow:auto");
  if (node.type === "text") {
    if (node.semantics.textAlign) out.push(`text-align:${node.semantics.textAlign}`);
    if (node.semantics.textAlignVertical && node.semantics.textAlignVertical !== "top") out.push("display:flex", "flex-direction:column", `justify-content:${node.semantics.textAlignVertical === "center" ? "center" : "flex-end"}`);
    if (node.semantics.lineHeight != null) out.push(`line-height:${length(node.semantics.lineHeight)}`);
    if (node.semantics.wordSpacing != null) out.push(`word-spacing:${Number(node.semantics.wordSpacing)}px`);
    if (node.semantics.textGrowth === "auto") out.push("width:max-content", "height:max-content"); else if (node.semantics.textGrowth === "fixed-width") out.push("height:max-content");
  }
  const transforms = [];
  if (node.geometry.rotation) transforms.push(`rotate(${node.geometry.rotation}deg)`);
  if (node.geometry.flipX) transforms.push("scaleX(-1)"); if (node.geometry.flipY) transforms.push("scaleY(-1)");
  if (transforms.length) out.push(`transform:${transforms.join(" ")}`);
  return out.join(";");
}

function background(fill, node, options) {
  const paints = (Array.isArray(fill) ? fill : [fill]).filter((item) => item && item.enabled !== false);
  if (!paints.length) return {};
  if (paints.length === 1 && (typeof paints[0] === "string" || ["color", "solid"].includes(paints[0].type))) return { color: solid(paints[0]) };
  const images = [], sizes = [], positions = [], repeats = [];
  for (const paint of paints.toReversed()) {
    if (typeof paint === "string" || ["color", "solid"].includes(paint.type)) { const color = solid(paint); images.push(`linear-gradient(${color},${color})`); sizes.push("100% 100%"); positions.push("0 0"); repeats.push("no-repeat"); }
    else if (paint.type === "image") { images.push(`url("${cssString(options.assetHref?.(paint.url) ?? paint.url)}")`); sizes.push(paint.mode === "fit" ? "contain" : paint.mode === "stretch" ? "100% 100%" : paint.mode === "tile" ? "auto" : "cover"); positions.push("center"); repeats.push(paint.mode === "tile" ? "repeat" : "no-repeat"); }
    else if (paint.type === "gradient") { images.push(gradient(paint, node)); sizes.push("100% 100%"); positions.push("0 0"); repeats.push("no-repeat"); }
  }
  return { image: images.join(","), extra: [`background-size:${sizes.join(",")}`, `background-position:${positions.join(",")}`, `background-repeat:${repeats.join(",")}`] };
}

function gradient(fill, node) {
  const stops = (fill.colors ?? []).filter((item) => item?.enabled !== false).map((item) => `${item.color ?? item.value} ${Number(item.position) * 100}%`).join(",");
  const kind = fill.gradientType ?? "linear"; const cx = Number(fill.center?.x ?? .5); const cy = Number(fill.center?.y ?? .5); const sx = Number(fill.size?.width ?? 1); const sy = Number(fill.size?.height ?? 1); const rotation = Number(fill.rotation ?? 0);
  if (["angular", "conic"].includes(kind)) return `conic-gradient(from ${rotation}deg at ${cx * 100}% ${cy * 100}%,${stops})`;
  const radians = rotation * Math.PI / 180;
  const definition = kind === "linear"
    ? `<linearGradient id="g" x1="${cx - Math.cos(radians) * sx / 2}" y1="${cy - Math.sin(radians) * sy / 2}" x2="${cx + Math.cos(radians) * sx / 2}" y2="${cy + Math.sin(radians) * sy / 2}">${svgStops(fill)}</linearGradient>`
    : `<radialGradient id="g" cx="${cx}" cy="${cy}" r=".5" gradientTransform="rotate(${rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})">${svgStops(fill)}</radialGradient>`;
  const shape = node.type === "ellipse" ? `<ellipse cx=".5" cy=".5" rx=".5" ry=".5" fill="url(#g)"/>` : `<rect width="1" height="1" fill="url(#g)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><defs>${definition}</defs>${shape}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function svgStops(fill) { return (fill.colors ?? []).filter((item) => item?.enabled !== false).map((item) => `<stop offset="${Number(item.position) * 100}%" stop-color="${item.color ?? item.value}"/>`).join(""); }
function boxStroke(stroke) { const width = Number(stroke.width ?? stroke.thickness ?? 1); const color = solid(stroke.fill ?? stroke.color) ?? "#000"; const kind = (stroke.dash ?? stroke.dashPattern)?.length ? "dashed" : "solid"; if (stroke.align === "outside") return [`outline:${width}px ${kind} ${color}`]; if (stroke.align === "center") return [`border:${width / 2}px ${kind} ${color}`, `outline:${width / 2}px ${kind} ${color}`]; return [`border:${width}px ${kind} ${color}`]; }
function shadow(effect) { return `${effect.shadowType === "inner" ? "inset " : ""}${Number(effect.offset?.x ?? effect.x ?? 0)}px ${Number(effect.offset?.y ?? effect.y ?? 0)}px ${Number(effect.blur ?? effect.radius ?? 0)}px ${Number(effect.spread ?? 0)}px ${effect.color ?? "#00000080"}`; }
function baseCss(ir) { const modes = Object.entries(ir.axes ?? {}).flatMap(([axis, definition]) => (definition.modes ?? []).flatMap((mode) => { const declarations = variants(ir, axis, mode.name, mode.selector); if (!declarations) return []; const media = mode.media ?? (mode.minWidth !== undefined ? `(min-width: ${mode.minWidth}px)` : null); return media ? [`@media ${normalizeMedia(media)}{${declarations}}`] : mode.selector ? [declarations] : []; })).join("\n"); return `*{box-sizing:border-box}body{margin:0}.canvas-output{position:relative;overflow:hidden}.node{min-width:0;margin:0}.canvas-grid{display:grid}.canvas-flex{display:flex}\n${modes}\n`; }
function variants(ir, axis, mode, selector = "") { return ir.outputs.flatMap((output) => [output.root, ...output.nodes].filter(Boolean).flatMap((node) => Object.entries(node.variants ?? {}).flatMap(([property, cascade]) => { const entry = cascade.findLast((item) => item.when?.[axis] === mode); const css = entry ? variantCss(property, entry.value) : null; return css ? [`#${cssEscape(node.id)}${selector ?? ""}{${css}}`] : []; }))).join(""); }
function variantCss(property, value) { const names = { fill: "background", gap: "gap", rowGap: "row-gap", columnGap: "column-gap", width: "width", height: "height", opacity: "opacity", justifyContent: "justify-content", alignItems: "align-items", minWidth: "min-width", maxWidth: "max-width", minHeight: "min-height", maxHeight: "max-height", textAlign: "text-align" }; const name = names[property]; if (!name) return null; return `${name}:${typeof value === "number" && property !== "opacity" ? `${value}px` : value}!important`; }
function runHtml(run, text, label) { const tag = run.link ? "a" : "span"; return `<${tag}${run.link ? ` href="${esc(run.link)}"${label ? ` aria-label="${esc(label)}"` : ""}` : ""}${run.language ? ` lang="${esc(run.language)}"` : ""} style="${esc(runCss(run))}">${esc(text)}</${tag}>`; }
function runCss(run) { const decoration = [run.underline && "underline", run.strikethrough && "line-through"].filter(Boolean).join(" "); return [`font-family:${run.fontFamily ?? "inherit"}`, `font-size:${run.fontSize ?? 16}px`, run.weight ?? run.fontWeight ? `font-weight:${run.weight ?? run.fontWeight}` : "", run.italic || run.fontStyle === "italic" ? "font-style:italic" : "", decoration ? `text-decoration:${decoration}` : "", run.fill ? `color:${run.fill}` : "", run.letterSpacing != null ? `letter-spacing:${Number(run.letterSpacing)}px` : "", run.wordSpacing != null ? `word-spacing:${Number(run.wordSpacing)}px` : "", run.lineHeight != null ? `line-height:${length(run.lineHeight)}` : ""].filter(Boolean).join(";"); }
function classes(node, extra = "") { return [extra, "node", node.type, node.layout.layout === "grid" ? "canvas-grid" : ["horizontal", "vertical"].includes(node.layout.layout) ? "canvas-flex" : ""].filter(Boolean).join(" "); }
function semantics(node, image = false) { if (node.semantics.decorative) return ` aria-hidden="true"`; return `${node.semantics.description ? ` aria-label="${esc(node.semantics.description)}"` : ""}${image && node.semantics.description ? ` role="img"` : ""}`; }
function alignment(value) { return ({ start: "flex-start", end: "flex-end", spaceBetween: "space-between" })[value] ?? value; }
function blend(value) { return String(value).replace(/[A-Z]/gu, (char) => `-${char.toLowerCase()}`).replace("linear-burn", "plus-darker").replace("linear-dodge", "plus-lighter"); }
function dashArray(value) { return !Array.isArray(value) || !value.length ? [] : value.length % 2 ? [...value, ...value] : value; }
function solid(fill) { return typeof fill === "string" ? fill : fill?.color ?? null; }
function tracks(value) { return (Array.isArray(value) ? value : [value]).map((item) => typeof item === "number" ? `${item}px` : item).join(" "); }
function padding(value) { return (Array.isArray(value) ? value : [value]).map((item) => `${Number(item)}px`).join(" "); }
function dimension(value) { return typeof value === "number" ? `${value}px` : value; }
function length(value) { return Number(value) <= 4 ? String(Number(value)) : `${Number(value)}px`; }
function group(nodes) { const result = new Map(); for (const node of nodes) { const list = result.get(node.parent) ?? []; list.push(node); result.set(node.parent, list); } return result; }
function ordered(node, children) { return children.get(node.id) ?? []; }
function slug(value) { const result = String(value).normalize("NFC").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, ""); if (!result) throw new Error(`Frame name ${value} cannot produce a filename.`); return result; }
function esc(value) { return String(value).replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function cssString(value) { return String(value).replace(/["\\\n\r\f]/gu, (char) => `\\${char.codePointAt(0).toString(16)} `); }
function cssEscape(value) { return String(value).replace(/[^A-Za-z0-9_-]/gu, (char) => `\\${char.codePointAt(0).toString(16)} `); }
function normalizeMedia(value) { const text = String(value).trim(); return text.startsWith("(") ? text : `(${text})`; }
