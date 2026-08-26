import assert from "node:assert/strict";
import test from "node:test";

import {
  executePencilScript,
  parsePencilScriptHeader,
  preparePencilScriptRuntime,
} from "./pencil-script-runtime.mjs";

const SCRIPT = `/**
 * @schema 2.17
 * @input columns: number(min=1, max=5) = 3
 * @input color: color = #3B82F6
 * @input layout: enum("grid", "stack") = "grid"
 */
return Array.from({ length: pencil.input.columns }, (_, index) => ({
  type: "rectangle",
  x: index * (pencil.width / pencil.input.columns),
  width: pencil.width / pencil.input.columns,
  height: pencil.height,
  fill: pencil.input.color,
  name: pencil.input.layout + Math.random(),
}));`;

test("parses Pencil 2.17 script input declarations", () => {
  const header = parsePencilScriptHeader(SCRIPT);
  assert.equal(header.schema, "2.17");
  assert.deepEqual(header.inputs[0], { name: "columns", type: "number", min: 1, max: 5, default: 3 });
  assert.deepEqual(header.inputs[2].options, ["grid", "stack"]);
});

test("accepts the 2.11 script schema shipped with Pencil's official runtime assets", () => {
  assert.equal(parsePencilScriptHeader("/** @schema 2.11 */\nreturn [];").schema, "2.11");
});

test("executes Pencil scripts synchronously with validated inputs and deterministic random", async () => {
  await preparePencilScriptRuntime();
  const options = { width: 200, height: 100, inputs: { columns: 8, color: "#112233", layout: "stack" } };
  const first = executePencilScript(SCRIPT, options);
  const second = executePencilScript(SCRIPT, options);
  assert.equal(first.nodes.length, 5);
  assert.equal(first.nodes[0].width, 40);
  assert.equal(first.nodes[0].fill, "#112233");
  assert.deepEqual(first.nodes, second.nodes);
});

test("rejects missing schema, invalid inputs, non-arrays, and output over 1000 nodes", async () => {
  await preparePencilScriptRuntime();
  assert.throws(() => parsePencilScriptHeader("return [];"), /leading/);
  assert.throws(() => executePencilScript(SCRIPT, { width: 10, height: 10, inputs: { color: "blue" } }), /hex color/);
  assert.throws(() => executePencilScript("/** @schema 2.17 */\nreturn {};", { width: 10, height: 10 }), /must return an array/);
  assert.throws(() => executePencilScript("/** @schema 2.17 */\nreturn Array.from({length: 1001}, () => ({type:'rectangle'}));", { width: 10, height: 10 }), /more than 1000/);
});
