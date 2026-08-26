# Pencil 2.17 support boundary

Canvas keeps the `.pen` document as the canonical model. Provider geometry,
script output, shader state, mesh tessellation, and semantic helper visuals are
transient render data. They never replace a persisted Pencil node or paint.

## Faithfully represented

- Nodes: `frame`, `group`, `rectangle`, `ellipse`, `line`, `polygon`, `path`, `text`,
  `icon_font`, `icon`, `ref`, `script`, `note`, `context`, and `prompt`.
- Semantic icons: Lucide, Feather, Material Symbols Outlined/Rounded/Sharp, and
  Phosphor. Provider/name/weight lookup is exact. Material Symbols use the
  official variable fonts; Phosphor includes exact weights and duotone layers.
- Fills: color/solid, image, linear/radial/angular gradient, shader, and mesh
  gradient. Shader directives include ordinary typed uniforms, `@resolution`,
  `@time`, `@mouse`, `@sdf`, `@backdrop`, sampler resources, and Pencil's
  `textureSize` extension.
- Strokes: multiple color/solid or gradient paints with Pencil blend modes, per-side or uniform width,
  alignment, join, cap, dash pattern, and `layoutIncludeStroke` border-box
  layout.
- Effects and compositing: shadow, layer blur, background blur, the supported
  Pencil blend-mode set, plus exact Linear Burn and Linear Dodge behavior.
- Layout and text: the Pencil sizing, auto-layout, alignment, typography, style,
  decoration, path fill-rule, polygon, arc, opacity, and clipping fields covered
  by the 2.17 renderer.
- Variables, multi-axis themes, local components, descendant overrides, slots,
  document fonts, and recursive imported design libraries and resources.
- Script nodes execute in the bounded QuickJS runtime. Their generated children
  are deterministic, namespaced, locked, and transient.
- Note/context/prompt helper chrome and slot outlines are derived visuals; their
  semantic source remains unchanged.

## Explicitly reported

- Unknown future node, paint, effect, or layout types.
- An icon provider/name/weight absent from the exact bundled catalog.
- A referenced image, shader, script, sampler, or design-library resource that
  is unavailable or invalid.
- A script that fails schema/input/output validation or runtime limits.
- A shader or mesh definition that fails its declared format validation.
- A component ref whose local or imported component is unavailable.
- Unknown future stroke paint types.

These cases stay lossless and render empty at the affected visual layer rather
than receiving an invented fallback.

## Authoring surface

The inspector edits semantic `.pen` fields directly. It exposes icon provider,
name, and weight; sticky content/model; script URI and typed inputs; structured
gradient, shader, mesh, effects, theme, component, and slot data; and the core
geometry/layout/appearance/typography fields. Nested shader and gradient edits
use field-level Yjs paths, while arrays remain atomic JSON values so concurrent
object fields can merge without inventing array semantics.

Canvas does not include an icon-detach or semantic-to-vector conversion action.
External script, shader, image, and library files are imported/exported as typed
resources at their exact relative paths; the inspector authors their references
and declared inputs rather than embedding or rewriting resource files.
