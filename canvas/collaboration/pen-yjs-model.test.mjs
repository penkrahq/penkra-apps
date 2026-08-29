import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { test } from "node:test";

import { corpusFiles } from "../compatibility/corpus-files.mjs";
import {
  Y,
  cloneModel,
  createModel,
  deleteNode,
  insertNode,
  materializePen,
  moveNode,
  replaceModelContent,
  setNodeProperty,
  setNodePropertyPath,
  syncModels,
} from "./pen-yjs-model.mjs";

const fixture = {
  version: "2.15",
  futureDocumentField: { untouched: true },
  children: [
    {
      id: "frame-a",
      type: "frame",
      name: "A",
      width: 100,
      futureNodeField: { mode: "preserve-me" },
      children: [{ id: "child", type: "text", content: "Hello" }],
    },
    { id: "frame-b", type: "frame", name: "B" },
  ],
};

for (const { label, url } of corpusFiles) {
  test(`${label} round-trips through the normalized Yjs model`, async () => {
    const document = JSON.parse(await readFile(url, "utf8"));
    assert.deepEqual(materializePen(createModel(document)), document);
  });
}

test("normalization round-trips IDs and unknown document/node data", () => {
  assert.deepEqual(materializePen(createModel(fixture)), fixture);
});

test("normalization preserves an explicitly empty children array", () => {
  const document = {
    version: "2.15",
    children: [
      { id: "explicit-empty", type: "frame", children: [] },
      { id: "omitted", type: "frame" },
    ],
  };
  assert.deepEqual(materializePen(createModel(document)), document);
});

test("whole-document reconciliation produces one faithful Yjs transaction", () => {
  const model = createModel(fixture);
  const updates = [];
  model.doc.on("update", (update, origin) => updates.push({ update, origin }));
  const replacement = {
    version: "2.16",
    futureDocumentField: { replaced: true },
    children: [
      { id: "frame-b", type: "frame", name: "Moved", children: [] },
      { id: "new-text", type: "text", content: "New", fill: "#111111" },
    ],
  };

  replaceModelContent(model, replacement, "execute");

  assert.deepEqual(materializePen(model), replacement);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].origin, "execute");
});

test("whole-document reconciliation emits no Yjs update for an identical document", () => {
  const model = createModel(fixture);
  const updates = [];
  model.doc.on("update", (update, origin) => updates.push({ update, origin }));

  replaceModelContent(model, structuredClone(fixture), "reconcile");

  assert.deepEqual(materializePen(model), fixture);
  assert.deepEqual(updates, []);
});

test("whole-document reconciliation writes only sparse changes and preserves exact output", () => {
  const children = Array.from({ length: 2_000 }, (_, index) => ({
    id: `sparse-${index}`,
    type: "rectangle",
    x: index,
    y: index * 2,
    width: 100,
    height: 50,
    fill: { type: "color", color: "#336699", opacity: 1 },
  }));
  const source = { version: "2.15", children };
  const replacement = structuredClone(source);
  for (let index = 0; index < 364; index += 1) {
    replacement.children[index].width = 200 + index;
  }
  const model = createModel(source);
  const updates = [];
  model.doc.on("update", (update, origin) => updates.push({ update, origin }));

  replaceModelContent(model, replacement, "reconcile");

  assert.deepEqual(materializePen(model), replacement);
  assert.equal(updates.length, 1);
  assert.ok(
    updates[0].update.byteLength < Y.encodeStateAsUpdate(model.doc).byteLength,
    "a sparse reconciliation update must remain smaller than the full document state",
  );
});

test("supported property edits cannot overwrite structural ID, type, or children fields", () => {
  const model = createModel(fixture);
  for (const property of ["id", "type", "children"]) {
    assert.throws(
      () => setNodeProperty(model, "frame-a", property, "invalid", "alice"),
      /structural/,
    );
  }
  assert.deepEqual(materializePen(model), fixture);
});

