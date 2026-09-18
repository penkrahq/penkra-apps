import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

export function reviewDocumentIssues(document) {
  return [
    ...prepareOpenPencilRenderDocument(document).issues,
    ...designValidationIssues(document),
  ];
}

export function designValidationIssues(document) {
  const issues = [];
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
      visit(node.children, node);
    }
  };
  visit(document?.children);
  return issues;
}

function hasVisibleFill(fill) {
  const fills = Array.isArray(fill) ? fill : [fill];
  return fills.some((candidate) => {
    if (typeof candidate === "string") return candidate.length > 0;
    return candidate && typeof candidate === "object" && candidate.enabled !== false
      && (typeof candidate.color === "string" || typeof candidate.fill === "string");
  });
}
