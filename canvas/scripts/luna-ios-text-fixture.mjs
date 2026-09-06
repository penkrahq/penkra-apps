import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { exportSwiftUI } from "../src/exporters/mobile.mjs";

const root = resolve(import.meta.dirname, "..");
const content = "Canvas text\nSecond line";
const fullRange = { from: 0, to: content.length };
const firstSix = { from: 0, to: 6 };

export const CASES = Object.freeze([
  ["case-01", "Unmarked regular", []],
  ["case-02", "Full underline", [{ type: "underline", ...fullRange, value: true }]],
  ["case-03", "Full strikethrough", [{ type: "strikethrough", ...fullRange, value: true }]],
  ["case-04", "Underline and strikethrough", [
    { type: "underline", ...fullRange, value: true },
    { type: "strikethrough", ...fullRange, value: true },
  ]],
  ["case-05", "Full italic", [{ type: "italic", ...fullRange, value: true }]],
  ["case-06", "Full bold 700", [{ type: "weight", ...fullRange, value: 700 }]],
  ["case-07", "First six underline", [{ type: "underline", ...firstSix, value: true }]],
  ["case-08", "First six strikethrough", [{ type: "strikethrough", ...firstSix, value: true }]],
  ["case-09", "First six italic", [{ type: "italic", ...firstSix, value: true }]],
  ["case-10", "First six orange fill", [{ type: "fill", ...firstSix, value: "#cc5500" }]],
  ["case-11", "Full letter spacing", [{ type: "letterSpacing", ...fullRange, value: 1 }]],
  ["case-12", "First six letter spacing", [{ type: "letterSpacing", ...firstSix, value: 1 }]],
].map(([id, label, marks]) => Object.freeze({ id, label, marks: Object.freeze(marks.map((mark) => Object.freeze(mark))) })));

export const CANDIDATE_PATHS = Object.freeze([
  "root.module", "root.lang", "root.axes", "root.variables", "root.paragraphStyles", "root.imports", "root.children", "roles.ios",
  "nodes.frame", "nodes.text", "properties.layout", "properties.fill", "properties.fill.solid", "properties.content", "properties.fontFamily",
  "properties.fontSize", "properties.fontStyle", "properties.fontWeight", "properties.letterSpacing", "properties.marks",
  "properties.paragraphs", "properties.strikethrough", "properties.underline", "properties.text.run.fill",
  "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.italic", "properties.text.run.letterSpacing",
  "properties.text.run.strikethrough", "properties.text.run.underline", "properties.text.run.weight",
]);

export function buildTextDecorationDocument() {
  return {
    version: "2.17", module: "mobile", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: CASES.map(({ id, label, marks }) => ({
      id, type: "frame", role: "ios", name: `Luna iOS ${label}`, width: 340, height: 180, layout: "none", fill: "#FFFFFF",
      children: [{ id: `${id}-text`, type: "text", x: 20, y: 20, width: 300, height: 140, content,
        fontFamily: "Inter", fontSize: 24, fill: "#123456", marks, paragraphs: [{ from: 0, to: content.length }] }],
    })),
  };
}

export function buildTextDecorationIR(document = buildTextDecorationDocument()) {
  return buildCapabilityVerificationIR(document, { role: "ios", frames: CASES.map(({ id }) => id) }, CANDIDATE_PATHS);
}

export async function generateSwiftEvidence(destination) {
  const document = buildTextDecorationDocument();
  const ir = buildTextDecorationIR(document);
  const files = exportSwiftUI(ir);
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, "fixture.json"), `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(resolve(destination, "ir.json"), `${JSON.stringify({ ...ir, renderDocument: undefined }, null, 2)}\n`);
  const sources = {};
  for (const [name, value] of files) {
    if (!name.endsWith(".swift")) continue;
    const relative = name.replace(/^_canvas\//u, "");
    const path = resolve(destination, "swift", relative);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, value);
    sources[relative] = value;
  }
  return { document, ir, files, sources };
}

export async function readInterFonts() {
  const names = ["Inter-Regular.ttf", "Inter-Bold.ttf"];
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(resolve(root, "vendor/open-pencil/fonts", name))])));
}

export { content };
