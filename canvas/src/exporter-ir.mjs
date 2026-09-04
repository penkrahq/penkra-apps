import { CAPABILITY_TABLES } from "./capability-tables.mjs";
import { isCascade, resolveCanvasDocument } from "./canvas-resolver.mjs";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";
import { flattenMarks } from "./rich-text.mjs";

export function buildExporterIR(document, request) {
  const capability = CAPABILITY_TABLES[request.capability ?? request.role];
  if (!capability) throw exportError("CANVAS_EXPORT_ROLE", `No exporter exists for role ${request.role}.`);
  const projection = request.projection ?? (["route", "ios", "android"].includes(request.role) ? "semantic" : "resolved");
  const resolved = resolveCanvasDocument(document, { modes: request.modes, bindings: request.bindings, imports: request.imports });
  const graph = createOpenPencilGraph(resolved.document);
  const sourceById = indexNodes(resolved.document.children);
  const authoredById = projection === "semantic" ? indexNodes(document.children) : sourceById;
  const documentCapability = evaluateCapabilities(documentCapabilityPaths(resolved.document, request.role), capability.properties);
  const outputs = request.frames.map((frameId, index) => {
    const frame = sourceById.get(frameId);
    if (!frame) throw exportError("CANVAS_EXPORT_FRAME", `Frame ${frameId} was not found.`);
    if (frame.role !== request.role) throw exportError("CANVAS_EXPORT_ROLE", `Frame ${frameId} carries role ${frame.role ?? "none"}, not ${request.role}.`);
    const graphNode = graph.getNode(frameId);
    const physical = frame.physical ?? physicalFor(frame.size, request.role);
    if (["slide", "page"].includes(request.role) && !physical) {
      const error = new Error(`Physical size is not declared for ${frameId}.`);
      error.code = "CANVAS_PHYSICAL_SIZE_UNDECLARED";
      throw error;
    }
    return {
      kind: request.role,
      index,
      id: frameId,
      name: frame.name ?? frameId,
      width: graphNode.width,
      height: graphNode.height,
      unit: "px",
      ...(physical ? { physical } : {}),
      ...(frame.bleed !== undefined ? { bleed: frame.bleed } : {}),
      ...(frame.safeMargin !== undefined ? { safeMargin: frame.safeMargin } : {}),
      ...(frame.folds !== undefined ? { folds: structuredClone(frame.folds) } : {}),
      root: {
        id: frameId,
        type: "frame",
        geometry: { x: 0, y: 0, localX: 0, localY: 0, w: graphNode.width, h: graphNode.height, rotation: graphNode.rotation ?? 0 },
        paint: { fill: frame.fill ?? null, stroke: frame.stroke ?? null, effect: frame.effect ?? null, cornerRadius: frame.cornerRadius ?? null, opacity: graphNode.opacity, blendMode: frame.blendMode ?? "normal" },
        semantics: { description: frame.description ?? null, decorative: frame.decorative === true, landmark: frame.landmark ?? null },
        layout: semanticLayout(frame),
        variants: semanticVariants(authoredById.get(frameId) ?? frame),
        capability: documentCapability,
      },
      nodes: collectOutputNodes(graph, sourceById, authoredById, graphNode, capability, frameId, projection, resolved.document.paragraphStyles ?? {}),
    };
  });
  const evaluatedNodes = outputs.flatMap((output) => output.nodes);
  const rasters = rasterScopes(evaluatedNodes, request);
  for (const output of outputs) output.nodes = applyRasterScopes(output.nodes, rasters);
  const nodes = outputs.flatMap((output) => output.nodes);
  const consequences = [
    ...resolved.consequences,
    ...(documentCapability.verdict === "native" ? [] : [{ node: "root", kind: documentCapability.verdict, why: documentCapability.reason }]),
    ...evaluatedNodes.filter((node) => node.capability.verdict !== "native" && node.export !== "image").map((node) => ({
      node: node.id,
      kind: node.capability.verdict,
      why: node.capability.reason,
    })),
    ...(documentCapability.ignored ?? []).map((path) => ({ node: "root", kind: "ignore", why: `${path} is intentionally omitted by the ${request.capability ?? request.role} exporter.` })),
    ...evaluatedNodes.flatMap((node) => (node.capability.ignored ?? []).map((path) => ({
      node: node.id,
      kind: "ignore",
      why: `${path} is intentionally omitted by the ${request.capability ?? request.role} exporter.`,
    }))),
  ];
  const notes = [...sourceById.values()].filter((node) => node.type === "text" && typeof node.notesFor === "string");
  return {
    projection,
    lang: document.lang ?? null,
    axes: structuredClone(document.axes ?? {}),
    modes: resolved.modes,
    outputs,
    notes,
    flows: structuredClone(document.flows ?? []),
    rasters,
    consequences,
    lowered: resolved.lowered,
    colorSpace: "sRGB",
  };
}

