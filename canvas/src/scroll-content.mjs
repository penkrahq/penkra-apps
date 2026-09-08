import { resolveCanvasDocument } from "./canvas-resolver.mjs";

const SCROLL_MODES = new Set(["scroll-x", "scroll-y", "scroll-both"]);

/**
 * Prepare an isolated resolved document for static extraction.
 *
 * Canvas's editor and static image exports show a scroll container's viewport.
 * A `full` extraction deliberately removes that viewport clipping so the
 * normal descendant-bounds calculation includes the content. The returned
 * document is always a clone and the caller's source is never modified.
 */
export function prepareScrollContentDocument(document, {
  nodeId,
  format,
  mode = "viewport",
  modes,
  bindings,
  imports,
} = {}) {
  if (mode !== "viewport" && mode !== "full") {
    const error = new Error("scrollContent must be viewport or full.");
    error.code = "CANVAS_EXTRACT_SCROLL_CONTENT";
    throw error;
  }
  const resolved = resolveCanvasDocument(document, { modes, bindings, imports }).document;
  const output = structuredClone(resolved);
  const selected = findNode(output.children, nodeId);
  if (!selected) return output;
  const scrollNodes = [];
  walk(selected, (node) => {
    if (SCROLL_MODES.has(node.overflow)) scrollNodes.push(node);
  });
  if (mode === "full") {
    if (format === "pdf" && selected.physical && scrollNodes.length > 0) {
      const error = new Error(`PDF extraction cannot expand scroll content inside physical node ${nodeId}; use scrollContent=viewport or remove physical sizing.`);
      error.code = "CANVAS_EXTRACT_SCROLL_PHYSICAL";
      throw error;
    }
    for (const node of scrollNodes) {
      delete node.overflow;
      delete node.clip;
    }
  } else {
    // `clip` is the renderer's established clipping primitive. Keep the
    // semantic overflow value in the clone while making the static viewport
    // behavior explicit to all existing renderers and bounds code.
    for (const node of scrollNodes) node.clip = true;
  }
  return output;
}

function findNode(children, id) {
  let found;
  walkChildren(children, (node) => { if (!found && node.id === id) found = node; });
  return found;
}

function walk(node, visit) {
  visit(node);
  walkChildren(node.children, visit);
}

function walkChildren(children, visit) {
  for (const child of children ?? []) walk(child, visit);
}
