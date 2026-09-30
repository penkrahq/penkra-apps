import assert from "node:assert/strict";
import test from "node:test";

import {
  ensurePencilIconDefinitions,
  pencilIconDefinition,
  searchCanvasIcons,
} from "./pencil-icon-provider.mjs";

test("loads only document-needed icon chunks, once, before synchronous rendering", async () => {
  const lazy = await import("./pencil-icon-provider.mjs?lazy-test");
  const document = { children: [
    { id: "component", type: "frame", children: [
      { id: "glyph", type: "icon", library: "Material Symbols Rounded", icon: "home" },
    ] },
    { id: "instance", type: "ref", descendants: {
      "component/glyph": { library: "phosphor", icon: "push-pin" },
    } },
  ] };
  assert.deepEqual(lazy.missingPencilIconCatalogs({ children: [] }), []);
  assert.deepEqual(lazy.missingPencilIconCatalogs(document), ["material/hom", "phosphor/pus"]);
  assert.throws(() => lazy.pencilIconDefinition("phosphor", "push-pin"), /not loaded/u);
  await Promise.all([lazy.ensurePencilDocumentIconCatalogs(document), lazy.ensurePencilDocumentIconCatalogs(document)]);
  assert.deepEqual(lazy.missingPencilIconCatalogs(document), []);
  assert.ok(lazy.pencilIconDefinition("phosphor", "push-pin"));
});

test.before(async () => {
  await ensurePencilIconDefinitions([
    { library: "feather", icon: "arrow-left" },
    ...["Material Symbols Outlined", "Material Symbols Rounded", "Material Symbols Sharp"]
      .map((library) => ({ library, icon: "arrow-back" })),
    { library: "Material Symbols Rounded", icon: "home" },
    { library: "Material Symbols Outlined", icon: "auto_awesome" },
    { library: "Material Symbols Rounded", icon: "chat_bubble" },
    ...["push-pin-fill", "push-pin-duotone", "push-pin"].map((icon) => ({ library: "phosphor", icon })),
    ...[100, 300, 700].map((weight) => ({ library: "phosphor", icon: "push-pin", weight })),
    ...["Material Symbols Outlined", "Material Symbols Rounded", "Material Symbols Sharp"]
      .map((library) => ({ library, icon: "progress_activity" })),
  ]);
});

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

test("icon search returns exact identifiers accepted by every matching provider", async () => {
  const result = await searchCanvasIcons("progress activity", { limit: 10 });
  assert.equal(result.total, 3);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items.map(({ library }) => library), [
    "Material Symbols Outlined",
    "Material Symbols Rounded",
    "Material Symbols Sharp",
  ]);
  for (const item of result.items) {
    assert.ok(pencilIconDefinition(item.library, item.icon));
  }
});