test("concurrent property edits converge without collapsing independent properties", () => {
  const base = createModel(fixture);
  const alice = cloneModel(base, { guid: "alice" });
  const bob = cloneModel(base, { guid: "bob" });

  setNodeProperty(alice, "frame-a", "width", 240, "alice");
  setNodeProperty(alice, "frame-a", "opacity", 0.8, "alice");
  setNodeProperty(bob, "frame-a", "width", 360, "bob");
  setNodeProperty(bob, "frame-a", "fill", "#000000", "bob");
  syncModels(alice, bob);

  const left = materializePen(alice);
  const right = materializePen(bob);
  assert.deepEqual(left, right);
  assert.ok([240, 360].includes(left.children[0].width));
  assert.equal(left.children[0].opacity, 0.8);
  assert.equal(left.children[0].fill, "#000000");
});

test("declared nested object edits merge at field granularity", () => {
  const base = createModel({
    version: "2.15",
    children: [
      {
        id: "shape",
        type: "rectangle",
        fill: { type: "color", color: "#000000", opacity: 1 },
      },
    ],
  });
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  setNodePropertyPath(alice, "shape", "fill", ["color"], "#ffffff", "alice");
  setNodePropertyPath(bob, "shape", "fill", ["opacity"], 0.5, "bob");
  syncModels(alice, bob);

  assert.deepEqual(materializePen(alice), materializePen(bob));
  assert.deepEqual(materializePen(alice).children[0].fill, {
    type: "color",
    color: "#ffffff",
    opacity: 0.5,
  });
});

test("a new component descendant override is created at its exact authored path", () => {
  const model = createModel({
    version: "2.17",
    children: [{ id: "row-instance", type: "ref", ref: "row" }],
  });

  setNodePropertyPath(
    model,
    "row-instance",
    "descendants",
    ["row-meta/status-label", "content"],
    "blocked",
    "local",
  );

  assert.deepEqual(materializePen(model).children[0].descendants, {
    "row-meta/status-label": { content: "blocked" },
  });
});

test("concurrent inserts and competing moves converge to one deterministic hierarchy", () => {
  const base = createModel(fixture);
  const alice = cloneModel(base, { guid: "alice" });
  const bob = cloneModel(base, { guid: "bob" });

  insertNode(
    alice,
    { id: "z-insert", type: "rectangle" },
    "frame-a",
    0.5,
    "alice",
  );
  insertNode(bob, { id: "a-insert", type: "ellipse" }, "frame-a", 0.5, "bob");
  moveNode(alice, "child", "frame-b", 0, "alice");
  moveNode(bob, "child", null, 1, "bob");
  syncModels(alice, bob);

  const left = materializePen(alice);
  assert.deepEqual(left, materializePen(bob));
  assert.equal(countNode(left.children, "child"), 1);
  const frameA = findNode(left.children, "frame-a");
  assert.deepEqual(
    frameA.children.map(({ id }) => id),
    ["a-insert", "z-insert"],
  );
});

test("invalid subtree insertion is rejected before any partial Yjs mutation", () => {
  const model = createModel(fixture);
  const beforeSize = model.nodes.size;
  assert.throws(
    () =>
      insertNode(
        model,
        {
          id: "new-root",
          type: "frame",
          children: [
            { id: "duplicate-child", type: "rectangle" },
            { id: "duplicate-child", type: "text" },
          ],
        },
        null,
        2,
        "alice",
      ),
    /Duplicate node ID/,
  );
  assert.equal(model.nodes.size, beforeSize);
  assert.equal(model.nodes.has("new-root"), false);
});

test("insert and move validate parents, finite positions, and local cycles", () => {
  const model = createModel(fixture);
  assert.throws(
    () =>
      insertNode(model, { id: "orphan", type: "frame" }, "missing", 0, "alice"),
    /not found/,
  );
  assert.throws(
    () =>
      insertNode(
        model,
        { id: "bad-position", type: "frame" },
        null,
        Number.NaN,
        "alice",
      ),
    /finite number/,
  );
  assert.throws(
    () => insertNode(model, { id: "missing-type" }, null, 2, "alice"),
    /string type/,
  );
  assert.throws(
    () => moveNode(model, "frame-a", "child", 0, "alice"),
    /own descendant/,
  );
  assert.throws(
    () => moveNode(model, "child", null, Number.POSITIVE_INFINITY, "alice"),
    /finite number/,
  );
  assert.deepEqual(materializePen(model), fixture);
});

