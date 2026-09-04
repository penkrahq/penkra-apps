import assert from "node:assert/strict";
import test from "node:test";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";

test("grid, wrap and min-max fields reach the owned Yoga fork", () => {
  const graph = createOpenPencilGraph({ version: "2.15", children: [{ id: "grid", type: "frame", layout: "grid", width: 300, height: 200, gridTemplateColumns: ["1fr", "2fr"], gridTemplateRows: [100, 100], gap: 10, wrap: true, minWidth: 200, maxWidth: 400, children: [{ id: "a", type: "rectangle", width: 10, height: 10, gridColumn: 1, gridRow: 1 }, { id: "b", type: "rectangle", width: 10, height: 10, gridColumn: 2, gridRow: 2 }] }] });
  const grid = graph.getNode("grid"); const b = graph.getNode("b");
  assert.equal(grid.layoutMode, "GRID"); assert.equal(grid.layoutWrap, "WRAP");
  assert.equal(grid.minWidth, 200); assert.equal(grid.maxWidth, 400);
  assert.ok(b.x > 100); assert.equal(b.y, 110);
});
