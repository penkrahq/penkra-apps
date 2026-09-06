import assert from "node:assert/strict";
import test from "node:test";
import { resolveVariableReferences, variableReferences } from "./variable-references.mjs";

test("whole aliases preserve structured values while interpolation remains text", () => {
  const color = { colorSpace: "srgb", components: [0, 0.5, 1] };
  const values = { "color.blue.600": color, count: 3 };
  const resolve = (name) => values[name];
  const result = resolveVariableReferences({ color: "${color.blue.600}", label: "Count ${count}", count: "${count}" }, resolve);
  assert.deepEqual(result, { color, label: "Count 3", count: 3 });
  assert.notEqual(result.color, color);
  assert.deepEqual(variableReferences("${blue-600} ${blue.600} ${blue..600} {blue.600}").map((match) => match[1]), ["blue-600", "blue.600"]);
});
