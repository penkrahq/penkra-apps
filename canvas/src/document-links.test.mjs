import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanvasDocumentLinkInteraction,
  resolveCanvasDocumentLink,
} from "./document-links.mjs";

const document = {
  children: [{
    id: "page",
    type: "frame",
    children: [{
      id: "card",
      type: "frame",
      documentLink: "8e29a956-ffec-4f9c-a85b-7ee006042c89",
      children: [{ id: "label", type: "text", content: "Social media" }],
    }],
  }],
};

test("a descendant click resolves the nearest linked Canvas document", () => {
  assert.deepEqual(resolveCanvasDocumentLink(document, "label"), {
    nodeId: "card",
    documentId: "8e29a956-ffec-4f9c-a85b-7ee006042c89",
  });
  assert.equal(resolveCanvasDocumentLink(document, "page"), null);
});

test("a stationary primary click opens a linked document", () => {
  const opened = [];
  const editor = fakeEditor("label");
  const interaction = createCanvasDocumentLinkInteraction({
    getDocument: () => document,
    getEditor: () => editor,
    onOpen: (documentId) => opened.push(documentId),
  });
  interaction.pointerDown(pointer(40, 50));
  assert.equal(interaction.click(pointer(41, 51)), true);
  assert.deepEqual(opened, ["8e29a956-ffec-4f9c-a85b-7ee006042c89"]);
});

test("dragging or holding a modifier preserves ordinary Canvas editing", () => {
  for (const release of [pointer(60, 80), pointer(40, 50, { metaKey: true })]) {
    const opened = [];
    const interaction = createCanvasDocumentLinkInteraction({
      getDocument: () => document,
      getEditor: () => fakeEditor("label"),
      onOpen: (documentId) => opened.push(documentId),
    });
    interaction.pointerDown(pointer(40, 50));
    assert.equal(interaction.click(release), false);
    assert.deepEqual(opened, []);
  }
});

function fakeEditor(hitId) {
  return {
    state: { activeTool: "SELECT", currentPageId: "page", panX: 10, panY: 20, zoom: 2, editingTextId: null },
    graph: { hitTestDeep: (x, y, pageId) => x >= 15 && x <= 15.5 && y >= 15 && y <= 15.5 && pageId === "page" ? { id: hitId } : null },
  };
}

function pointer(clientX, clientY, overrides = {}) {
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}
