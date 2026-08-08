import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyzeOpenPencilCompatibility,
  createOpenPencilEditor,
  fitOpenPencilDesign,
  refreshOpenPencilEditor,
  sceneEventToPenMutations,
  sceneNodePropertySnapshot,
  sceneNodeToPenNode,
  sceneUpdateToMutations,
} from "./openpencil-engine.mjs";

test("OpenPencil computes nested auto-layout instead of collapsing children at the origin", () => {
  const editor = createOpenPencilEditor({
    version: "2.15",
    children: [{
      id: "phone",
      type: "frame",
      width: 390,
      height: 844,
      layout: "vertical",
      padding: 24,
      gap: 16,
      children: [
        { id: "heading", type: "text", content: "Welcome", fontSize: 24 },
        { id: "body", type: "text", content: "Choose a language", fontSize: 16 },
      ],
    }],
  });
  const heading = editor.graph.getNode("heading");
  const body = editor.graph.getNode("body");
  assert.equal(editor.graph.getNode("phone").layoutMode, "VERTICAL");
  assert.equal(heading.y, 24);
  assert.ok(body.y > heading.y, `expected body (${body.y}) below heading (${heading.y})`);
});

test("scene edits translate to lossless Penkra mutations", () => {
  assert.deepEqual(sceneUpdateToMutations("heading", { x: 12, text: "Hello", visible: false }), [
    { kind: "set-property", nodeId: "heading", property: "x", value: 12 },
    { kind: "set-property", nodeId: "heading", property: "enabled", value: false },
    { kind: "set-property", nodeId: "heading", property: "content", value: "Hello" },
  ]);
});

test("a selected frame edit does not serialize derived geometry onto untouched nodes", async () => {
  const source = JSON.parse(await readFile(
    new URL("../compatibility/fixtures/unknown-content-2.15.pen", import.meta.url),
    "utf8",
  ));
  const editor = createOpenPencilEditor(source);
  editor.select(["known-frame"]);
  const knownBefore = sceneNodePropertySnapshot(editor.graph.getNode("known-frame"));
  const futureBefore = sceneNodePropertySnapshot(editor.graph.getNode("future-node"));
  assert.equal(editor.graph.getNode("future-node").locked, true);

  assert.deepEqual(
    sceneEventToPenMutations(
      editor,
      source,
      "known-frame",
      { width: 322, x: 0, y: 0 },
      knownBefore,
    ),
    [{ kind: "set-property", nodeId: "known-frame", property: "width", value: 322 }],
  );
  assert.deepEqual(
    sceneEventToPenMutations(
      editor,
      source,
      "future-node",
      { x: -0.12109375, y: 0 },
      futureBefore,
    ),
    [],
  );
  editor.select(["future-node"]);
  assert.deepEqual(
    sceneEventToPenMutations(
      editor,
      source,
      "future-node",
      { x: 12, y: 8 },
      futureBefore,
    ),
    [],
  );
  assert.equal(Object.hasOwn(source.children[0].children[0], "x"), false);
  assert.equal(Object.hasOwn(source.children[0].children[0], "y"), false);
});

test("moving a selected supported node to zero remains an authored edit", () => {
  const source = {
    version: "2.15",
    children: [{ id: "frame", type: "frame", x: 24, y: 36, width: 100, height: 100 }],
  };
  const editor = createOpenPencilEditor(source);
  editor.select(["frame"]);
  const before = sceneNodePropertySnapshot(editor.graph.getNode("frame"));

  assert.deepEqual(sceneEventToPenMutations(editor, source, "frame", { x: 0, y: 0 }, before), [
    { kind: "set-property", nodeId: "frame", property: "x", value: 0 },
    { kind: "set-property", nodeId: "frame", property: "y", value: 0 },
  ]);
});

test("unsupported visuals are reported without changing the source", () => {
  const document = {
    version: "2.15",
    children: [{
      id: "gradient",
      type: "rectangle",
      fill: { type: "gradient", color: "#fff" },
      effect: { type: "blur", blur: 12 },
    }],
  };
  const before = structuredClone(document);
  const issues = analyzeOpenPencilCompatibility(document);
  assert.deepEqual(issues.map((issue) => issue.kind), ["fill", "effect"]);
  assert.deepEqual(document, before);
});

test("new OpenPencil nodes map to explicit .pen nodes", () => {
  assert.deepEqual(sceneNodeToPenNode({
    id: "shape",
    type: "RECTANGLE",
    name: "Card",
    x: 10,
    y: 20,
    width: 200,
    height: 120,
    fills: [{ type: "SOLID", visible: true, opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 } }],
  }), {
    id: "shape",
    type: "rectangle",
    name: "Card",
    x: 10,
    y: 20,
    width: 200,
    height: 120,
    fill: "#ff0000",
  });
});

test("repeated document refresh keeps one editor, viewport, and selection", () => {
  const source = {
    version: "2.15",
    children: [{
      id: "screen",
      type: "frame",
      name: "Screen",
      x: 0,
      y: 0,
      width: 320,
      height: 640,
      children: [],
    }],
  };
  const editor = createOpenPencilEditor(source);
  editor.state.panX = 27;
  editor.state.panY = 41;
  editor.state.zoom = 0.75;

  for (let index = 0; index < 5; index += 1) {
    source.children[0].name = `Screen ${index}`;
    assert.equal(refreshOpenPencilEditor(editor, source, "screen"), editor);
    assert.equal(editor.graph.getNode("screen").name, `Screen ${index}`);
    assert.deepEqual([...editor.state.selectedIds], ["screen"]);
    assert.equal(editor.state.panX, 27);
    assert.equal(editor.state.panY, 41);
    assert.equal(editor.state.zoom, 0.75);
  }
});

test("fit design includes every screen in the unobscured viewport regardless of selection", () => {
  const screens = [39, 470, 900, 1330].map((x, index) => ({
    id: `screen-${index + 1}`,
    type: "frame",
    name: `Screen ${index + 1}`,
    x,
    y: 70,
    width: 390,
    height: 844,
    children: [],
  }));
  const editor = createOpenPencilEditor({
    version: "2.15",
    children: [{
      id: "flow",
      type: "frame",
      x: 0,
      y: 0,
      width: 1760,
      height: 984,
      layout: "none",
      children: screens,
    }],
  });
  editor.select(["screen-2"]);
  const viewport = fitOpenPencilDesign(editor, {
    width: 1200,
    height: 900,
    left: 638,
  });
  assert.ok(viewport);
  const flow = editor.graph.getNode("flow");
  assert.ok(viewport.panX + flow.x * viewport.zoom >= 638);
  assert.ok(viewport.panX + (flow.x + flow.width) * viewport.zoom <= 1200);
  assert.deepEqual([...editor.state.selectedIds], ["screen-2"]);
  assert.ok(editor.graph.getNode("screen-4"));
});
