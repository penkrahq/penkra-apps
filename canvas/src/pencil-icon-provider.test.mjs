import assert from "node:assert/strict";
import test from "node:test";

import { pencilIconDefinition } from "./pencil-icon-provider.mjs";

test("every Pencil 2.17 icon library resolves through a catalog provider", () => {
  const cases = [
    ["lucide", "arrow-left", "stroke", 24],
    ["feather", "arrow-left", "stroke", 24],
    ["Material Symbols Outlined", "arrow-back", "font", null],
    ["Material Symbols Rounded", "arrow-back", "font", null],
    ["Material Symbols Sharp", "arrow-back", "font", null],
    ["phosphor", "push-pin-fill", "fill", 256],
  ];

  for (const [library, name, paint, size] of cases) {
    const definition = pencilIconDefinition(library, name);
    assert.ok(definition, `${library}:${name} should resolve`);
    assert.equal(definition.paint, paint);
    if (size) {
      assert.deepEqual(definition.viewBox, [0, 0, size, size]);
      assert.match(definition.geometry, /M0 0/u);
    } else {
      assert.equal(definition.content, "arrow_back");
    }
  }
});

test("provider lookup is exact and never substitutes an unknown icon", () => {
  assert.equal(pencilIconDefinition("lucide", "not-a-real-icon"), null);
  assert.equal(pencilIconDefinition("not-a-library", "arrow-left"), null);
  assert.deepEqual(
    pencilIconDefinition("phosphor", "push-pin-duotone").layers.map(({ opacity }) => opacity),
    [0.2, 1],
  );
});

test("provider lookup never substitutes a different supported icon weight", () => {
  assert.equal(pencilIconDefinition("Material Symbols Rounded", "home", 700).weight, 700);
  assert.ok(pencilIconDefinition("phosphor", "push-pin", 100));
  assert.ok(pencilIconDefinition("phosphor", "push-pin", 300));
  assert.ok(pencilIconDefinition("phosphor", "push-pin", 700));
  assert.equal(pencilIconDefinition("phosphor", "push-pin", 500), null);
  assert.ok(pencilIconDefinition("Material Symbols Rounded", "home", 400));
  assert.ok(pencilIconDefinition("phosphor", "push-pin", 400));
});

test("Material Symbols canonical ligature names resolve through Iconify catalog keys", () => {
  const outlined = pencilIconDefinition("Material Symbols Outlined", "auto_awesome", 400);
  const rounded = pencilIconDefinition("Material Symbols Rounded", "chat_bubble", 400);

  assert.equal(outlined.content, "auto_awesome");
  assert.equal(outlined.fontFamily, "Material Symbols Outlined");
  assert.equal(rounded.content, "chat_bubble");
  assert.equal(rounded.fontFamily, "Material Symbols Rounded");
});
