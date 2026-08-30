import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { watch } from "vue";

import { createOpenPencilEditor } from "./openpencil-engine.mjs";
import { beginSelectedTextEditing } from "./text-editing.mjs";

describe("beginSelectedTextEditing", () => {
  it("enters inline editing for the selected authored text node", () => {
    const editor = {
      state: { editingTextId: null },
      startTextEditing(nodeId) { this.state.editingTextId = nodeId; },
    };

    assert.equal(beginSelectedTextEditing({
      editor,
      selection: {
        selectedId: "title",
        effectiveNode: { id: "title", type: "text", content: "SchoolBase" },
        runtimeNode: { id: "title", type: "TEXT", locked: false },
      },
    }), true);
    assert.equal(editor.state.editingTextId, "title");
  });

  it("does not treat icon glyphs or locked compatibility visuals as editable text", () => {
    let starts = 0;
    const editor = {
      state: { editingTextId: null },
      startTextEditing() { starts += 1; },
    };

    assert.equal(beginSelectedTextEditing({
      editor,
      selection: {
        selectedId: "icon",
        effectiveNode: { id: "icon", type: "icon_font" },
        runtimeNode: { id: "icon", type: "TEXT", locked: false },
      },
    }), false);
    assert.equal(beginSelectedTextEditing({
      editor,
      selection: {
        selectedId: "locked-text",
        effectiveNode: { id: "locked-text", type: "text" },
        runtimeNode: { id: "locked-text", type: "TEXT", locked: true },
      },
    }), false);
    assert.equal(starts, 0);
  });

  it("publishes the core editing session to OpenPencil's reactive Vue integration", () => {
    const sourceNode = { id: "title", type: "text", content: "SchoolBase", fontSize: 14 };
    const editor = createOpenPencilEditor({ version: "2.17", children: [sourceNode] });
    const observed = [];
    const stop = watch(
      () => editor.state.editingTextId,
      (nodeId) => observed.push(nodeId),
      { flush: "sync" },
    );

    try {
      assert.equal(beginSelectedTextEditing({
        editor,
        selection: {
          selectedId: "title",
          effectiveNode: sourceNode,
          runtimeNode: editor.graph.getNode("title"),
        },
      }), true);
      assert.deepEqual(observed, ["title"]);
    } finally {
      stop();
    }
  });
});
