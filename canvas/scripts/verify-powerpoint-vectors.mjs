import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportPptx } from "../src/exporters/pptx.mjs";
import { readOoxmlPackage, readXmlPart } from "../src/ooxml-package.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { vectorCases } from "../compatibility/vector-fixture.mjs";

const geometries = [
  "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z",
  "M50 0 C116 0 116 100 50 100 C-16 100 -16 0 50 0 Z M50 25 C83 25 83 75 50 75 C17 75 17 25 50 25 Z",
  "M0 0 L100 100 L0 100 L100 0 Z",
  "M50 0 L100 35 L80 100 L20 100 L0 35 Z",
  "M0 0 H70 V70 H0 Z M30 30 H100 V100 H30 Z",
];
const document = { version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "vectors", name: "Native vectors", type: "frame", role: "slide", layout: "none", width: 680, height: 400,
  physical: { w: 6.8, h: 4, unit: "in" }, fill: "#FFFFFF",
  children: geometries.map((geometry, index) => ({
    id: `vector-${index}`, type: index === 3 ? "polygon" : "path", x: 30 + index % 3 * 220, y: 30 + Math.floor(index / 3) * 190,
    width: 180, height: 150, geometry, viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#0B4A6F",
  })),
}] };
if (process.argv.includes("--matrix")) {
  Object.assign(document.children[0], {
    width: 900, height: 660, physical: { w: 9, h: 6.6, unit: "in" },
    children: ["evenodd", "nonzero"].flatMap((fillRule, ruleIndex) => vectorCases.map(([name, geometry, viewBox], index) => ({
      id: `${name}-${fillRule}`, type: name === "polygon" ? "polygon" : "path",
      x: 20 + index % 5 * 176, y: 20 + (Math.floor(index / 5) + ruleIndex * 2) * 156,
      width: 130, height: 110, geometry, viewBox: viewBox ?? [0, 0, 100, 100], fillRule, fill: "#0B4A6F",
    }))),
  });
}
const directory = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}/`)
  : new URL("../research/powerpoint-qa/", import.meta.url);
await mkdir(directory, { recursive: true });
const ir = buildCapabilityVerificationIR(document, { role: "slide", frames: ["vectors"] },
  ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"]);
assert.equal(ir.rasters.length, 0);
const bytes = await exportPptx(ir);
const xml = readXmlPart(readOoxmlPackage(bytes), "ppt/slides/slide1.xml");
const count = document.children[0].children.length;
assert.equal((xml.match(/<a:custGeom>/gu) ?? []).length, count);
assert.doesNotMatch(xml, /<p:pic\b/u);
await writeFile(new URL("native-vectors.pptx", directory), bytes, { flag: "wx" });
const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: ["vectors"] }], new Map(), { scale: 1 });
await writeFile(new URL("canvas-native-vectors.png", directory), Buffer.from(reference.data, "base64"), { flag: "wx" });
console.log(JSON.stringify({ nativeShapes: count, rasters: 0, directory: directory.pathname }));