test("non-JSON values fail before import or mutation instead of silently coercing", () => {
  const model = createModel(fixture);
  assert.throws(
    () => setNodeProperty(model, "frame-a", "width", Number.NaN, "alice"),
    /finite JSON numbers/,
  );
  assert.throws(
    () =>
      insertNode(
        model,
        { id: "invalid", type: "frame", opacity: Infinity },
        null,
        2,
        "alice",
      ),
    /finite JSON numbers/,
  );
  assert.throws(
    () => setNodeProperty(model, "frame-a", "future", undefined, "alice"),
    /cannot be represented in JSON/,
  );
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(
    () => setNodeProperty(model, "frame-a", "future", cyclic, "alice"),
    /JSON cycle/,
  );
  assert.throws(
    () => setNodeProperty(model, "frame-a", "future", new Date(0), "alice"),
    /\$node\["frame-a"\]\.future received Date; JSON values allow only plain objects.*Convert this property to plain JSON data/,
  );
  assert.equal(model.nodes.has("invalid"), false);
  assert.deepEqual(materializePen(model), fixture);
});

test("invalid import data does not partially mutate a supplied Yjs document", () => {
  const doc = new Y.Doc();
  assert.throws(
    () =>
      createModel(
        {
          version: "2.15",
          children: [{ id: "invalid", type: "frame", width: Number.NaN }],
        },
        { doc },
      ),
    /finite JSON numbers/,
  );
  assert.equal(doc.getMap("nodes").size, 0);
  assert.equal(doc.getMap("documentFields").size, 0);
});

test("concurrent moves that form a parent cycle still materialize every node once", () => {
  const cyclicFixture = {
    version: "2.15",
    children: [
      { id: "a", type: "frame" },
      { id: "b", type: "frame" },
    ],
  };
  const base = createModel(cyclicFixture);
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  moveNode(alice, "a", "b", 0, "alice");
  moveNode(bob, "b", "a", 0, "bob");
  syncModels(alice, bob);

  const materialized = materializePen(alice);
  assert.deepEqual(materialized, materializePen(bob));
  assert.equal(countNode(materialized.children, "a"), 1);
  assert.equal(countNode(materialized.children, "b"), 1);
});

test("a concurrent delete wins over a move without leaving an orphan duplicate", () => {
  const base = createModel(fixture);
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  deleteNode(alice, "child", "alice");
  moveNode(bob, "child", "frame-b", 0, "bob");
  syncModels(alice, bob);

  assert.equal(countNode(materializePen(alice).children, "child"), 0);
  assert.deepEqual(materializePen(alice), materializePen(bob));
});

test("deleting a parent hides its subtree while a concurrent move can rescue a child", () => {
  const deleted = createModel(fixture);
  deleteNode(deleted, "frame-a", "alice");
  const deletedMaterialized = materializePen(deleted);
  assert.equal(countNode(deletedMaterialized.children, "frame-a"), 0);
  assert.equal(countNode(deletedMaterialized.children, "child"), 0);

  const base = createModel(fixture);
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  deleteNode(alice, "frame-a", "alice");
  moveNode(bob, "child", "frame-b", 0, "bob");
  syncModels(alice, bob);
  const merged = materializePen(alice);
  assert.equal(countNode(merged.children, "frame-a"), 0);
  assert.equal(countNode(merged.children, "child"), 1);
  assert.equal(findNode(merged.children, "frame-b").children[0].id, "child");
});

test("undo tracks only the initiating user's transactions", () => {
  const model = createModel(fixture);
  const aliceOrigin = { user: "alice" };
  const bobOrigin = { user: "bob" };
  const undo = new Y.UndoManager(model.nodes, {
    trackedOrigins: new Set([aliceOrigin]),
    captureTimeout: 0,
  });

  setNodeProperty(model, "frame-a", "width", 240, aliceOrigin);
  setNodeProperty(model, "frame-a", "fill", "#ffffff", bobOrigin);
  undo.undo();

  const frame = findNode(materializePen(model).children, "frame-a");
  assert.equal(frame.width, 100);
  assert.equal(frame.fill, "#ffffff");
});

