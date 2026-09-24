import assert from "node:assert/strict";
import test from "node:test";

import { assertVariantSets, availableVariantValues, componentDefinitions, validateVariantSets, variantSelection } from "./component-variants.mjs";
import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { validateCanvasDocument } from "./canvas-schema.mjs";

function fixture() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "field", type: "frame", width: 200, height: 48,
        properties: {
          state: { type: "enum", values: ["default", "focus", "invalid"], default: "default" },
          size: { type: "enum", values: ["regular", "small"], default: "regular" },
          label: { type: "string", default: "Name" },
        },
        variantSet: { properties: ["state", "size"], variants: [
          { when: { state: "default", size: "regular" }, ref: "field" },
          { when: { state: "focus", size: "regular" }, ref: "field-focus" },
          { when: { state: "invalid", size: "regular" }, ref: "field-invalid" },
          { when: { state: "default", size: "small" }, ref: "field-small" },
        ] },
        children: [{ id: "default-label", type: "text", content: "", bind: { content: "$props.label" }, fill: "#111111" }],
      },
      { id: "field-focus", type: "frame", width: 200, height: 48, children: [
        { id: "focus-label", type: "text", content: "", bind: { content: "$props.label" }, fill: "#1122ff" },
        { id: "focus-icon", type: "rectangle", width: 8, height: 8, fill: "#1122ff" },
      ] },
      { id: "field-invalid", type: "frame", width: 200, height: 48, children: [] },
      { id: "field-small", type: "frame", width: 120, height: 32, children: [] },
      { id: "instance", type: "ref", ref: "field", props: { state: "focus", size: "regular", label: "Email" } },
    ],
  };
}

test("variant sets select only exact authored combinations and picker options depend on other choices", () => {
  const document = fixture();
  const leader = document.children[0];
  assert.deepEqual(validateVariantSets(document), []);
  assert.equal(validateCanvasDocument(document).valid, true);
  assert.deepEqual(componentDefinitions(document).map((node) => node.id), ["field"]);
  assert.equal(variantSelection(leader, { state: "focus", size: "regular" }).sourceId, "field-focus");
  assert.deepEqual(availableVariantValues(leader, { state: "focus", size: "regular" }, "size"), ["regular"]);
  assert.deepEqual(availableVariantValues(leader, { state: "default", size: "regular" }, "size"), ["regular", "small"]);
  assert.deepEqual(availableVariantValues(leader, { state: "default", size: "small" }, "state"), ["default"]);
  assert.throws(() => variantSelection(leader, { state: "focus", size: "small" }), (error) => error.code === "CANVAS_VARIANT_COMBINATION_MISSING");
  const resolved = resolveCanvasDocument(document).document.children.at(-1);
  assert.equal(resolved.children[0].content, "Email");
  assert.equal(resolved.children[1].id, "instance/focus-icon");
  document.children.at(-1).props.size = "small";
  assert.throws(() => resolveCanvasDocument(document), (error) => error.code === "CANVAS_VARIANT_COMBINATION_MISSING");
  assert.throws(() => assertVariantSets(document), /no authored variant for state="focus", size="small"/u);
});

test("variant set validation rejects duplicate, missing, and unrelated variant layouts", () => {
  const document = fixture();
  document.children[0].variantSet.variants.push({ when: { state: "focus", size: "regular" }, ref: "field-invalid" });
  assert.match(validateVariantSets(document).join(" "), /repeats combination/u);
  document.children[0].variantSet.variants.pop();
  document.children[0].variantSet.variants[0].ref = "field-small";
  assert.match(validateVariantSets(document).join(" "), /default combination/u);
  document.children[0].variantSet.variants[0].ref = "field";
  document.children[1].properties = { extra: { type: "boolean", default: false } };
  assert.match(validateVariantSets(document).join(" "), /set's property interface/u);
  delete document.children[1].properties;
  document.children.at(-1).ref = "field-focus";
  assert.match(validateVariantSets(document).join(" "), /must reference variant-set leader/u);
});
