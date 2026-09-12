import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";

export async function loadEditorLibraryImports(api, document, options = {}) {
  try {
    return { ...await loadRetainedCanvasImports(api, document, options), error: null };
  } catch (error) {
    return {
      imports: Object.create(null),
      assets: new Map(),
      releases: [],
      error,
    };
  }
}

export function resolveEditorCanvasDocument(document, imports) {
  try {
    return { document: resolveCanvasDocument(document, { imports }).document, error: null };
  } catch (error) {
    if (Object.keys(document?.imports ?? {}).length === 0) throw error;
    return { document: structuredClone(document), error };
  }
}

export function libraryImportCompatibilityIssue(document, error, fallbackNodeId = "document") {
  if (!error) return null;
  return {
    nodeId: firstExternalReferenceId(document?.children) ?? fallbackNodeId,
    kind: "library-import",
    message: "Shared library content is unavailable. Its original references remain preserved in this document.",
  };
}

function firstExternalReferenceId(nodes) {
  for (const node of nodes ?? []) {
    if (node?.type === "ref" && typeof node.ref === "string" && node.ref.includes(":")) return node.id;
    const nested = firstExternalReferenceId(node?.children);
    if (nested) return nested;
  }
  return null;
}
