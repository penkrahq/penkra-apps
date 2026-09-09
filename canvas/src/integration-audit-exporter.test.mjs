import test from "node:test";
import assert from "node:assert/strict";
import { exportSvg } from "./exporters/svg.mjs";
import { exportWeb } from "./exporters/web.mjs";

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
