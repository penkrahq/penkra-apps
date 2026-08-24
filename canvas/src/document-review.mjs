import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

export function reviewDocumentIssues(document) {
  return [
    ...prepareOpenPencilRenderDocument(document).issues,
    ...designValidationIssues(document),
  ];
}

export function designValidationIssues(document) {
  const issues = [];
  const visit = (nodes = []) => {
    for (const node of nodes) {
      if (node.type === "frame" && node.layout === undefined && (node.children?.length ?? 0) > 0) {
        issues.push({
          nodeId: node.id,
          kind: "implicit-layout",
          message: "This frame contains children but does not declare a layout. Set layout explicitly so future edits and renderers interpret it predictably.",
        });
      }
      if (node.type === "text") {
        if (typeof node.content !== "string" || node.content.length === 0) {
          issues.push({ nodeId: node.id, kind: "text-content", message: "This text node has no visible content." });
        }
        if (!hasVisibleFill(node.fill)) {
          issues.push({ nodeId: node.id, kind: "text-fill", message: "This text node has no enabled visible fill." });
        }
      }
      visit(node.children);
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
