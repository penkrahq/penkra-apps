import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Verify the --opacity native fixture's large, uniform shapes. Text interiors,
// antialiasing, system UI and accessibility remain separate measurements.
const verifyText = process.argv.includes("--text");
const paths = process.argv.slice(2).filter((value) => value !== "--text");
if (!paths.length) throw new Error("Usage: bun scripts/verify-mobile-shape-opacity.mjs screenshot.png [...]");
function measure(path, color) {
  return JSON.parse(execFileSync(process.execPath, [new URL("./measure-mobile-color-regions.mjs", import.meta.url).pathname, path, color], { encoding: "utf8" }));
}
for (const path of paths) {
  const blue = measure(path, "809EAC");
  const shapes = blue.regions.filter((region) => region.width > blue.width * 0.4).sort((a, b) => a.y - b.y);
  assert.equal(shapes.length, 3, `${path}: expected three half-opacity blue shapes`);
  const coverage = shapes.map((region) => region.interiorPixels / (region.width * region.height));
  assert.ok(coverage[0] > 0.99, `${path}: rectangle interior is incomplete`);
  assert.ok(coverage[1] > 0.77 && coverage[1] < 0.80, `${path}: expected ellipse coverage, not a capsule`);
  assert.ok(coverage[2] > 0.58 && coverage[2] < 0.62, `${path}: nested child must cover 40% of the frame`);
  for (const region of shapes) assert.ok(Math.abs(region.width / region.height - 3) < 0.03, `${path}: incorrect 300x100 aspect ratio`);
  const orange = measure(path, "F5CAA5");
  const children = orange.regions.filter((region) => region.width > orange.width * 0.3);
  assert.equal(children.length, 1, `${path}: expected one group-composited orange child`);
  assert.ok(Math.abs(children[0].width / shapes[2].width - 2 / 3) < 0.01);
  assert.ok(Math.abs(children[0].height / shapes[2].height - 0.6) < 0.01);
  if (verifyText) {
    const belowShapes = (region) => region.y > shapes[2].y + shapes[2].height;
    const halfGlyphs = blue.regions.filter(belowShapes).sort((a, b) => a.x - b.x);
    const opaqueGlyphs = measure(path, "0B4A6F").regions.filter(belowShapes).sort((a, b) => a.x - b.x);
    assert.equal(halfGlyphs.length, 3, `${path}: missing half-opacity ABC glyph interiors`);
    assert.equal(opaqueGlyphs.length, 3, `${path}: missing opaque ABC glyph interiors`);
    for (let index = 0; index < 3; index++) {
      assert.ok(Math.abs(halfGlyphs[index].width - opaqueGlyphs[index].width) <= 2);
      assert.ok(Math.abs(halfGlyphs[index].height - opaqueGlyphs[index].height) <= 2);
    }
  }
  console.log(JSON.stringify({ path, tolerance: blue.tolerance, shapes, coverage, child: children[0], verified: true }));
}
