import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { computeAllLayouts } from "../vendor/open-pencil/engine.mjs";

import {
  analyzeOpenPencilCompatibility,
  createOpenPencilEditor,
  createOpenPencilGraph,
  fitOpenPencilDesign,
  isOpenPencilEditableNode,
  penPropertyToSceneChanges,
  refreshOpenPencilEditor,
  sceneEventToPenMutations,
  sceneNodePropertySnapshot,
  sceneNodeToPenNode,
  sceneUpdateToMutations,
} from "./openpencil-engine.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import { preparePencilScriptRuntime } from "./pencil-script-runtime.mjs";

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

test("Pencil image opacity and blend mode survive asset binding", () => {
  const graph = createOpenPencilGraph({
    version: "2.17",
    children: [{
      id: "image",
      type: "rectangle",
      width: 100,
      height: 100,
      fill: { type: "image", url: "image.png", opacity: 0.4, blendMode: "multiply" },
    }],
  }, new Map([["image.png", { sha256: "b".repeat(64), bytes: new Uint8Array([1]) }]]));

  assert.equal(graph.getNode("image").fills[0].opacity, 0.4);
  assert.equal(graph.getNode("image").fills[0].blendMode, "MULTIPLY");
});

test("Pencil Linear Burn and Linear Dodge reach their exact renderer blend modes", () => {
  const document = {
    version: "2.17",
    children: [
      { id: "burn", type: "rectangle", fill: { type: "color", color: "#fff", blendMode: "linearBurn" } },
      { id: "dodge", type: "rectangle", fill: { type: "color", color: "#fff", blendMode: "linearDodge" } },
      { id: "shadow", type: "rectangle", effect: { type: "shadow", blendMode: "linearBurn" } },
    ],
  };
  const graph = createOpenPencilGraph(document);

  assert.deepEqual(analyzeOpenPencilCompatibility(document), []);
  assert.equal(graph.getNode("burn").fills[0].blendMode, "LINEAR_BURN");
  assert.equal(graph.getNode("dodge").fills[0].blendMode, "LINEAR_DODGE");
  assert.equal(graph.getNode("shadow").effects[0].blendMode, "LINEAR_BURN");
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

test("keyboard nudges update the selected scene node without replacing the editor graph", () => {
  const editor = createOpenPencilEditor({
    version: "2.17",
    children: [{ id: "card", type: "frame", x: 12, y: 20, width: 100, height: 80, children: [] }],
  });
  const graph = editor.graph;
  const updates = [];
  editor.onEditorEvent("node:updated", (nodeId, changes) => updates.push({ nodeId, changes }));
  editor.select(["card"]);

  editor.nudgeSelected(1, -10);

  assert.equal(editor.graph, graph);
  assert.equal(editor.graph.getNode("card").x, 13);
  assert.equal(editor.graph.getNode("card").y, 10);
  assert.deepEqual(updates, [{ nodeId: "card", changes: { x: 13, y: 10 } }]);
});

test("deleting a selected node keeps the graph and restores it through editor undo", () => {
  const editor = createOpenPencilEditor({
    version: "2.17",
    children: [
      { id: "first", type: "frame", x: 0, y: 0, width: 100, height: 80, children: [] },
      { id: "second", type: "frame", x: 200, y: 0, width: 100, height: 80, children: [] },
    ],
  });
  const graph = editor.graph;
  const deleted = [];
  const created = [];
  editor.onEditorEvent("node:deleted", (nodeId) => deleted.push(nodeId));
  editor.onEditorEvent("node:created", (node) => created.push(node.id));
  editor.select(["first"]);

  editor.deleteSelected();

  assert.equal(editor.graph, graph);
  assert.equal(editor.graph.getNode("first"), undefined);
  assert.deepEqual(deleted, ["first"]);
  assert.equal(editor.undo.canUndo, true);
  editor.undoAction();
  assert.equal(editor.graph.getNode("first").x, 0);
  assert.deepEqual(created, ["first"]);
});

test("deletion still relayouts a parent that owns an auto-layout flow", () => {
  const editor = createOpenPencilEditor({
    version: "2.17",
    children: [{
      id: "stack",
      type: "frame",
      layout: "vertical",
      gap: 10,
      width: 100,
      children: [
        { id: "first", type: "frame", width: 100, height: 40, children: [] },
        { id: "second", type: "frame", width: 100, height: 40, children: [] },
      ],
    }],
  });
  assert.equal(editor.graph.getNode("second").y, 50);
  editor.select(["first"]);

  editor.deleteSelected();

  assert.equal(editor.graph.getNode("second").y, 0);
});

test("deferring the fallback-font layout preserves the final graph geometry", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "stack",
      type: "frame",
      width: 300,
      height: "hug_content",
      layout: "vertical",
      padding: 12,
      gap: 8,
      children: [
        { id: "first", type: "text", content: "First", fontSize: 16 },
        { id: "second", type: "text", content: "Second", fontSize: 16 },
      ],
    }],
  };
  const eager = createOpenPencilGraph(source);
  const deferred = createOpenPencilGraph(source, new Map(), null, { computeLayout: false });

  for (const page of deferred.getPages()) computeAllLayouts(deferred, page.id);

  for (const id of ["stack", "first", "second"]) {
    const eagerNode = eager.getNode(id);
    const deferredNode = deferred.getNode(id);
    assert.deepEqual(
      {
        x: deferredNode.x,
        y: deferredNode.y,
        width: deferredNode.width,
        height: deferredNode.height,
      },
      {
        x: eagerNode.x,
        y: eagerNode.y,
        width: eagerNode.width,
        height: eagerNode.height,
      },
    );
  }
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

