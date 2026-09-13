import { writeFile } from "node:fs/promises";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

const document = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "reference", type: "frame", layout: "none", width: 340, height: 440, fill: "#FFFFFF", children: ["center", "inside", "outside"].map((align, index) => ({
    id: align, type: "path", x: 20, y: 20 + index * 140, width: 300, height: 120,
    geometry: "M20 20 H260 V100 H20 Z", viewBox: [0, 0, 300, 120], fill: "#0B4A6F",
    stroke: { fill: "#F4A261", width: 8, align },
  })),
}] };
const [result] = await takeDocumentScreenshots(document, [{ nodeIds: ["reference"] }], new Map(), { scale: 1 });
const bytes = Buffer.from(result.data, "base64");
await writeFile(new URL("../research/mobile-qa/canvas-vector-stroke-alignment.png", import.meta.url), bytes);
const ck = await getCanvasKit(); const image = ck.MakeImageFromEncoded(bytes);
const pixels = image.readPixels(0, 0, { width: 340, height: 440, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
image.delete();
console.log(JSON.stringify(["center", "inside", "outside"].map((align, row) => {
  const y = 80 + row * 140;
  const runs = [];
  for (let x = 20; x < 65; x++) {
    const color = Array.from(pixels.slice((y * 340 + x) * 4, (y * 340 + x) * 4 + 4));
    const previous = runs.at(-1);
    if (previous && previous.color.every((value, index) => value === color[index])) previous.to = x;
    else runs.push({ from: x, to: x, color });
  }
  return { align, y, runs };
}), null, 2));
