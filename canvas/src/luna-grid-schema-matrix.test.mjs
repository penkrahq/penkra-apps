import assert from "node:assert/strict";
import test from "node:test";

import { buildCapabilityVerificationIR } from "./exporter-ir.mjs";
import { capabilityPathInventory, validateCanvasDocument } from "./canvas-schema.mjs";

function gridDocument(columns, rows, role = "ios") {
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "screen", type: "frame", role, width: 320, height: 240, layout: "none", children: [{
      id: "grid", type: "frame", width: 320, height: 240, layout: "grid", gridTemplateColumns: columns, gridTemplateRows: rows,
      columnGap: 10, rowGap: 15, padding: [11, 12, 13, 14], children: [
        { id: "first", type: "rectangle", width: 40, height: 30, gridColumn: 1, gridRow: 1, fill: "#123456" },
        { id: "second", type: "rectangle", width: 40, height: 30, gridColumn: 2, gridRow: 2, fill: "#654321" },
      ],
    }] }],
  };
}

function schemaResult(document) { return validateCanvasDocument(document, { throw: false }); }

test("grid columns and rows validate the bounded renderer track domain", () => {
  const valid = [[100, 180], [0, "0fr"], [10.5, 2.25], ["auto"], ["1.25fr"], ["1fr", "2fr"], []];
  for (const tracks of valid) {
    assert.equal(schemaResult(gridDocument(tracks, tracks)).valid, true, JSON.stringify(tracks));
    assert.equal(schemaResult(gridDocument(tracks, [100, 180])).valid, true, `columns ${JSON.stringify(tracks)}`);
    assert.equal(schemaResult(gridDocument([100, 180], tracks)).valid, true, `rows ${JSON.stringify(tracks)}`);
  }
  const invalid = [-1, NaN, Infinity, "-1fr", "+1fr", ".5fr", "1e2fr", `${"4".repeat(400)}.0fr`, " 1fr", "1fr ", "minmax(10, 1fr)", "repeat(2, 1fr)", "50%", {}, null];
  for (const value of invalid) {
    const columns = schemaResult(gridDocument([value], [100]));
    assert.equal(columns.valid, false, `columns ${String(value)}`);
    assert.ok(columns.errors.some((error) => error.includes("gridTemplateColumns[0]")), `columns path ${String(value)}`);
    const rows = schemaResult(gridDocument([100], [value]));
    assert.equal(rows.valid, false, `rows ${String(value)}`);
    assert.ok(rows.errors.some((error) => error.includes("gridTemplateRows[0]")), `rows path ${String(value)}`);
  }
  for (const keyword of ["fill_container", "fit_content"]) {
    assert.equal(schemaResult(gridDocument([keyword], [100])).valid, false, `columns ${keyword}`);
    assert.equal(schemaResult(gridDocument([100], [keyword])).valid, false, `rows ${keyword}`);
  }
});

test("auto, fr, fixed, mixed and empty tracks reach finite resolved geometry", () => {
  const fixtures = [[], [100], ["auto"], ["1fr", "2fr"], [0, "0fr"], [40, "1fr", "auto"]];
  for (const role of ["ios", "android"]) {
    for (const tracks of fixtures) {
      const document = gridDocument(tracks, tracks, role);
      assert.equal(schemaResult(document).valid, true, `${role}/${JSON.stringify(tracks)}`);
      const ir = buildCapabilityVerificationIR(document, { role, frames: ["screen"] }, capabilityPathInventory());
      for (const id of ["first", "second"]) {
        const node = ir.outputs[0].nodes.find((candidate) => candidate.id === id);
        assert.ok(node, `${role}/${JSON.stringify(tracks)}/${id}`);
        assert.ok([node.geometry.localX, node.geometry.localY, node.geometry.w, node.geometry.h].every(Number.isFinite), `${role}/${JSON.stringify(tracks)}/${id}`);
        assert.ok(node.geometry.w > 0 && node.geometry.h > 0, `${role}/${JSON.stringify(tracks)}/${id}`);
      }
    }
  }
});

test("box dimensions retain fill/fit semantics and existing variable cascades remain valid", () => {
  const document = gridDocument([100, "1fr"], [60, "auto"]);
  const screen = document.children[0];
  const grid = screen.children[0];
  grid.children[0].width = "fill_container";
  grid.children[0].height = "fit_content";
  document.axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };
  document.variables = { accent: { tokenType: "color", cascade: [{ value: "#123456" }, { value: "#abcdef", when: { appearance: "dark" } }] } };
  grid.children[0].fill = "${accent}";
  grid.columnGap = [{ value: 10 }, { value: 20, when: { appearance: "dark" } }];
  assert.equal(schemaResult(document).valid, true);
  const ir = buildCapabilityVerificationIR(document, { role: "ios", frames: ["screen"], modes: { appearance: "dark" } }, capabilityPathInventory());
  const first = ir.outputs[0].nodes.find(({ id }) => id === "first");
  assert.ok(first && [first.geometry.localX, first.geometry.localY, first.geometry.w, first.geometry.h].every(Number.isFinite));
  assert.equal(first.paint.fill, "#abcdef");
  const resolvedGrid = ir.outputs[0].nodes.find(({ id }) => id === "grid");
  assert.equal(resolvedGrid.layout.columnGap, 20);
});
