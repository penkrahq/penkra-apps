import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exportSvg } from "./exporters/svg.mjs";
import { exportWeb } from "./exporters/web.mjs";
import { exportPptx } from "./exporters/pptx.mjs";

test("audit: SVG rejects active unsafe rich-text links before serialization", () => {
  const ir = {
    lang: "en",
    outputs: [{
      id: "screen", width: 200, height: 80,
      root: { id: "screen", semantics: {} },
      nodes: [{
        id: "copy", type: "text", capability: { verdict: "native" },
        geometry: { x: 0, y: 0, w: 200, h: 80 }, paint: {},
        semantics: {
          content: "Open", textAlign: "start", runs: [{ from: 0, to: 4, link: "javascript:alert(1)" }],
          paragraphs: [{ from: 0, to: 4 }],
        },
      }],
    }],
  };
  assert.throws(() => exportSvg(ir, ir.outputs[0]), { code: "CANVAS_WEB_UNSAFE_LINK" });
});

test("audit: HTML icons without an explicit fill retain the Canvas black default", () => {
  const ir = {
    axes: {}, outputs: [{
      id: "screen", name: "Screen", width: 24, height: 24,
      root: { id: "screen", type: "frame", geometry: { x: 0, y: 0, w: 24, h: 24 }, paint: {}, semantics: {}, layout: {}, variants: {} },
      nodes: [{
        id: "mark", type: "icon", parent: "screen", z: 0,
        capability: { verdict: "native" }, geometry: { x: 0, y: 0, w: 24, h: 24 },
        paint: { fill: null, opacity: 1 }, semantics: {}, layout: {},
        icon: { library: "lucide", name: "circle", weight: 400 },
      }],
    }],
  };
  const html = exportWeb(ir).get("screen.html");
  assert.match(html, /stroke="#000000"/u);
  assert.doesNotMatch(html, /stroke="none"/u);
});

test("audit: PPTX rejects active unsafe rich-text links before packaging", async () => {
  const ir = {
    outputs: [{
      id: "slide", name: "Slide", width: 100, height: 100,
      physical: { w: 10, h: 10, unit: "in" }, root: { id: "slide", paint: {}, semantics: {}, layout: {} },
      nodes: [{
        id: "copy", type: "text", parent: "slide", z: 0, capability: { verdict: "native" },
        geometry: { x: 0, y: 0, w: 100, h: 20 }, paint: { opacity: 1 }, layout: {},
        semantics: { content: "Open", runs: [{ from: 0, to: 4, link: "javascript:alert(1)", fontSize: 16 }], paragraphs: [{ from: 0, to: 4 }] },
      }],
    }], notes: [],
  };
  const regular = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
  await assert.rejects(exportPptx(ir, { fonts: [{ typeface: "Inter", faces: { regular } }] }), { code: "CANVAS_WEB_UNSAFE_LINK" });
});
