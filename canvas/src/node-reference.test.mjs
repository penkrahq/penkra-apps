import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { copyTextToClipboard, formatCanvasNodeReference } from "./node-reference.mjs";

describe("formatCanvasNodeReference", () => {
  it("writes an agent-friendly reference with stable IDs and human-readable names", () => {
    assert.equal(formatCanvasNodeReference({
      document: { id: "document-1", title: "Atferd Portal" },
      node: { id: "hero-1", name: "Hero", type: "frame" },
    }), "Canvas node “Hero” (nodeId: “hero-1”) in “Atferd Portal” (documentId: “document-1”).");
  });

  it("uses useful names when optional labels are absent", () => {
    assert.equal(formatCanvasNodeReference({
      document: { id: "document-1", title: "" },
      node: { id: "text-1", type: "text" },
    }), "Canvas node “text” (nodeId: “text-1”) in “Untitled design” (documentId: “document-1”).");
  });

  it("rejects references that cannot identify both resources", () => {
    assert.throws(() => formatCanvasNodeReference({ document: { id: "document-1" }, node: {} }), {
      message:
      "A Canvas node reference requires both a document ID and a node ID.",
    });
  });
});

describe("copyTextToClipboard", () => {
  it("copies synchronously from a user gesture when the App frame supports document copy", async () => {
    const input = {
      value: "",
      readOnly: false,
      style: { cssText: "" },
      setAttribute() {},
      selectCalled: false,
      select() { this.selectCalled = true; },
      removeCalled: false,
      remove() { this.removeCalled = true; },
    };
    const documentObject = {
      body: { append(value) { assert.equal(value, input); } },
      createElement(tag) { assert.equal(tag, "textarea"); return input; },
      execCommand(command) { assert.equal(command, "copy"); return true; },
    };

    await copyTextToClipboard("node reference", { documentObject, navigatorObject: {} });

    assert.equal(input.value, "node reference");
    assert.equal(input.selectCalled, true);
    assert.equal(input.removeCalled, true);
  });

  it("uses the Clipboard API when document copy is unavailable", async () => {
    let copied = null;
    await copyTextToClipboard("node reference", {
      documentObject: null,
      navigatorObject: { clipboard: { writeText: async (text) => { copied = text; } } },
    });
    assert.equal(copied, "node reference");
  });
});
