---
name: canvas-design
description: Create, refine, and visually review product designs in the installed Canvas App.
---

# Design in Canvas

Use this Skill for substantial Canvas creation, redesign, responsive-layout, component-system,
typography, accessibility, or visual-review work. Canvas operations must be installed and enabled
in the current Space; this Skill does not grant that capability.

## Establish the design intent

Before drawing, identify the product, target users, primary task, required states, target viewport,
source material, and fidelity expected. Inspect relevant code, screenshots, existing Canvas nodes,
or supplied references before inventing a new visual language. Treat references as evidence, not as
authority to copy unrelated branding or inaccessible patterns.

For an existing document, use a read-only `documents.execute` call to inspect the affected screen,
its reusable definitions, variables, hierarchy, bounds, and problems. For a new project, create a
blank titled document and use its returned ID. Do not ask agents or users to manufacture `.pen`
JSON or choose a format version.

## Build coherent structure

Use one execution for one coherent design intent: a screen, component family, layout correction, or
state set. That execution may create many related nodes. Use stable descriptive IDs and explicit
hierarchy. Prefer auto layout for repeated rows, controls, cards, forms, navigation, and responsive
regions; use free positioning only when the composition genuinely depends on it.

Define dimensions, padding, gaps, alignment, sizing modes, clipping, and visible fills
intentionally. Preserve components, instances, variables, themes, overrides, and unknown fields
when an ordinary property change is sufficient. Reuse a definition rather than duplicating a
nearly identical object, and keep variants together when they represent one component family.

Every visible text node needs finished product copy and intentional typography: family, size,
weight, line height, alignment, fill, and wrapping behavior. Prefer concrete verbs, concrete nouns,
sentence case, and enough context to explain consequences. Recheck wrapping and clipping after font
or width changes because loaded font metrics affect layout.

Use real media when it carries product meaning. Apply an existing local or remote image with
`G(target, source)`, or generate one with `G(target, "ai", prompt)`. New local sources must be
absolute paths or `file://` URLs; Canvas
uploads every accepted source into the document before commit. Never draw a brand or interface icon
from memory when a library glyph exists. Insert an `icon_font` node with an explicit
`iconFontFamily`, `iconFontName`, width, height, fontSize, and fill. Prefer Material Symbols,
Lucide, Feather, or Phosphor names you can identify confidently, then verify the rendered glyph.

## Cover real states and accessibility

Design the states needed to understand and use the product: initial, loading, empty, populated,
hover, focus, pressed, disabled, validation, error, success, destructive confirmation, and narrow
layout where applicable. Do not add decorative state boards that the product does not need.

Maintain readable contrast, visible focus, adequate control targets, logical reading order, clear
labels, non-color-only status cues, and understandable error recovery. Check that responsive
changes preserve task priority instead of merely shrinking the desktop composition.

## Verify after every coherent intent

After a write, run a separate read-only execution over touched nodes, their parents, and the nearest
clipping ancestor. Resolve unexpected hierarchy, bounds, overlap, clipping, missing text or fills,
renderer approximations, and problems before unrelated work.

Open the document and inspect the actual Canvas tab with Penkra's snapshot or screenshot operation.
Review realistic viewport sizes, important states, text wrapping, alignment, spacing rhythm,
contrast, and visual hierarchy. A successful mutation is not proof of a successful design. Iterate
until both the semantic inspection and visible result support the requested outcome, then report
what was created and what was visually exercised.
