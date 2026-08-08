const MAX_INLINE_EXPORT_BYTES = 750_000;

export function summarizeNodes(nodes, requestedLimit = 500) {
  const limit = Math.min(1_000, Math.max(1, Number(requestedLimit) || 500));
  return {
    items: nodes.slice(0, limit).map(({ node, depth, parentId, index }) => ({
      id: node.id,
      type: node.type,
      name: node.name ?? null,
      depth,
      parentId,
      index,
    })),
    truncated: nodes.length > limit,
    total: nodes.length,
  };
}

export function assertMutationBatch(mutations) {
  if (!Array.isArray(mutations) || mutations.length < 1 || mutations.length > 200) {
    throw new Error("Canvas mutations must contain between 1 and 200 changes.");
  }
  return mutations;
}

export function inlineExport(document) {
  const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
  if (bytes > MAX_INLINE_EXPORT_BYTES) {
    throw new Error(
      "This document is too large for an inline operation result. Open it in Canvas and use Download .pen.",
    );
  }
  return { document, bytes };
}
