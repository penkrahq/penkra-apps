import assert from "node:assert/strict";
import test from "node:test";

import { assertMutationBatch, inlineExport, summarizeNodes } from "./operation-model.mjs";

test("operation node summaries are explicit when bounded", () => {
  const nodes = Array.from({ length: 4 }, (_, index) => ({
    node: { id: `node-${index}`, type: "rectangle" },
    depth: 0,
    parentId: null,
    index,
  }));
  assert.deepEqual(summarizeNodes(nodes, 2), {
    items: [
      { id: "node-0", type: "rectangle", name: null, depth: 0, parentId: null, index: 0 },
      { id: "node-1", type: "rectangle", name: null, depth: 0, parentId: null, index: 1 },
    ],
    truncated: true,
    total: 4,
  });
});

test("operation mutation batches and inline exports stay bounded", () => {
  assert.throws(() => assertMutationBatch([]), /between 1 and 200/);
  assert.throws(() => assertMutationBatch(Array.from({ length: 201 }, () => ({}))), /between 1 and 200/);
  assert.equal(assertMutationBatch([{ kind: "delete-node" }]).length, 1);
  assert.equal(inlineExport({ version: "2.15", children: [] }).bytes > 0, true);
  assert.throws(() => inlineExport({ payload: "x".repeat(750_000) }), /too large/);
});
