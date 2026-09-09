import test from "node:test";
import assert from "node:assert/strict";
import { exportSvg } from "./exporters/svg.mjs";

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
