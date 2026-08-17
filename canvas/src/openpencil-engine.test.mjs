import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyzeOpenPencilCompatibility,
  createOpenPencilEditor,
  createOpenPencilGraph,
  fitOpenPencilDesign,
  refreshOpenPencilEditor,
  sceneEventToPenMutations,
  sceneNodePropertySnapshot,
  sceneNodeToPenNode,
  sceneUpdateToMutations,
} from "./openpencil-engine.mjs";

test("binds imported image bytes to their lossless Pencil URL fill", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const source = {
    version: "2.17",
    children: [{
      id: "hero",
      type: "frame",
      width: 320,
      height: 180,
      fill: { type: "image", url: "assets/hero.png", mode: "fit" },
      children: [],
    }],
  };

  const graph = createOpenPencilGraph(source, new Map([
    ["assets/hero.png", { sha256: "a".repeat(64), bytes }],
  ]));

  assert.deepEqual(graph.images.get("a".repeat(64)), bytes);
  assert.equal(graph.getNode("hero").fills[0].type, "IMAGE");
  assert.equal(graph.getNode("hero").fills[0].imageHash, "a".repeat(64));
  assert.equal(graph.getNode("hero").fills[0].imageScaleMode, "FIT");
  assert.deepEqual(graph.getNode("hero").fills[0].color, { r: 1, g: 1, b: 1, a: 1 });
  assert.equal(source.children[0].fill.url, "assets/hero.png");
  assert.deepEqual(
    analyzeOpenPencilCompatibility(source, new Map([
      ["assets/hero.png", { sha256: "a".repeat(64), bytes }],
    ])),
    [],
  );
});

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

test("auto-sized text keeps hug-content flex layouts compact", () => {
  const editor = createOpenPencilEditor({
    version: "2.17",
    children: [{
      id: "menu-item",
      type: "frame",
      layout: "horizontal",
      padding: [6, 10],
      gap: 6,
      children: [
        { id: "icon", type: "rectangle", width: 14, height: 14 },
        { id: "label", type: "text", content: "Apps", fontSize: 13 },
      ],
    }],
  });
  const item = editor.graph.getNode("menu-item");
  const label = editor.graph.getNode("label");

  assert.equal(label.textAutoResize, "WIDTH_AND_HEIGHT");
  assert.ok(label.width < 100, `expected compact text width, got ${label.width}`);
  assert.ok(item.width < 150, `expected compact hug width, got ${item.width}`);
});

test("stored Pencil sizing fallbacks and fill-width text survive import", () => {
  const editor = createOpenPencilEditor({
    version: "2.17",
    children: [{
      id: "overlay-list",
      type: "frame",
      width: "fill_container(608)",
      layout: "vertical",
      children: [{
        id: "row",
        type: "frame",
        width: "fill_container",
        height: 40,
        layout: "horizontal",
        padding: [0, 10],
        children: [{
          id: "label",
          type: "text",
          width: "fill_container",
          textGrowth: "fixed-width",
          content: "Connection",
          fontSize: 13,
        }],
      }],
    }],
  });

  assert.equal(editor.graph.getNode("overlay-list").width, 608);
  assert.equal(editor.graph.getNode("row").width, 608);
  assert.equal(editor.graph.getNode("label").width, 588);
  assert.equal(editor.graph.getNode("label").height, 19);
});

test("OpenPencil resolves Pencil-style numeric variables before layout", () => {
  const source = {
    version: "2.17",
    themes: { state: ["default", "open"] },
    variables: {
      "folder-content-gap": {
        type: "number",
        value: [
          { value: 0, theme: { state: "default" } },
          { value: 2, theme: { state: "open" } },
        ],
      },
    },
    children: [{
      id: "folder",
      type: "frame",
      layout: "vertical",
      gap: "$folder-content-gap",
      theme: { state: "open" },
      children: [],
    }],
  };

  const editor = createOpenPencilEditor(source);

  assert.equal(editor.graph.getNode("folder").itemSpacing, 2);
  assert.equal(source.children[0].gap, "$folder-content-gap");
});

test("Pencil 2.17 scene properties survive normalization into the render graph", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "row",
      type: "frame",
      width: 300,
      height: 100,
      stroke: "#123456",
      strokeWidth: 2,
      strokeAlignment: "inner",
      children: [
        {
          id: "overlay",
          type: "frame",
          layoutPosition: "absolute",
          x: 12,
          y: 8,
          width: 40,
          height: 30,
        },
        {
          id: "fixed-text",
          type: "text",
          content: "Fixed",
          width: 80,
          height: 20,
          textGrowth: "fixed-width-height",
        },
        {
          id: "arc",
          type: "ellipse",
          width: 20,
          height: 20,
          innerRadius: 0.8,
          startAngle: 90,
          sweepAngle: -180,
        },
        {
          id: "path",
          type: "path",
          width: 200,
          height: 100,
          geometry: "M 10 20 L 60 70",
          viewBox: [0, 0, 100, 100],
          stroke: "#ffffff",
        },
      ],
    }],
  };

  const graph = createOpenPencilGraph(source);
  const row = graph.getNode("row");
  const overlay = graph.getNode("overlay");
  const textNode = graph.getNode("fixed-text");
  const arc = graph.getNode("arc");
  const path = graph.getNode("path");

  assert.equal(row.layoutMode, "HORIZONTAL");
  assert.equal(row.strokes.length, 1);
  assert.equal(row.strokes[0].weight, 2);
  assert.equal(row.strokes[0].align, "INSIDE");
  assert.equal(overlay.layoutPositioning, "ABSOLUTE");
  assert.equal(textNode.textAutoResize, "NONE");
  assert.ok(Math.abs(arc.arcData.startingAngle - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(arc.arcData.endingAngle + Math.PI / 2) < 1e-9);
  assert.equal(arc.arcData.innerRadius, 0.8);
  assert.deepEqual(
    path.vectorNetwork.vertices.map(({ x, y }) => [x, y]),
    [[20, 20], [120, 70]],
  );
  assert.deepEqual(source.children[0].strokeWidth, 2);
});

test("empty Pencil slots stay visually empty without changing the source", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "app-owned",
      type: "frame",
      width: 320,
      height: 180,
      slot: [],
    }],
  };

  const graph = createOpenPencilGraph(source);
  assert.deepEqual(graph.getNode("app-owned").fills, []);
  assert.deepEqual(source.children[0].slot, []);
  assert.equal(source.children[0].fill, undefined);
});

test("Pencil alpha colors are applied once and survive SVG export", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "alpha-frame",
      type: "frame",
      width: 100,
      height: 40,
      fill: "#FFFFFF0A",
      stroke: "#FF000080",
      strokeWidth: 1,
    }],
  };

  const editor = createOpenPencilEditor(source);
  const node = editor.graph.getNode("alpha-frame");
  const svg = editor.copySelectionAsSVG(["alpha-frame"]);

  assert.ok(Math.abs(node.fills[0].opacity - 10 / 255) < 1e-9);
  assert.equal(node.fills[0].color.a, 1);
  assert.ok(Math.abs(node.strokes[0].opacity - 128 / 255) < 1e-9);
  assert.equal(node.strokes[0].color.a, 1);
  assert.match(svg, /fill="#FFFFFF0A"/u);
  assert.match(svg, /stroke="#FF000080"/u);
});

test("fill-less Pencil frames stay transparent", () => {
  const graph = createOpenPencilGraph({
    version: "2.17",
    children: [{ id: "overlay", type: "frame", width: 320, height: 180 }],
  });

  assert.deepEqual(graph.getNode("overlay").fills, []);
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
