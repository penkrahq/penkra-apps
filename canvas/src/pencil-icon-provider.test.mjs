import assert from "node:assert/strict";
import test from "node:test";

import phosphor from "@iconify-json/ph/icons.json" with { type: "json" };

import { pencilIconDefinition, pencilIconVectorDefinition, searchCanvasIcons } from "./pencil-icon-provider.mjs";

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
      if (paint === "stroke") assert.match(definition.geometry, /M0 0/u);
      else assert.match(definition.geometry, /Z$/u);
    } else {
      assert.equal(definition.content, "arrow_back");
    }
  }
});

test("all six libraries expose exporter-native vector geometry", () => {
  for (const [library, name] of [
    ["lucide", "arrow-left"], ["feather", "arrow-left"],
    ["Material Symbols Outlined", "arrow-back"], ["Material Symbols Rounded", "arrow-back"],
    ["Material Symbols Sharp", "arrow-back"], ["phosphor", "push-pin-fill"],
  ]) {
    const definition = pencilIconVectorDefinition(library, name, 400);
    assert.ok(definition?.geometry, `${library}:${name}`);
    assert.equal(definition.paint === "font", false, `${library}:${name}`);
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

test("explicit Phosphor catalog variants are authoritative over the weight field", () => {
  for (const variant of ["thin", "light", "bold", "fill", "duotone"]) {
    const definition = pencilIconDefinition("phosphor", `push-pin-${variant}`, 600);
    assert.ok(definition, `push-pin-${variant} should resolve independently of weight`);
    assert.equal(definition.paint, "fill");
  }
  assert.equal(pencilIconDefinition("phosphor", "push-pin", 600), null);
});

test("every bundled Phosphor icon and alias resolves from the complete catalog", () => {
  const names = [...Object.keys(phosphor.icons ?? {}), ...Object.keys(phosphor.aliases ?? {})];
  for (const name of names) {
    const hasExplicitVariant = /-(?:thin|light|bold|fill|duotone)$/u.test(name);
    assert.ok(
      pencilIconDefinition("phosphor", name, hasExplicitVariant ? 600 : 400),
      `${name} should resolve`,
    );
  }
});

test("Material Symbols canonical ligature names resolve through Iconify catalog keys", () => {
  const outlined = pencilIconDefinition("Material Symbols Outlined", "auto_awesome", 400);
  const rounded = pencilIconDefinition("Material Symbols Rounded", "chat_bubble", 400);

  assert.equal(outlined.content, "auto_awesome");
  assert.equal(outlined.fontFamily, "Material Symbols Outlined");
  assert.equal(rounded.content, "chat_bubble");
  assert.equal(rounded.fontFamily, "Material Symbols Rounded");
});

test("icon search returns exact identifiers accepted by every matching provider", () => {
  const result = searchCanvasIcons("progress activity", { limit: 10 });
  assert.equal(result.total, 3);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items.map(({ library }) => library), [
    "Material Symbols Outlined",
    "Material Symbols Rounded",
    "Material Symbols Sharp",
  ]);
  for (const item of result.items) assert.ok(pencilIconDefinition(item.library, item.icon));
});

test("every supported icon library exposes self-contained vector geometry for web export", () => {
  for (const [library, name, weight] of [
    ["lucide", "camera", 400], ["feather", "camera", 400],
    ["Material Symbols Outlined", "auto_awesome", 400], ["Material Symbols Rounded", "chat_bubble", 700],
    ["Material Symbols Sharp", "home", 400], ["phosphor", "push-pin", 700],
  ]) {
    const definition = pencilIconVectorDefinition(library, name, weight);
    assert.ok(definition?.geometry, `${library}:${name}:${weight}`);
    assert.equal(definition.paint === "fill" || definition.paint === "stroke", true);
    assert.equal(definition.viewBox.length, 4);
  }
});
