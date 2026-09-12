const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CLICK_TOLERANCE = 4;

export function isCanvasDocumentId(value) {
  return typeof value === "string" && DOCUMENT_ID.test(value);
}

export function resolveCanvasDocumentLink(document, nodeId) {
  if (!document || typeof nodeId !== "string") return null;
  const nodes = new Map();
  const parents = new Map();
  visit(document.children ?? [], null, (node, parentId) => {
    nodes.set(node.id, node);
    parents.set(node.id, parentId);
  });
  let currentId = nodeId;
  while (currentId) {
    const node = nodes.get(currentId);
    if (isCanvasDocumentId(node?.documentLink)) {
      return { nodeId: currentId, documentId: node.documentLink };
    }
    currentId = parents.get(currentId) ?? null;
  }
  return null;
}

export function createCanvasDocumentLinkInteraction({ getDocument, getEditor, onOpen }) {
  let pressed = null;
  return {
    pointerDown(event) {
      pressed = event.button === 0 ? {
        x: event.clientX,
        y: event.clientY,
        link: linkAtPointer(getDocument(), getEditor(), event),
      } : null;
    },
    click(event) {
      const editor = getEditor();
      const released = linkAtPointer(getDocument(), editor, event);
      const activates = event.button === 0
        && editor?.state.activeTool === "SELECT"
        && !editor.state.editingTextId
        && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
        && pressed?.link?.documentId === released?.documentId
        && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= CLICK_TOLERANCE;
      pressed = null;
      if (!activates) return false;
      onOpen(released.documentId);
      return true;
    },
  };
}

function linkAtPointer(document, editor, event) {
  if (!editor?.graph || !event.currentTarget) return null;
  const bounds = event.currentTarget.getBoundingClientRect();
  const zoom = editor.state.zoom || 1;
  const x = (event.clientX - bounds.left - editor.state.panX) / zoom;
  const y = (event.clientY - bounds.top - editor.state.panY) / zoom;
  const hit = editor.graph.hitTestDeep(x, y, editor.state.currentPageId);
  if (!hit) return null;
  for (const candidate of [hit.pencilNodeId, hit.id, hit.id?.split("/").at(-1)]) {
    const link = resolveCanvasDocumentLink(document, candidate);
    if (link) return link;
  }
  return null;
}

function visit(children, parentId, callback) {
  for (const node of children) {
    callback(node, parentId);
    visit(node.children ?? [], node.id, callback);
  }
}