test("Pencil slots retain their component and instance visual semantics without changing the source", () => {
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

  source.children.push({ id: "slot-instance", type: "ref", ref: "app-owned" });
  source.children[0].reusable = true;
  const before = structuredClone(source);
  const graph = createOpenPencilGraph(source);
  assert.deepEqual(graph.getNode("app-owned").fills, []);
  assert.equal(graph.getNode("app-owned").pencilSlotKind, "component");
  assert.equal(graph.getNode("slot-instance").pencilSlotKind, "instance");
  assert.deepEqual(source.children[0].slot, []);
  assert.equal(source.children[0].fill, undefined);
  assert.deepEqual(source, before);
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

test("inspector properties translate to incremental scene changes", () => {
  assert.deepEqual(penPropertyToSceneChanges({}, "x", 12), { x: 12 });
  assert.deepEqual(penPropertyToSceneChanges({}, "gap", 8), { itemSpacing: 8 });
  assert.deepEqual(penPropertyToSceneChanges({}, "padding", "4, 8"), {
    paddingTop: 4,
    paddingRight: 8,
    paddingBottom: 4,
    paddingLeft: 8,
  });
  assert.deepEqual(penPropertyToSceneChanges({ fills: [] }, "fill", "#ff800080"), {
    fills: [{
      type: "SOLID",
      visible: true,
      opacity: 1,
      color: { r: 1, g: 128 / 255, b: 0, a: 128 / 255 },
    }],
  });
});

test("a selected frame edit does not serialize derived geometry onto untouched nodes", async () => {
  const source = JSON.parse(await readFile(
    new URL("../compatibility/fixtures/unknown-content-2.15.pen", import.meta.url),
    "utf8",
  ));
  const editor = createOpenPencilEditor(source);
  editor.select(["known-frame"]);
  const knownBefore = sceneNodePropertySnapshot(editor.graph.getNode("known-frame"));
  assert.equal(editor.graph.getNode("future-node"), undefined);

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
  assert.deepEqual(analyzeOpenPencilCompatibility(source).map(({ nodeId, kind }) => [nodeId, kind]), [
    ["future-node", "node-type"],
  ]);
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

test("Pencil gradients and blur effects map faithfully without changing the source", () => {
  const document = {
    version: "2.15",
    children: [{
      id: "gradient",
      type: "rectangle",
      width: 200,
      height: 20,
      fill: {
        type: "gradient",
        gradientType: "linear",
        rotation: 270,
        colors: [
          { color: "#ff0000", position: 0 },
          { color: "#0000ff", position: 1 },
        ],
      },
      effect: { type: "blur", radius: 12 },
    }],
  };
  const before = structuredClone(document);
  const graph = createOpenPencilGraph(document);
  const node = graph.getNode("gradient");
  assert.deepEqual(analyzeOpenPencilCompatibility(document), []);
  assert.equal(node.fills[0].type, "GRADIENT_LINEAR");
  assert.deepEqual(node.fills[0].gradientStops.map((stop) => stop.position), [0, 1]);
  assert.ok(node.fills[0].gradientTransform.m00 < -0.99);
  assert.equal(node.effects[0].type, "LAYER_BLUR");
  assert.equal(node.effects[0].radius, 12);
  assert.deepEqual(document, before);
});

test("layoutIncludeStroke uses inside strokes as Yoga border-box layout space", () => {
  const included = createOpenPencilGraph({
    version: "2.17",
    children: [{
      id: "included",
      type: "frame",
      layout: "horizontal",
      layoutIncludeStroke: true,
      stroke: "#000000",
      strokeWidth: 5,
      strokeAlignment: "inner",
      children: [{ id: "child", type: "rectangle", width: 20, height: 10 }],
    }],
  });
  const excluded = createOpenPencilGraph({
    version: "2.17",
    children: [{
      id: "excluded",
      type: "frame",
      layout: "horizontal",
      layoutIncludeStroke: false,
      stroke: "#000000",
      strokeWidth: 5,
      strokeAlignment: "inner",
      children: [{ id: "other-child", type: "rectangle", width: 20, height: 10 }],
    }],
  });

  assert.equal(included.getNode("included").strokesIncludedInLayout, true);
  assert.equal(included.getNode("included").width, 30);
  assert.equal(included.getNode("included").height, 20);
  assert.equal(included.getNode("child").x, 5);
  assert.equal(included.getNode("child").y, 5);
  assert.equal(excluded.getNode("excluded").width, 20);
  assert.equal(excluded.getNode("excluded").height, 10);
  assert.equal(excluded.getNode("other-child").x, 0);
});

test("unsupported Pencil 2.17 visuals are reported without silent fallbacks", () => {
  const document = {
    version: "2.17",
    children: [
      { id: "annotation", type: "note", content: "Review" },
      { id: "context", type: "context", content: "Reference" },
      { id: "prompt", type: "prompt", content: "Generate" },
      { id: "script", type: "script", code: "return [];" },
      { id: "shader", type: "rectangle", fill: { type: "shader", code: "" } },
      { id: "mesh", type: "rectangle", fill: { type: "mesh_gradient", points: [] } },
      { id: "blend", type: "rectangle", fill: { type: "color", color: "#fff", blendMode: "linearBurn" } },
      { id: "layout-stroke", type: "frame", layoutIncludeStroke: true, children: [] },
      { id: "external-ref", type: "ref", ref: "library:button" },
    ],
  };
  const issues = analyzeOpenPencilCompatibility(document);
  const graph = createOpenPencilGraph(document);

  assert.deepEqual(issues.map(({ nodeId, kind }) => [nodeId, kind]), [
    ["script", "script"],
    ["shader", "shader"],
    ["mesh", "mesh-gradient"],
    ["external-ref", "component"],
  ]);
  assert.ok(issues.every(({ message }) => message.includes("preserved")));
  assert.equal(graph.getNode("annotation").type, "FRAME");
  assert.equal(graph.getNode("context").type, "FRAME");
  assert.equal(graph.getNode("prompt").type, "FRAME");
  assert.equal(graph.getNode("script"), undefined);
  assert.equal(graph.getNode("shader").fills[0].visible, false);
  assert.equal(graph.getNode("mesh").fills[0].visible, false);
  assert.equal(graph.getNode("blend").fills[0].blendMode, "LINEAR_BURN");
});

test("Pencil note, context, and prompt nodes retain their semantic source and exact visual structure", () => {
  const source = {
    version: "2.17",
    children: [
      { id: "note", type: "note", width: 174, content: "Review this area" },
      { id: "context", type: "context", content: "Reference material" },
      { id: "prompt", type: "prompt", content: "Generate a variation", model: "default" },
    ],
  };
  const before = structuredClone(source);
  const prepared = prepareOpenPencilRenderDocument(source);
  const graph = createOpenPencilGraph(source, new Map(), prepared);

  assert.deepEqual(prepared.issues, []);
  assert.deepEqual(analyzeOpenPencilCompatibility(source, new Map(), prepared), []);
  assert.equal(graph.getNode("note").type, "FRAME");
  assert.equal(graph.getNode("note").width, 250);
  assert.equal(graph.getNode("note").height, 219);
  assert.equal(graph.getNode("note").locked, true);
  assert.equal(graph.getNode("note::sticky::header").height, 45);
  assert.equal(graph.getNode("note::sticky::header").fills[0].color.r, 1);
  assert.equal(graph.getNode("note::sticky::title").fontFamily, "JetBrains Mono");
  assert.equal(graph.getNode("note::sticky::title").fontWeight, 500);
  assert.deepEqual(graph.getNode("note::sticky::divider").strokes[0].dashPattern, [4, 4]);
  assert.equal(graph.getNode("note::sticky::content").text, "Review this area");
  assert.equal(graph.getNode("prompt::sticky::copy-label").text, "Copy");
  assert.equal(graph.getNode("prompt::sticky::copy").height, 26);
  assert.equal(isOpenPencilEditableNode(source.children[0]), false);
  assert.deepEqual(source, before);
});

test("Pencil script nodes render sandboxed derived children without changing source", async () => {
  await preparePencilScriptRuntime();
  const code = new TextEncoder().encode(`/**
   * @schema 2.17
   * @input count: number(min=1, max=4) = 2
   * @input fill: color = #ff0000
   */
  return Array.from({length: pencil.input.count}, (_, index) => ({
    type: "rectangle", x: index * 25, width: 20, height: pencil.height, fill: pencil.input.fill
  }));`);
  const document = {
    version: "2.17",
    variables: { accent: { type: "color", value: "#123456" } },
    children: [{
      id: "bars",
      type: "script",
      width: 100,
      height: 40,
      scriptUri: "scripts/bars.js",
      inputs: { count: 3, fill: "$accent" },
    }],
  };
  const before = structuredClone(document);
  const assets = new Map([["scripts/bars.js", { bytes: code, sha256: "b".repeat(64) }]]);
  const prepared = prepareOpenPencilRenderDocument(document, { assets });
  const graph = createOpenPencilGraph(document, assets, prepared);

  assert.deepEqual(prepared.issues, []);
  assert.equal(graph.getNode("bars").type, "FRAME");
  assert.equal(graph.getNode("bars").childIds.length, 3);
  assert.equal(graph.getNode("bars::script::0").fills[0].color.r, 0x12 / 255);
  assert.equal(graph.getNode("bars::script::0").locked, true);
  assert.equal(isOpenPencilEditableNode(document.children[0]), false);
  assert.deepEqual(analyzeOpenPencilCompatibility(document, assets, prepared), []);
  assert.deepEqual(document, before);
});

test("Pencil shader fills compile into a semantic WebGL render definition", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "shader-card",
      type: "rectangle",
      width: 120,
      height: 80,
      fill: {
        type: "shader",
        url: "shaders/checker.frag",
        uniforms: { u_size: 12 },
      },
    }],
  };
  const shader = new TextEncoder().encode(`#version 100
precision mediump float;
/** @resolution */ uniform vec2 u_resolution;
/** @time */ uniform float u_time;
/** @default 8 */ uniform float u_size;
void main() { gl_FragColor = vec4(gl_FragCoord.xy / u_resolution, mod(u_time, u_size), 1.0); }
`);
  const assets = new Map([["shaders/checker.frag", { bytes: shader, sha256: "d".repeat(64) }]]);
  const before = structuredClone(source);
  const prepared = prepareOpenPencilRenderDocument(source, { assets });
  const graph = createOpenPencilGraph(source, assets, prepared);
  const fill = graph.getNode("shader-card").fills[0];

  assert.deepEqual(prepared.issues, []);
  assert.deepEqual(analyzeOpenPencilCompatibility(source, assets, prepared), []);
  assert.equal(fill.type, "CUSTOM");
  assert.equal(fill.pencilShader.values.u_size, 12);
  assert.deepEqual(fill.pencilShader.uniforms.map(({ automatic }) => automatic), ["resolution", "time", null]);
  assert.deepEqual(source, before);
});

