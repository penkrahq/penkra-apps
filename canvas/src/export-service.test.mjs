import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { exportImage } from "./export-service.mjs";

const document = {
  canvasSchemaVersion: 3,
  version: "2.17",
  module: "web",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "art", type: "frame", role: "route", name: "Artwork", width: 320, height: 180,
    fill: "#ffffff", children: [{ id: "box", type: "rectangle", x: 20, y: 20, width: 80, height: 60, fill: "#123456" }],
  }],
};

test("documents.export-image writes one scaled PNG and one SVG subtree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-image-export-"));
  try {
    const pngPath = join(directory, "art.png");
    const png = await exportImage(document, { frames: ["art"], format: "png", scale: 2, destination: pngPath }, { assets: new Map() });
    assert.deepEqual({ width: png.width, height: png.height, format: png.format }, { width: 640, height: 360, format: "png" });
    assert.deepEqual([...await readFile(pngPath)].slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);

    const svgPath = join(directory, "art.svg");
    const svg = await exportImage(document, { frames: ["art"], format: "svg", destination: svgPath }, { assets: new Map() });
    assert.equal(svg.format, "svg");
    assert.match(await readFile(svgPath, "utf8"), /<svg[\s\S]*<rect id="box"/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("documents.export-image rejects multiple subtrees for one destination", async () => {
  await assert.rejects(() => exportImage(document, { frames: ["art", "box"], format: "png", destination: "/tmp/ambiguous.png" }), { code: "CANVAS_EXPORT_IMAGE_DESTINATION_AMBIGUOUS" });
});
