import assert from "node:assert/strict";
import test from "node:test";

import { createSurfaceMutationBoundary } from "./surface-mutation-boundary.mjs";

test("renderer synchronization cannot author document mutations", () => {
  const emitted = [];
  const boundary = createSurfaceMutationBoundary((mutations) => emitted.push(mutations));

  boundary.runRendererSync(() => {
    boundary.emit([{ kind: "delete-node", nodeId: "component" }]);
    boundary.runRendererSync(() => {
      boundary.emit([{ kind: "insert-node", node: { id: "synthetic-child" } }]);
    });
    boundary.emit([{ kind: "set-property", nodeId: "screen", property: "height", value: 778 }]);
  });

  assert.deepEqual(emitted, []);
  assert.equal(boundary.isRendererSyncing(), false);
});

test("user edits and explicit history replay still emit mutations", () => {
  const emitted = [];
  const boundary = createSurfaceMutationBoundary((mutations) => emitted.push(mutations));

  boundary.emit([{ kind: "set-property", nodeId: "title", property: "content", value: "After" }]);
  const replayed = boundary.replayHistory(() => {
    boundary.emit([{ kind: "delete-node", nodeId: "old-node" }]);
    boundary.emit([{ kind: "insert-node", node: { id: "restored-node" } }]);
  });

  assert.equal(replayed, true);
  assert.deepEqual(emitted, [
    [{ kind: "set-property", nodeId: "title", property: "content", value: "After" }],
    [
      { kind: "delete-node", nodeId: "old-node" },
      { kind: "insert-node", node: { id: "restored-node" } },
    ],
  ]);
});