test("one user's structural insert, move, and subtree delete undo in reverse order", () => {
  const model = createModel(fixture);
  const aliceOrigin = { user: "alice" };
  const undo = new Y.UndoManager(model.nodes, {
    trackedOrigins: new Set([aliceOrigin]),
    captureTimeout: 0,
  });

  insertNode(model, { id: "inserted", type: "ellipse" }, null, 2, aliceOrigin);
  undo.stopCapturing();
  moveNode(model, "child", "frame-b", 0, aliceOrigin);
  undo.stopCapturing();
  deleteNode(model, "frame-a", aliceOrigin);
  undo.stopCapturing();

  undo.undo();
  assert.equal(countNode(materializePen(model).children, "frame-a"), 1);
  assert.equal(
    findNode(materializePen(model).children, "frame-b").children[0].id,
    "child",
  );
  undo.undo();
  assert.equal(
    findNode(materializePen(model).children, "frame-a").children[0].id,
    "child",
  );
  undo.undo();
  assert.equal(countNode(materializePen(model).children, "inserted"), 0);
});

test("offline edits reconnect through state vectors and converge", () => {
  const base = createModel(fixture);
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  setNodeProperty(alice, "child", "content", "Edited offline", "alice");
  insertNode(
    bob,
    { id: "offline-node", type: "text", content: "Also offline" },
    null,
    2,
    "bob",
  );

  syncModels(alice, bob);
  assert.deepEqual(materializePen(alice), materializePen(bob));
  assert.equal(
    findNode(materializePen(alice).children, "child").content,
    "Edited offline",
  );
});

test("duplicated and reordered Yjs updates remain idempotent and converge", () => {
  const base = createModel(fixture);
  const sender = cloneModel(base);
  const receiver = cloneModel(base);
  const updates = [];
  sender.doc.on("update", (update, origin) => {
    if (origin === "alice") updates.push(update);
  });
  setNodeProperty(sender, "frame-a", "width", 240, "alice");
  setNodeProperty(sender, "frame-a", "height", 320, "alice");
  assert.equal(updates.length, 2);

  Y.applyUpdate(receiver.doc, updates[1]);
  Y.applyUpdate(receiver.doc, updates[0]);
  Y.applyUpdate(receiver.doc, updates[1]);
  assert.deepEqual(materializePen(receiver), materializePen(sender));
});

test("legacy metadata never gates otherwise valid edits", () => {
  const model = createModel(fixture);
  model.metadata.set("modelVersion", 999);
  setNodeProperty(model, "frame-a", "width", 240, "alice");
  assert.equal(findNode(materializePen(model).children, "frame-a").width, 240);
});

test("a 5,000-node document converges after concurrent bulk edits within a bounded update", () => {
  const children = Array.from({ length: 5_000 }, (_, index) => ({
    id: `node-${String(index).padStart(5, "0")}`,
    type: index % 2 === 0 ? "rectangle" : "text",
    x: index,
    content: index % 2 === 0 ? undefined : `Label ${index}`,
  })).map((node) =>
    Object.fromEntries(
      Object.entries(node).filter(([, value]) => value !== undefined),
    ),
  );
  const started = performance.now();
  const base = createModel({ version: "2.15", children });
  const alice = cloneModel(base);
  const bob = cloneModel(base);
  for (let index = 0; index < 200; index += 1) {
    setNodeProperty(
      alice,
      `node-${String(index).padStart(5, "0")}`,
      "x",
      index + 10_000,
      "alice",
    );
    setNodeProperty(
      bob,
      `node-${String(index + 200).padStart(5, "0")}`,
      "opacity",
      0.5,
      "bob",
    );
  }
  syncModels(alice, bob);
  const updateBytes = Y.encodeStateAsUpdate(alice.doc).byteLength;
  const elapsedMs = Math.round(performance.now() - started);

  assert.deepEqual(materializePen(alice), materializePen(bob));
  assert.equal(materializePen(alice).children.length, 5_000);
  assert.ok(updateBytes < 20_000_000, `Unexpected ${updateBytes}-byte update.`);
  assert.ok(elapsedMs < 10_000, `Unexpected ${elapsedMs}ms validation time.`);
});

function findNode(nodes, id) {
  for (const node of nodes ?? []) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return null;
}

function countNode(nodes, id) {
  return (nodes ?? []).reduce(
    (count, node) =>
      count + (node.id === id ? 1 : 0) + countNode(node.children, id),
    0,
  );
}
