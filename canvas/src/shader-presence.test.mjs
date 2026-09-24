import assert from "node:assert/strict";
import test from "node:test";
import { createShaderPresence } from "./shader-presence.mjs";

const shader = (automatic) => ({ pencilShader: { uniforms: [{ automatic }] } });
const graph = (...nodes) => ({ nodes: new Map(nodes.map((node) => [node.id, node])) });

test("shader presence tracks creation, paint changes, deletion, and graph replacement", () => {
  const presence = createShaderPresence(graph({ id: "plain", fills: [] }, { id: "mouse", fills: [shader("mouse")] }));
  assert.equal(presence.hasTime(), false);
  assert.equal(presence.hasMouse(), true);
  assert.equal(presence.update({ id: "time", fills: [shader("time")] }), true);
  assert.equal(presence.hasTime(), true);
  assert.equal(presence.update({ id: "time", fills: [shader("mouse")] }), true);
  assert.equal(presence.hasTime(), false);
  assert.equal(presence.remove("mouse"), false);
  assert.equal(presence.remove("time"), false);
  assert.equal(presence.hasMouse(), false);
  presence.replaceGraph(graph({ id: "plain", fills: [shader("time")] }));
  assert.equal(presence.hasTime(), true);
  presence.replaceGraph(graph({ id: "plain", fills: [] }));
  assert.equal(presence.hasTime(), false);
});

test("shader presence scans the graph only during initial and replacement indexing", () => {
  let scans = 0;
  const countedGraph = { nodes: { values() { scans += 1; return [{ id: "shape", fills: [] }][Symbol.iterator](); } } };
  const presence = createShaderPresence(countedGraph);
  assert.equal(scans, 1);
  for (let i = 0; i < 1_000; i += 1) {
    presence.update({ id: "shape", fills: [] });
    presence.hasTime();
    presence.hasMouse();
  }
  assert.equal(scans, 1);
  presence.replaceGraph(countedGraph);
  assert.equal(scans, 2);
});
