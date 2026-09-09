import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCanvasDocumentAliases } from "./canvas-normalization.mjs";

test("legacy physical-direction text aliases normalize throughout authored and override content", () => {
  const source = {
    paragraphStyles: { body: { align: "right" } },
    children: [{
      id: "component", type: "frame", justifyContent: "left", children: [{
        id: "label", type: "text", textAlign: "left", textAlignVertical: "middle",
        paragraphs: [{ from: 0, to: 1, align: "right" }],
      }],
    }, {
      id: "instance", type: "ref", ref: "component",
      descendants: { label: { textAlign: "right" } },
    }],
  };

  const normalized = normalizeCanvasDocumentAliases(source);
  assert.equal(normalized.paragraphStyles.body.align, "end");
  assert.equal(normalized.children[0].justifyContent, "start");
  assert.equal(normalized.children[0].children[0].textAlign, "start");
  assert.equal(normalized.children[0].children[0].textAlignVertical, "center");
  assert.equal(normalized.children[0].children[0].paragraphs[0].align, "end");
  assert.equal(normalized.children[1].descendants.label.textAlign, "end");
  assert.equal(source.children[0].children[0].textAlign, "left");
});

test("legacy frame clip input normalizes to the canonical overflow vocabulary", () => {
  const source = {
    children: [
      { id: "clipped", type: "frame", clip: true, children: [] },
      { id: "unclipped", type: "frame", clip: false, children: [] },
      { id: "explicit", type: "frame", clip: true, overflow: "scroll-y", children: [] },
      { id: "shape", type: "rectangle", clip: true },
    ],
  };

  const normalized = normalizeCanvasDocumentAliases(source);
  assert.deepEqual(normalized.children[0], { id: "clipped", type: "frame", overflow: "clip", children: [] });
  assert.deepEqual(normalized.children[1], { id: "unclipped", type: "frame", children: [] });
  assert.deepEqual(normalized.children[2], { id: "explicit", type: "frame", overflow: "scroll-y", children: [] });
  assert.equal(normalized.children[3].clip, true);
  assert.equal(source.children[0].clip, true);
});