function collectOutputNodes(graph, sources, authored, root, capability, rootId, projection, paragraphStyles) {
  const result = [];
  const visit = (node, parent = null, z = 0) => {
    const source = sources.get(node.id) ?? {};
    const authoredSource = authored.get(node.id) ?? source;
    if (node.id !== rootId) {
      const absolute = graph.getAbsolutePosition(node.id);
      const paths = capabilityPaths(source, projection);
      const entry = source.export === "image"
        ? { verdict: "raster", reason: "Author requested image export.", paths: ["properties.export"] }
        : evaluateCapabilities(paths, capability.properties);
      result.push({
        id: node.id, type: source.type ?? node.type.toLowerCase(), parent, z,
        geometry: {
          x: absolute.x - root.x,
          y: absolute.y - root.y,
          localX: node.x,
          localY: node.y,
          w: node.width,
          h: node.height,
          rotation: node.rotation ?? 0,
        },
        paint: { fill: source.fill ?? null, stroke: source.stroke ?? null, effect: source.effect ?? null, cornerRadius: source.cornerRadius ?? null, opacity: node.opacity, blendMode: source.blendMode ?? "normal" },
        semantics: source.type === "text" ? { content: source.content ?? "", runs: richTextRuns(source, paragraphStyles), paragraphs: (source.paragraphs ?? []).map((paragraph) => ({ ...paragraph, resolvedStyle: paragraph.style ? paragraphStyles[paragraph.style] : undefined })), language: source.lang ?? source.language ?? null, description: source.description ?? null, decorative: source.decorative === true } : { description: source.description ?? null, decorative: source.decorative === true },
        layout: semanticLayout(source),
        variants: semanticVariants(authoredSource),
        export: source.export ?? "live", capability: entry,
        provenance: source.provenance ?? null, clip: source.clip === true ? node.id : null, isolation: needsIsolation(source) ? node.id : null,
      });
    }
    node.childIds.forEach((id, index) => { const child = graph.getNode(id); if (child) visit(child, node.id === rootId ? rootId : node.id, index); });
  };
  visit(root);
  return result;
}
function semanticVariants(node) {
  return Object.fromEntries(Object.entries(node).filter(([, value]) =>
    isCascade(value)));
}

function rasterScopes(nodes, request) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const scopes = new Set();
  for (const node of nodes.filter((item) => item.capability.verdict === "raster")) {
    let scope = node;
    if (hasBackgroundBlur(node.paint.effect)) while (scope.parent && byId.has(scope.parent)) {
      scope = byId.get(scope.parent);
      if (scope.isolation) break;
    }
    scopes.add(scope.id);
  }
  const subsumed = (id) => { let parent = byId.get(id)?.parent; while (parent && byId.has(parent)) { if (scopes.has(parent)) return true; parent = byId.get(parent).parent; } return false; };
  for (const node of nodes.filter((item) => item.capability.verdict === "raster")) {
    if ((Array.isArray(node.paint.effect) ? node.paint.effect : [node.paint.effect]).some(Boolean)) {
      const error = new Error(`Effect outset is not specified for raster node ${node.id}.`);
      error.code = "CANVAS_EFFECT_OUTSET_UNSPECIFIED";
      throw error;
    }
  }
  if (scopes.size) {
    const error = new Error(`Raster PPI is not specified for ${request.role}.`);
    error.code = "CANVAS_RASTER_PPI_UNSPECIFIED";
    throw error;
  }
  return [];
}
function hasBackgroundBlur(effect) {
  return (Array.isArray(effect) ? effect : [effect]).some((item) =>
    item?.type === "background_blur" || item?.type === "backgroundBlur");
}

