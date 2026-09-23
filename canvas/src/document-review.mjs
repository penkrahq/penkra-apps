import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

export function reviewDocumentIssues(document) {
  return [
    ...prepareOpenPencilRenderDocument(document).issues,
    ...designValidationIssues(document),
  ];
}

export function designValidationIssues(document) {
  const issues = [];
  const definitions = new Map((document?.children ?? []).filter((node) => node?.id).map((node) => [node.id, node]));
  const visit = (nodes = [], parent = null) => {
    for (const node of nodes) {
      if (!node || node.enabled === false) continue;
      if (!parent && (node.width === "fill_container" || node.height === "fill_container")) {
        issues.push({
          nodeId: node.id,
          kind: "layout-sizing",
          message: "A top-level node cannot fill a parent container; use a concrete or fit-content size.",
        });
      }
      if (node.type === "text") {
        const hasBoundContent = typeof node.bind?.content === "string" && node.bind.content.startsWith("$props.");
        if (!hasBoundContent && (typeof node.content !== "string" || node.content.length === 0)) {
          issues.push({ nodeId: node.id, kind: "text-content", message: "This text node has no visible content." });
        }
        if (!hasVisibleFill(node.fill)) {
          issues.push({ nodeId: node.id, kind: "text-fill", message: "This text node has no enabled visible fill." });
        }
      }
      if (node.type === "frame" && node.layout === "horizontal" && typeof node.width === "number" && node.clip !== true) {
        const children = (node.children ?? []).filter((child) => child && child.enabled !== false && child.layoutPosition !== "absolute");
        const widths = children.map((child) => {
          const width = child.width ?? (child.type === "ref" ? definitions.get(child.ref)?.width : undefined);
          return typeof width === "number" ? width : null;
        });
        if (widths.every((width) => width !== null)) {
          const padding = horizontalPadding(node.padding);
          const required = widths.reduce((total, width) => total + width, 0)
            + Math.max(0, children.length - 1) * (node.gap ?? 0) + padding;
          if (required > node.width + 0.5) {
            issues.push({
              nodeId: node.id,
              kind: "layout-capacity",
              message: `Fixed-width children require ${required}px in a ${node.width}px horizontal frame.`,
            });
          }
        }
      }
      visit(node.children, node);
    }
  };
  visit(document?.children);
  return issues;
}

function horizontalPadding(padding) {
  if (typeof padding === "number") return padding * 2;
  if (!Array.isArray(padding)) return 0;
  if (padding.length === 2) return (padding[1] ?? 0) * 2;
  return (padding[1] ?? 0) + (padding[3] ?? 0);
}

function hasVisibleFill(fill) {
  const fills = Array.isArray(fill) ? fill : [fill];
  return fills.some((candidate) => {
    if (typeof candidate === "string") return candidate.length > 0;
    return candidate && typeof candidate === "object" && candidate.enabled !== false
      && (typeof candidate.color === "string" || typeof candidate.fill === "string");
  });
}
