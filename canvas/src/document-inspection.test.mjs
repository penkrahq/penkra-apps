import assert from "node:assert/strict";
import test from "node:test";

import { inspectDocument } from "./document-inspection.mjs";

function documentWithOverflow({ clip = false } = {}) {
  const child = {
    id: "wide-child",
    type: "rectangle",
    layoutPosition: "absolute",
    x: 80,
    y: 10,
    width: 40,
    height: 20,
  };
  const parent = {
    id: "fixed-parent",
    type: "frame",
    width: 100,
    height: 50,
    clip,
    children: [child],
  };
  return {
    document: { version: "2.17", children: [parent] },
    nodes: [
      { node: parent, depth: 0, parentId: null, index: 0 },
      { node: child, depth: 1, parentId: parent.id, index: 0 },
    ],
  };
}

test("document inspection reports a child extending beyond a non-clipping parent", () => {
  const { document, nodes } = documentWithOverflow();
  const inspection = inspectDocument(document, nodes);
  const child = inspection.items.find((item) => item.id === "wide-child");

  assert.deepEqual(
    child.problems.filter((problem) => problem.kind === "parent-overflow"),
    [{
      nodeId: "wide-child",
      kind: "parent-overflow",
      ancestorId: "fixed-parent",
      severity: "critical",
      message: 'Node "rectangle" extends 400px outside parent "frame"',
      suggestion: 'Reposition inside "frame" or enable clip content on the parent.',
    }],
  );
});

test("document inspection does not report visible overflow through a clipping parent", () => {
  const { document, nodes } = documentWithOverflow({ clip: true });
  const inspection = inspectDocument(document, nodes);

  assert.equal(
    inspection.issues.some((issue) => issue.kind === "parent-overflow"),
    false,
  );
});