function applyRasterScopes(nodes, rasters) {
  const scopes = new Map(rasters.map((raster) => [raster.id, raster]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const insideScope = (node) => {
    let parent = node.parent;
    while (parent && byId.has(parent)) {
      if (scopes.has(parent)) return true;
      parent = byId.get(parent).parent;
    }
    return false;
  };
  return nodes.filter((node) => !insideScope(node)).map((node) => scopes.has(node.id)
    ? { ...node, capability: { verdict: "raster", reason: scopes.get(node.id).reason ?? "Raster compositing scope." } }
    : node);
}

function capabilityPaths(node, projection) {
  const paths = new Set([`nodes.${node.type}`]);
  for (const key of ["rotation", "flipX", "flipY", "opacity", "clip", "cornerRadius", "blendMode", "description", "decorative"]) {
    if (node[key] !== undefined) paths.add(`properties.${key}`);
  }
  const fills = Array.isArray(node.fill) ? node.fill : [node.fill];
  if (node.fill !== undefined) paths.add("properties.fill");
  for (const fill of fills.filter(Boolean)) {
    if (typeof fill === "string" || fill.type === "color" || fill.type === "solid") paths.add("properties.fill.solid");
    else if (fill.type === "image") paths.add("properties.fill.image");
    else if (fill.type === "shader") paths.add("properties.fill.shader");
    else if (fill.type === "mesh_gradient") paths.add("properties.fill.gradient.mesh");
    else if (fill.type === "gradient") {
      const kind = fill.gradientType ?? "linear";
      paths.add(`properties.fill.gradient.${kind}`);
      const transformed = Number(fill.center?.x ?? 0.5) !== 0.5 || Number(fill.center?.y ?? 0.5) !== 0.5 || Number(fill.size?.width ?? 1) !== 1 || Number(fill.size?.height ?? 1) !== 1 || (kind === "radial" && Number(fill.rotation ?? 0) !== 0);
      if (transformed && ["linear", "radial"].includes(kind)) paths.add(`properties.fill.gradient.${kind}.transformed`);
    }
  }
  if (node.stroke !== undefined) {
    paths.add("properties.stroke");
    for (const key of ["width", "align", "cap", "join", "dash", "fill"]) if (node.stroke?.[key] !== undefined || (key === "width" && node.stroke?.thickness !== undefined)) paths.add(`properties.stroke.${key}`);
  }
  for (const effect of (Array.isArray(node.effect) ? node.effect : [node.effect]).filter(Boolean)) {
    paths.add("properties.effect");
    const kind = effect.type === "backgroundBlur" ? "background_blur" : effect.type;
    if (["shadow", "blur", "background_blur"].includes(kind)) paths.add(`properties.effect.${kind}`);
    if (kind === "shadow" && Number(effect.spread ?? 0) !== 0) paths.add("properties.effect.shadow.spread");
  }
  if (node.type === "text") {
    paths.add("properties.content");
    for (const key of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textAlign", "textAlignVertical", "textGrowth", "underline", "strikethrough", "lang", "headingLevel", "landmark", "linkName", "paragraphs", "marks"]) if (node[key] !== undefined) paths.add(`properties.${key}`);
    for (const mark of node.marks ?? []) {
      const mapped = { fill: "fill", weight: "weight", italic: "italic", underline: "underline", strikethrough: "strikethrough", fontFamily: "fontFamily", fontSize: "fontSize", letterSpacing: "letterSpacing", wordSpacing: "wordSpacing", lang: "language", link: "link" }[mark.type];
      if (mapped) paths.add(`properties.text.run.${mapped}`);
    }
    for (const paragraph of node.paragraphs ?? []) {
      for (const key of ["align", "style", "list", "headingLevel"]) if (paragraph[key] !== undefined) paths.add(`properties.text.paragraph.${key}`);
    }
  }
  if (node.type === "path" || node.type === "polygon") for (const key of ["geometry", "viewBox", "fillRule"]) if (node[key] !== undefined) paths.add(`properties.${key}`);
  if (projection === "semantic") for (const key of ["layout", "gap", "rowGap", "columnGap", "padding", "justifyContent", "alignItems", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow", "layoutPosition"]) if (node[key] !== undefined) paths.add(`properties.${key}`);
  return [...paths];
}

function evaluateCapabilities(paths, table) {
  const entries = paths.map((path) => ({ path, ...(table[path] ?? { verdict: "raster", reason: `Capability ${path} is absent from the table.` }) }));
  const unknown = entries.filter((entry) => entry.verdict === null || entry.status === "unverified");
  if (unknown.length) {
    const error = new Error(`Unverified capabilities: ${unknown.map((entry) => entry.path).join(", ")}.`);
    error.code = "CANVAS_CAPABILITY_UNVERIFIED";
    throw error;
  }
  const raster = entries.filter((entry) => entry.verdict === "raster");
  if (raster.length) return { verdict: "raster", reason: raster.map((entry) => `${entry.path}: ${entry.reason ?? "not native"}`).join("; "), paths };
  const native = entries.filter((entry) => entry.verdict === "native");
  if (native.length) return { verdict: "native", paths, ignored: entries.filter((entry) => entry.verdict === "ignore").map((entry) => entry.path) };
  return { verdict: "ignore", reason: entries.map((entry) => `${entry.path}: ${entry.reason ?? "ignored"}`).join("; "), paths };
}
function documentCapabilityPaths(document, role) {
  const paths = new Set([`roles.${role}`]);
  for (const key of ["canvasSchemaVersion", "version", "module", "lang", "axes", "variables", "paragraphStyles", "imports", "flows", "children"])
    if (document[key] !== undefined) paths.add(`root.${key}`);
  if (Object.keys(document.imports ?? {}).length) paths.add("relationships.import");
  if ((document.flows ?? []).length) paths.add("relationships.flow");
  const nodes = [...indexNodes(document.children).values()];
  if (nodes.some((node) => node.type === "ref")) paths.add("relationships.ref");
  if (nodes.some((node) => node.notesFor !== undefined)) paths.add("relationships.notesFor");
  return [...paths];
}
export function richTextRuns(node, paragraphStyles) {
  const content = node.content ?? "";
  const paragraphs = node.paragraphs?.length ? node.paragraphs : content ? [{ from: 0, to: content.length }] : [];
  return paragraphs.flatMap((paragraph) => {
    const paragraphContent = content.slice(paragraph.from, paragraph.to);
    const marks = (node.marks ?? []).flatMap((mark) => {
      const from = Math.max(mark.from, paragraph.from); const to = Math.min(mark.to, paragraph.to);
      return from < to ? [{ ...mark, from: from - paragraph.from, to: to - paragraph.from }] : [];
    });
    const base = { ...(paragraph.style ? paragraphStyles[paragraph.style] : {}), ...textBase(node) };
    return flattenMarks(paragraphContent, marks, base).map((run) => ({ ...run, from: run.from + paragraph.from, to: run.to + paragraph.from }));
  }).map((run) => {
    if (run.lang === undefined) return run;
    const { lang, ...rest } = run;
    return { ...rest, language: lang };
  });
}
function textBase(node) { return Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "fill", "underline", "strikethrough"].filter((key) => node[key] !== undefined).map((key) => [key, node[key]])); }
function semanticLayout(node) { return Object.fromEntries(["layout", "gap", "rowGap", "columnGap", "padding", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow", "width", "height"].filter((key) => node[key] !== undefined).map((key) => [key, node[key]])); }
function needsIsolation(node) { return Number(node.opacity ?? 1) < 1 || ![undefined, "normal", "pass_through"].includes(node.blendMode) || node.clip === true; }
function indexNodes(children, map = new Map()) { for (const node of children ?? []) { map.set(node.id, node); indexNodes(node.children, map); } return map; }
function physicalFor(size, role) { if (role === "page" && size === "a4") return { w: 210, h: 297, unit: "mm" }; if (role === "page" && size === "letter") return { w: 8.5, h: 11, unit: "in" }; return null; }
function exportError(code, message) { const error = new Error(message); error.code = code; return error; }
