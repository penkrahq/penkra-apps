import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { validateCanvasDocument } from "./canvas-schema.mjs";

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const combinedCanvasRoot = resolve(process.env.CANVAS_GRID_COMBINED_CANVAS_ROOT ?? canvasRoot);

function baseDocument(gridTemplateColumns) {
  return {
    version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "screen", type: "frame", role: "ios", width: 320, height: 240, layout: "none", children: [{
        id: "grid", type: "frame", width: 320, height: 240, layout: "grid", gridTemplateColumns,
        gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15, padding: [11, 12, 13, 14], children: [
          { id: "first", type: "rectangle", width: 40, height: 30, gridColumn: 1, gridRow: 1, fill: "#123456" },
          { id: "second", type: "rectangle", width: 40, height: 30, gridColumn: 2, gridRow: 2, fill: "#654321" },
          { id: "overlay", type: "rectangle", x: 7, y: 9, width: 20, height: 10, layoutPosition: "absolute", fill: "#abcdef" },
        ],
      }],
    }],
  };
}

test("schema-valid gridTemplateColumns are explicitly separated from unresolved track keywords", () => {
  for (const tracks of [[100, 180], [180, 100], [0, 240], [320]]) {
    assert.equal(validateCanvasDocument(baseDocument(tracks), { throw: false }).valid, true, JSON.stringify(tracks));
  }
  for (const track of ["fill_container", "fit_content"]) {
    assert.equal(validateCanvasDocument(baseDocument([track, 100]), { throw: false }).valid, true, track);
  }
  for (const tracks of [["1fr", "2fr"], ["auto", 100], ["minmax(10, 1fr)", 100]]) {
    const result = validateCanvasDocument(baseDocument(tracks), { throw: false });
    assert.equal(result.valid, false, JSON.stringify(tracks));
    assert.ok(result.errors.some((error) => error.includes("gridTemplateColumns")));
  }
});

test("current mobile writers preserve resolved grid geometry and source order", async () => {
  const source = await readFile(join(combinedCanvasRoot, "src/exporters/mobile.mjs"), "utf8");
  assert.doesNotMatch(source, /gridTemplateColumns/u, "mobile writers must not reinterpret authored tracks");
  assert.match(source, /Canvas has already resolved track sizes, cell placement, gaps and padding/u);
  assert.match(source, /descendants\.map\(\(child\) => composeNode\(child, children, options, depth \+ 1, "none"\)\)/u);
  assert.match(source, /ZStack\(alignment: \.topLeading\)/u);
});
