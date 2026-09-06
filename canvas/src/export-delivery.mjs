import { join, normalize } from "node:path";

export function exportRoleForFormat(format) {
  const role = { pptx: "slide", html: "route", swift: "ios", kotlin: "android" }[format];
  if (!role) {
    const error = new Error(`No deliverable exporter exists for format ${format}; PDF uses documents.extract.`);
    error.code = "CANVAS_EXPORT_FORMAT";
    throw error;
  }
  return role;
}

export function listExportFrames(document, role) {
  const frames = [];
  const visit = (node) => {
    if (node?.type === "frame" && node.role === role) frames.push(node.id);
    for (const child of node?.children ?? []) visit(child);
  };
  for (const child of document.children ?? []) visit(child);
  return frames;
}

export function resolveExportDestinations(pattern, sets, format) {
  if (typeof pattern !== "string" || pattern.includes("${")) {
    const error = new Error("Export destinations are literal paths, not binding templates.");
    error.code = "CANVAS_EXPORT_OUTPUT_NAME";
    throw error;
  }
  if (sets.length === 1 && !sets[0]) return [pattern];
  const seen = new Map();
  return sets.map((set, index) => {
    if (!set || typeof set.output !== "string") throw new Error(`Binding set ${index} needs an explicit output value.`);
    const output = validateBindingSegment(set.output, "output", index);
    let destination = pattern;
    if (pattern.endsWith("/")) {
      const name = format === "pptx" ? `${output}.pptx` : output;
      validateDerivedSegment(name, index);
      destination = join(normalize(pattern), name);
    }
    else if (sets.length > 1) {
      const error = new Error("Several binding sets require a trailing-slash directory destination.");
      error.code = "CANVAS_EXPORT_COLLISION";
      throw error;
    }
    const key = destination.normalize("NFC").toLowerCase();
    if (seen.has(key)) {
      const error = new Error(`Binding sets ${seen.get(key)} and ${index} collide at ${destination}.`);
      error.code = "CANVAS_EXPORT_COLLISION";
      throw error;
    }
    seen.set(key, index);
    return destination;
  });
}

export function bindingsForExportSet(set) {
  return set ? Object.fromEntries(Object.entries(set).filter(([key]) => key !== "output")) : {};
}

function validateBindingSegment(value, name, index) {
  const segment = String(value);
  if (!segment || segment !== segment.normalize("NFC") || /[\/\\\0-\x1f]/u.test(segment) || segment === "." || segment === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment) || new TextEncoder().encode(segment).length > 255) {
    const error = new Error(`Binding ${name} in set ${index} is not a safe filename segment: ${JSON.stringify(value)}.`);
    error.code = "CANVAS_EXPORT_OUTPUT_NAME";
    throw error;
  }
  return segment;
}

function validateDerivedSegment(segment, index) {
  if (!segment || segment !== segment.normalize("NFC") || /[\/\\\0-\x1f]/u.test(segment) || segment === "." || segment === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment) || new TextEncoder().encode(segment).length > 255) {
    const error = new Error(`Binding set ${index} produces an unsafe output segment: ${JSON.stringify(segment)}.`);
    error.code = "CANVAS_EXPORT_OUTPUT_NAME";
    throw error;
  }
}