test("Pencil mesh gradients retain their exact grid and normalized handles", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "mesh-card",
      type: "rectangle",
      width: 100,
      height: 100,
      fill: {
        type: "mesh_gradient",
        columns: 2,
        rows: 2,
        colors: ["#ff0000", "#00ff00", "#0000ff", "#ffffff"],
        points: [[0, 0], [1, 0], [0, 1], { position: [1, 1], leftHandle: [-0.4, 0] }],
      },
    }],
  };
  const before = structuredClone(source);
  const graph = createOpenPencilGraph(source);
  const fill = graph.getNode("mesh-card").fills[0];

  assert.deepEqual(analyzeOpenPencilCompatibility(source), []);
  assert.equal(fill.type, "CUSTOM");
  assert.equal(fill.pencilMesh.columns, 2);
  assert.deepEqual(fill.pencilMesh.points[0].rightHandle, [0.25, 0]);
  assert.deepEqual(fill.pencilMesh.points[3].leftHandle, [-0.4, 0]);
  assert.deepEqual(source, before);
});

test("Pencil design-library imports provide reusable components without appearing on the page", () => {
  const library = new TextEncoder().encode(JSON.stringify({
    version: "2.17",
    variables: { surface: { type: "color", value: "#abcdef" } },
    children: [{
      id: "library-card",
      type: "frame",
      reusable: true,
      width: 120,
      height: 60,
      fill: "$surface",
      children: [{ id: "library-label", type: "text", content: "Library" }],
    }],
  }));
  const document = {
    version: "2.17",
    imports: { cards: "libraries/cards.lib.pen" },
    children: [{ id: "card-instance", type: "ref", ref: "library-card", x: 20, y: 30 }],
  };
  const before = structuredClone(document);
  const assets = new Map([["libraries/cards.lib.pen", { bytes: library, sha256: "c".repeat(64) }]]);
  const prepared = prepareOpenPencilRenderDocument(document, { assets });
  const graph = createOpenPencilGraph(document, assets, prepared);
  const page = graph.getPages()[0];

  assert.deepEqual(prepared.issues, []);
  assert.equal(graph.getNode("library-card").parentId, graph.rootId);
  assert.deepEqual(page.childIds, ["card-instance"]);
  assert.equal(graph.getNode("card-instance").width, 120);
  assert.equal(graph.getNode("card-instance").fills[0].color.r, 0xab / 255);
  assert.deepEqual(analyzeOpenPencilCompatibility(document, assets, prepared), []);
  assert.deepEqual(document, before);
});

