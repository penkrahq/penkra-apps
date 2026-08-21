import assert from "node:assert/strict";
import test from "node:test";

import { applyMutationsToProjection, compactDeletionMutations } from "./document-projection.mjs";

test("projection mutations update properties and structure without replacing the document", () => {
  const document = {
    version: "2.17",
    children: [{
      id: "parent-a",
      type: "frame",
      children: [{ id: "first", type: "rectangle", x: 0 }, { id: "second", type: "rectangle" }],
    }, { id: "parent-b", type: "frame", children: [] }],
  };

  assert.equal(applyMutationsToProjection(document, [
    { kind: "set-property", nodeId: "first", property: "x", value: 12 },
    { kind: "move-node", nodeId: "first", parentId: "parent-b", position: 0 },
    { kind: "insert-node", node: { id: "third", type: "text", content: "New" }, parentId: "parent-a", position: 1 },
    { kind: "delete-node", nodeId: "second" },
  ]), document);
  assert.deepEqual(document.children[0].children.map((node) => node.id), ["third"]);
  assert.deepEqual(document.children[1].children.map((node) => node.id), ["first"]);
  assert.equal(document.children[1].children[0].x, 12);
});

test("projection deletion is idempotent for recursive scene deletion events", () => {
  const document = {
    version: "2.17",
    children: [{ id: "parent", type: "frame", children: [{ id: "child", type: "rectangle" }] }],
  };
  applyMutationsToProjection(document, [
    { kind: "delete-node", nodeId: "child" },
    { kind: "delete-node", nodeId: "parent" },
  ]);
  assert.deepEqual(document.children, []);
});

test("recursive scene deletion persists only the highest deleted ancestor", () => {
  const mutations = [
    { kind: "delete-node", nodeId: "grandchild" },
    { kind: "delete-node", nodeId: "child" },
    { kind: "delete-node", nodeId: "parent" },
  ];
  const documentNodes = [
    { node: { id: "parent" }, parentId: null },
    { node: { id: "child" }, parentId: "parent" },
    { node: { id: "grandchild" }, parentId: "child" },
  ];
  assert.deepEqual(compactDeletionMutations(mutations, documentNodes), [
    { kind: "delete-node", nodeId: "parent" },
  ]);
});
