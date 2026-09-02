import assert from "node:assert/strict";
import test from "node:test";

import {
  isPencilAuthorableNode,
  parsePencilAuthoringValue,
  pencilAuthoringSections,
} from "./pencil-authoring.mjs";

test("semantic Pencil authoring exposes exact fields instead of converting node types", () => {
  const icon = { id: "icon", type: "icon", library: "lucide", icon: "camera", weight: 500 };
  const script = { id: "script", type: "script", scriptUri: "scripts/card.js", inputs: { count: 2 } };
  assert.equal(isPencilAuthorableNode(script), true);
  assert.deepEqual(
    pencilAuthoringSections(icon)[0].fields.map(({ property }) => property),
    ["library", "icon", "weight"],
  );
  assert.equal(pencilAuthoringSections(script)[0].fields[0].value, "scripts/card.js");
});

test("shader and mesh controls address their semantic fill object", () => {
  const shader = pencilAuthoringSections({
    type: "rectangle",
    fill: { type: "shader", url: "fx.glsl", uniforms: { speed: 2 } },
  })[0];
  assert.deepEqual(shader.fields[0].path, ["url"]);
  assert.deepEqual(parsePencilAuthoringValue("json", '{"speed":3}'), { speed: 3 });
  assert.throws(() => parsePencilAuthoringValue("json", "{"));
});