test("Pencil gradient and blended stroke paints reach the renderer semantically", () => {
  const document = {
    version: "2.17",
    children: [
      {
        id: "gradient-stroke",
        type: "rectangle",
        stroke: {
          type: "gradient",
          gradientType: "linear",
          blendMode: "multiply",
          colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }],
        },
        strokeWidth: 8,
      },
      {
        id: "solid-stroke",
        type: "rectangle",
        stroke: { type: "color", color: "#ff0000", blendMode: "linearBurn" },
        strokeWidth: 2,
      },
    ],
  };
  const graph = createOpenPencilGraph(document);
  assert.deepEqual(analyzeOpenPencilCompatibility(document), []);
  assert.equal(graph.getNode("gradient-stroke").strokes[0].type, "GRADIENT_LINEAR");
  assert.equal(graph.getNode("gradient-stroke").strokes[0].gradientStops.length, 2);
  assert.equal(graph.getNode("gradient-stroke").strokes[0].blendMode, "MULTIPLY");
  assert.equal(graph.getNode("solid-stroke").strokes[0].blendMode, "LINEAR_BURN");
});

test("native icon nodes render from their provider while keeping Pencil semantics", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "back",
      type: "icon",
      library: "lucide",
      icon: "arrow-left",
      fill: "#334455",
      width: 15,
      height: 15,
    }],
  };
  const graph = createOpenPencilGraph(source);
  const icon = graph.getNode("back");

  assert.equal(source.children[0].type, "icon");
  assert.equal(icon.type, "VECTOR");
  assert.equal(icon.strokes[0].weight, 1.25);
  assert.deepEqual(icon.vectorNetwork.vertices.slice(1, 5), [
    { x: 7.5, y: 11.875 },
    { x: 3.125, y: 7.5 },
    { x: 7.5, y: 3.125 },
    { x: 11.875, y: 7.5 },
  ]);
});

