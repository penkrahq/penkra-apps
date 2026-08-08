import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_ORIGIN,
  createDocumentModel,
  createUndoManager,
  encodeState,
  encodeUpdate,
  listNodes,
  materialize,
  mutate,
  reconcileDocumentPayload,
  restoreDocumentModel,
} from "./document-model.mjs";

test("Canvas restores cloud snapshots and preserves unsupported content", () => {
  const source = {
    version: "2.15",
    futureDocumentField: { retained: true },
    children: [
      {
        id: "root",
        type: "frame",
        width: 640,
        height: 480,
        futureProperty: { mode: "new" },
        children: [{ id: "future", type: "future-widget", payload: [1, 2, 3] }],
      },
    ],
  };
  const created = createDocumentModel(source);
  const restored = restoreDocumentModel({
    snapshot: { state: encodeState(created), throughSequence: 1 },
    updates: [],
  });

  assert.deepEqual(materialize(restored), source);
  assert.deepEqual(listNodes(restored).map(({ node }) => node.id), ["root", "future"]);
  created.doc.destroy();
  restored.doc.destroy();
});

test("Canvas applies missed lower-sequence updates after its offline update advances the watermark", () => {
  const initial = createDocumentModel({
    version: "2.15",
    children: [
      { id: "frame-1", type: "frame", x: 80, y: 60, width: 360, height: 220, children: [] },
    ],
  });
  const snapshot = encodeState(initial);
  const remote = restoreDocumentModel({ snapshot: { state: snapshot, throughSequence: 0 }, updates: [] });
  const local = restoreDocumentModel({ snapshot: { state: snapshot, throughSequence: 0 }, updates: [] });
  let remoteUpdate;
  remote.doc.once("update", (update) => {
    remoteUpdate = encodeUpdate(update);
  });
  mutate(remote, { kind: "set-property", nodeId: "frame-1", property: "y", value: 76 });
  mutate(local, { kind: "set-property", nodeId: "frame-1", property: "x", value: 96 });

  const sequence = reconcileDocumentPayload(
    local,
    {
      snapshot: { state: snapshot, throughSequence: 0 },
      updates: [{ sequence: 1, update: remoteUpdate }],
    },
    2,
  );

  assert.equal(sequence, 2);
  assert.deepEqual(
    { x: materialize(local).children[0].x, y: materialize(local).children[0].y },
    { x: 96, y: 76 },
  );
  initial.doc.destroy();
  remote.doc.destroy();
  local.doc.destroy();
});

test("Canvas applies a transactional property mutation without replacing the document", () => {
  const model = createDocumentModel({
    version: "2.15",
    children: [{ id: "title", type: "text", content: "Before" }],
  });
  mutate(
    model,
    { kind: "set-property", nodeId: "title", property: "content", value: "After" },
    LOCAL_ORIGIN,
  );
  assert.equal(materialize(model).children[0].content, "After");
  model.doc.destroy();
});

test("Canvas undo tracks local edits and leaves remote edits intact", () => {
  const model = createDocumentModel({
    version: "2.15",
    children: [{ id: "shape", type: "rectangle", width: 100, fill: "#000000" }],
  });
  const undo = createUndoManager(model);

  mutate(model, { kind: "set-property", nodeId: "shape", property: "width", value: 240 });
  mutate(
    model,
    { kind: "set-property", nodeId: "shape", property: "fill", value: "#ffffff" },
    Symbol("remote-user"),
  );
  undo.undo();

  assert.equal(materialize(model).children[0].width, 100);
  assert.equal(materialize(model).children[0].fill, "#ffffff");
  undo.destroy();
  model.doc.destroy();
});
