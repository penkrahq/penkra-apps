import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  copyTextToClipboard,
  formatCanvasNodeReference,
  resolveCanvasNodeReferenceId,
} from "./node-reference.mjs";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";

describe("formatCanvasNodeReference", () => {
  it("copies the same concise stable node reference used by Pencil", () => {
    assert.equal(formatCanvasNodeReference({
      document: { id: "document-1", title: "Atferd Portal" },
      node: { id: "hero-1", name: "Hero", type: "frame" },
    }), "Node ID: hero-1");
  });

  it("requires only the stable node ID represented by the copied value", () => {
    assert.equal(formatCanvasNodeReference({ node: { id: "text-1" } }), "Node ID: text-1");
    assert.throws(() => formatCanvasNodeReference({ node: {} }), {
      message: "A Canvas node reference requires a node ID.",
    });
  });
});

describe("resolveCanvasNodeReferenceId", () => {
  it("keeps source node IDs unchanged", () => {
    assert.equal(resolveCanvasNodeReferenceId({
      document: { children: [{ id: "screen", type: "frame" }] },
      graph: null,
      selectedId: "screen",
    }), "screen");
  });

  it("addresses a selected component descendant through its source instance", () => {
    const nodes = new Map([
      ["queue-row", { id: "queue-row", type: "INSTANCE", parentId: "page" }],
      ["clone-button", { id: "clone-button", type: "INSTANCE", parentId: "queue-row", componentId: "action-button" }],
      ["clone-label", { id: "clone-label", type: "TEXT", parentId: "clone-button", componentId: "button-label" }],
    ]);
    assert.equal(resolveCanvasNodeReferenceId({
      document: { children: [{ id: "queue-row", type: "ref", ref: "row" }] },
      graph: { getNode: (id) => nodes.get(id) },
      selectedId: "clone-label",
    }), "queue-row/action-button/button-label");
  });

  it("preserves exact authored paths through nested component instances", () => {
    const document = {
      version: "2.17",
      children: [
        {
          id: "badge",
          type: "frame",
          reusable: true,
          children: [{ id: "badge-label", type: "text", content: "queued" }],
        },
        {
          id: "row",
          type: "frame",
          reusable: true,
          children: [{ id: "row-status", type: "ref", ref: "badge" }],
        },
        {
          id: "blocked-row",
          type: "ref",
          ref: "row",
          descendants: { "row-status/badge-label": { content: "blocked" } },
        },
      ],
    };
    const graph = createOpenPencilGraph(document);
    const selected = graph.getAllNodes().find((node) => node.text === "blocked");

    assert.equal(resolveCanvasNodeReferenceId({
      document,
      graph,
      selectedId: selected.id,
    }), "blocked-row/row-status/badge-label");
  });

  it("returns no misleading reference for generated visuals without source identity", () => {
    const nodes = new Map([
      ["note", { id: "note", type: "SECTION", parentId: "page" }],
      ["generated", { id: "generated", type: "FRAME", parentId: "note", componentId: null }],
    ]);
    assert.equal(resolveCanvasNodeReferenceId({
      document: { children: [{ id: "note", type: "note" }] },
      graph: { getNode: (id) => nodes.get(id) },
      selectedId: "generated",
    }), null);
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