test("weighted Material Symbols remain semantic text backed by the official variable font", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "home",
      type: "icon",
      library: "Material Symbols Rounded",
      icon: "home",
      weight: 700,
      fill: "#334455",
      width: 24,
      height: 24,
    }],
  };
  const before = structuredClone(source);
  const graph = createOpenPencilGraph(source);
  const icon = graph.getNode("home");

  assert.deepEqual(analyzeOpenPencilCompatibility(source), []);
  assert.equal(icon.type, "TEXT");
  assert.equal(icon.text, "home");
  assert.equal(icon.fontFamily, "Material Symbols Rounded");
  assert.equal(icon.fontWeight, 700);
  assert.equal(icon.textAutoResize, "NONE");
  assert.deepEqual(source, before);
});

test("numeric-string font weights and Pencil text styling survive import", () => {
  const graph = createOpenPencilGraph({
    version: "2.17",
    children: [{
      id: "label",
      type: "text",
      content: "Medium",
      fontWeight: "500",
      fontStyle: "italic",
      underline: true,
    }],
  });
  const label = graph.getNode("label");
  assert.equal(label.fontWeight, 500);
  assert.equal(label.italic, true);
  assert.equal(label.textDecoration, "UNDERLINE");
});

test("Pencil even-odd path fill rules reach the native vector network", () => {
  const graph = createOpenPencilGraph({
    version: "2.17",
    children: [{
      id: "ring",
      type: "path",
      width: 10,
      height: 10,
      geometry: "M0 0H10V10H0Z M2 2H8V8H2Z",
      viewBox: [0, 0, 10, 10],
      fillRule: "evenodd",
      fill: "#000000",
    }],
  });

  assert.equal(graph.getNode("ring").vectorNetwork.regions[0].windingRule, "EVENODD");
});

test("Pencil line nodes stay semantic and preserve horizontal, vertical, and diagonal geometry", () => {
  const source = {
    version: "2.17",
    children: [
      { id: "horizontal", type: "line", width: 60, height: 0, stroke: "#11181c", strokeWidth: 4 },
      { id: "diagonal", type: "line", width: 60, height: 22, stroke: "#3057e1", strokeWidth: 8, strokeLinecap: "round" },
      { id: "vertical", type: "line", width: 0, height: 30, stroke: "#e5484d", strokeWidth: 10, strokeLinecap: "square" },
    ],
  };
  const before = structuredClone(source);
  const graph = createOpenPencilGraph(source);
  assert.deepEqual(analyzeOpenPencilCompatibility(source), []);
  assert.equal(graph.getNode("horizontal").type, "LINE");
  assert.deepEqual([graph.getNode("diagonal").width, graph.getNode("diagonal").height], [60, 22]);
  assert.equal(graph.getNode("diagonal").strokeCap, "ROUND");
  assert.equal(graph.getNode("vertical").strokeCap, "SQUARE");
  assert.deepEqual(source, before);
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
