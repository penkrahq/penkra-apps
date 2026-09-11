import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

export function reviewDocumentIssues(document) {
  return [
    ...prepareOpenPencilRenderDocument(document).issues,
    ...designValidationIssues(document),
  ];
}

export function designValidationIssues(document) {
  const issues = [];
  const nodesById = new Map();
  const visit = (children = []) => {
    for (const node of children) {
      if (typeof node?.id === "string") nodesById.set(node.id, node);
      if (node.type === "text") {
        if (typeof node.content !== "string" || node.content.length === 0) {
          issues.push({ nodeId: node.id, kind: "text-content", message: "This text node has no visible content." });
        }
        if (!hasVisibleFill(node.fill)) {
          issues.push({ nodeId: node.id, kind: "text-fill", message: "This text node has no enabled visible fill." });
        }
      }
      visit(node.children);
      for (const content of Object.values(node.slots ?? {})) visit(content);
    }
  };
  visit(document?.children);
  for (const node of nodesById.values()) {
    for (const [name, declaration] of Object.entries(node.properties ?? {})) {
      if (declaration?.type !== "slot") continue;
      const target = nodeAtPath(node, declaration.target);
      if (target) appendSlotLimitIssue(issues, target.id, name, target.children?.length ?? 0, declaration);
    }
    if (node.type !== "ref" || typeof node.ref !== "string" || node.ref.includes(":")) continue;
    const component = nodesById.get(node.ref);
    for (const [name, content] of Object.entries(node.slots ?? {})) {
      const declaration = component?.properties?.[name];
      if (declaration?.type === "slot") appendSlotLimitIssue(issues, node.id, name, content.length, declaration);
    }
  }
  return issues;
}

function appendSlotLimitIssue(issues, nodeId, name, count, declaration) {
  const below = declaration.minItems !== undefined && count < declaration.minItems;
  const above = declaration.maxItems !== undefined && count > declaration.maxItems;
  if (!below && !above) return;
  const expected = declaration.minItems !== undefined && declaration.maxItems !== undefined
    ? `${declaration.minItems}–${declaration.maxItems}`
    : declaration.minItems !== undefined ? `at least ${declaration.minItems}` : `at most ${declaration.maxItems}`;
  issues.push({
    nodeId,
    kind: "slot-layer-guidance",
    message: `Slot ${name} contains ${count} layer(s); its design-system guidance is ${expected}.`,
  });
}

function nodeAtPath(component, path) {
  let current = component;
  for (const id of String(path ?? "").split("/")) {
    current = (current.children ?? []).find((node) => node?.id === id);
    if (!current) return null;
  }
  return current;
}

function hasVisibleFill(fill) {
  const fills = Array.isArray(fill) ? fill : [fill];
  return fills.some((candidate) => {
    if (typeof candidate === "string") return candidate.length > 0;
    return candidate && typeof candidate === "object" && candidate.enabled !== false
      && (typeof candidate.color === "string" || typeof candidate.fill === "string");
  });
}
