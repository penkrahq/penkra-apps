import assert from "node:assert/strict";
import test from "node:test";

import { exportDtcgTokens, importDtcgTokens, validateCanvasVariables } from "./token-portability.mjs";

test("DTCG round-trip preserves Canvas cascades and typed dotted aliases", () => {
  const variables = {
    "color.blue.600": { tokenType: "color", cascade: [
      { value: "#369" },
      { value: "#9cf", when: { appearance: "dark" } },
    ] },
    "color.action.primary": { tokenType: "color", cascade: [{ value: "${color.blue.600}" }] },
    "space.600": { tokenType: "dimension", cascade: [{ value: 24 }] },
  };
  const dtcg = exportDtcgTokens(variables);
  assert.equal(dtcg.color.action.primary.$value, "{color.blue.600}");
  assert.deepEqual(dtcg.space["600"].$value, { value: 24, unit: "px" });
  assert.deepEqual(importDtcgTokens(dtcg), variables);
});

test("plain DTCG imports inherit group types and preserve structured values", () => {
  const variables = importDtcgTokens({
    color: { $type: "color", blue: { "600": { $value: { colorSpace: "display-p3", components: [0.1, 0.2, 0.3], alpha: 0.8 } } } },
    alias: { $type: "color", $value: "{color.blue.600}" },
    family: { $type: "fontFamily", $value: ["Inter", "sans-serif"] },
  });
  assert.deepEqual(variables.alias, { tokenType: "color", cascade: [{ value: "${color.blue.600}" }] });
  assert.deepEqual(variables.family.cascade[0].value, ["Inter", "sans-serif"]);
  assert.equal(validateCanvasVariables(variables), true);
});

test("token validation rejects missing, cyclic and cross-typed aliases", () => {
  assert.throws(() => validateCanvasVariables({ a: { tokenType: "number", cascade: [{ value: "${missing}" }] } }), /missing variable/);
  assert.throws(() => validateCanvasVariables({
    a: { tokenType: "number", cascade: [{ value: "${b}" }] },
    b: { tokenType: "number", cascade: [{ value: "${a}" }] },
  }), /Variable cycle/);
  assert.throws(() => validateCanvasVariables({
    number: { tokenType: "number", cascade: [{ value: 4 }] },
    label: { tokenType: "string", cascade: [{ value: "${number}" }] },
  }), /aliases number \(number\)/);
});

test("token paths reject empty segments and token/group collisions", () => {
  assert.throws(() => validateCanvasVariables({ "blue..600": { tokenType: "number", cascade: [{ value: 1 }] } }), /dot-separated/);
  assert.throws(() => exportDtcgTokens({
    color: { tokenType: "color", cascade: [{ value: "#fff" }] },
    "color.blue": { tokenType: "color", cascade: [{ value: "#000" }] },
  }), /collides/);
});

test("token groups treat inherited property names as data without modifying prototypes", () => {
  const key = "canvasTokenPollutionProbe";
  assert.equal(Object.hasOwn(Object.prototype, key), false);
  const dtcg = exportDtcgTokens({ [`constructor.prototype.${key}`]: { tokenType: "number", cascade: [{ value: 1 }] } });
  assert.equal(Object.hasOwn(Object.prototype, key), false);
  assert.equal(dtcg.constructor.prototype[key].$value, 1);
  assert.equal(Object.hasOwn(dtcg, "constructor"), true);
});

test("invalid five- and seven-digit hex colors fail validation", () => {
  for (const value of ["#12345", "#1234567"]) {
    assert.throws(() => validateCanvasVariables({ color: { tokenType: "color", cascade: [{ value }] } }), { code: "CANVAS_TOKEN_INVALID" });
  }
});

test("Canvas strings remain valid internally but are not emitted as an invented DTCG type", () => {
  const variables = { title: { tokenType: "string", cascade: [{ value: "Title" }] } };
  assert.equal(validateCanvasVariables(variables), true);
  assert.throws(() => exportDtcgTokens(variables), { code: "CANVAS_TOKEN_INVALID" });
  assert.throws(() => importDtcgTokens({ title: { $type: "string", $value: "Title" } }), { code: "CANVAS_TOKEN_INVALID" });
});
