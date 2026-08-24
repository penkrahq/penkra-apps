export function formatCanvasNodeReference({ document, node }) {
  if (!document?.id || !node?.id) {
    throw new Error("A Canvas node reference requires both a document ID and a node ID.");
  }

  const documentTitle = String(document.title || "Untitled design");
  const nodeName = String(node.name || node.type || "Unnamed node");
  return `Canvas node “${nodeName}” (nodeId: “${node.id}”) in “${documentTitle}” (documentId: “${document.id}”).`;
}

export async function copyTextToClipboard(text, {
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
} = {}) {
  if (documentObject?.body && typeof documentObject.execCommand === "function") {
    const input = documentObject.createElement("textarea");
    input.value = text;
    input.readOnly = true;
    input.setAttribute("aria-hidden", "true");
    input.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
    documentObject.body.append(input);
    input.select();
    const copied = documentObject.execCommand("copy");
    input.remove();
    if (copied) return;
  }
  if (typeof navigatorObject?.clipboard?.writeText === "function") {
    await navigatorObject.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard writing is unavailable in this Canvas frame.");
}
