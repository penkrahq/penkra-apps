# Canvas architecture

This document describes Canvas as implemented. It is not a plan. Unfinished and deferred Canvas
work belongs only in the ignored local `TODO.md`; measurements and historical design rationale live
under `research/`.

## Product boundary

Canvas is a Penkra App for agent-authored visual documents. People primarily review and make focused
corrections. Canvas does not import, export, or preserve Pencil files. The owned OpenPencil fork is
an engine source, not a file-format contract.

Canvas owns its document model, editor, renderer, imports, exports, and App operations. It uses only
public Penkra App runtime services. The host owns App installation, operation isolation, account data,
tab containment, permissions, and trusted filesystem mediation.

Agents may move documents to recoverable Trash but cannot permanently delete them. Essential
authoring behavior is documented in App instructions and operation help; Skills add module-specific
workflow guidance but are not the sole source of required behavior.

## Documents

A document has one module:

- `generic` for freeform designs and direct PNG, SVG, or PDF extraction;
- `deck` for slide presentations;
- `web` for responsive routes;
- `mobile` for iOS and Android screens.

A generic document may set one deliverable module while it has no role-bearing frames. Deck, web,
and mobile modules do not change afterward. Physical pages are ordinary frames with declared
`physical` dimensions; they are not a module or role.

Top-level role-bearing frames are export units. Roles are valid only on frames and are specific to
their module. Reusable component definitions remain top-level peers rather than children of export
frames.

The canonical schema is machine-readable in `src/canvas-schema.mjs`. It covers document fields,
nodes, physical sizes, marks, paragraphs, imports, flows, axes, variables, and typed component
properties. Recursive structural validation is supplemented by semantic cross-field validation.
Unknown or unsupported constructs fail visibly rather than being silently discarded.

## Layout, modes, and components

The layout model exposes horizontal, vertical, free-positioned, wrapping, min/max-constrained, and
grid layout through the owned OpenPencil/Yoga boundary. Independent row and column gaps, explicit
tracks, and placement are part of the typed model.

Axes are the shared conditional mechanism for document-wide appearance and viewport modes. Static
targets resolve them at export; responsive targets retain the applicable behavior. Component
variants are component properties: siblings may select different values on the same frame.

Components use typed properties, conditions, lexical nested scopes, cross-document imports, and
instance paths. Libraries publish an explicit item surface and immutable release content. Imports
either follow the latest published release or retain an exact release identity and content hash;
their dependency and asset closure remains available without the source document. Descendant
remapping is deterministic and validated.

## Text and collaboration

Text content uses UTF-16 `[from,to)` ranges for paragraph and mark storage. Paragraphs exactly
partition nonempty content. Marks use declared inclusivity, same-type writes clip overlapping ranges,
and invalid stored overlaps are rejected.

Rich-text editing is character-level collaborative state rather than whole-string last-writer-wins.
Paragraph split/merge behavior and mark boundaries are shared by editor persistence, interpolation,
migration, rendering, and export.

Documents are CRDT-backed. The UI undo scope includes node state and root document fields. Durable
agent-operation undo is separately guarded by document head/sequence semantics.

## Rendering

Canvas owns a pinned OpenPencil source fork and a pinned Yoga Grid dependency. Provenance and the
local patch ledger live under `vendor/open-pencil/`. The active engine exposes a Canvas-object to
scene-graph adapter; it does not expose the Pencil file parser.

Icons remain semantic library-backed nodes. Images are asset-backed fills, not a separate image node.
Legacy script nodes are migration input. Migration materializes a recorded output when available and
otherwise drops the script with an explicit entry in the human-readable migration report. Shader
fills use document-owned resources and bounded rendering.

Bundled or document-owned font files are the controller's exact font-byte source. Browser IndexedDB
is not available to the Node controller.

## Operations and storage

The App operation controller reads account-scoped documents through Penkra's project service. Large
snapshots and assets use chunked transfer. `documents.execute` runs bounded JavaScript against a
private clone, validates the result, and commits one coherent mutation atomically. It does not drive
the editor UI.

Document collection state subscribes before its initial list load and reconciles an authoritative
post-handshake list, covering create/trash races. Sharing and lifecycle operations remain explicit
rather than side effects of opening or editing.

Migration is an internal stored-projection concern, not a public App operation or an open-path side
effect. Canonical migrations operate on Canvas/Yjs state and do not restore Pencil compatibility.
The current Account document set has already been migrated and verified.

## Export

All exporters consume the same resolved intermediate representation. It retains tree order,
geometry, paint, text runs and paragraphs, semantics, active capability paths, consequences, and
raster scope.

Capabilities use a closed `native` / `raster` / `ignore` verdict plus explicit verification status.
An unverified active path blocks production export unless the format table gives it an explicit,
measured raster fallback. Rasterization has a declared scope, effect outset, authored bounds, and
format-specific sampling scale; Canvas does not crop or silently downscale.
CanvasKit effect outsets use the renderer's sigma=`radius/2` convention and Skia's three-sigma kernel
support. Raster policies are explicit per format. PDF page boxes use declared physical and bleed
geometry when present; otherwise ordinary extraction derives page size from the node's pixels at
72 dpi. Folds and safe margins remain advisory and emit nothing.

Implemented targets are:

- editable PPTX for deck frames;
- roleless, multi-node PDF extraction, including the optional bounded PDF/X-4 profile;
- semantic responsive HTML/CSS for web routes;
- SwiftUI and Jetpack Compose source for mobile screens;
- PNG and SVG subtree extraction.

Export consequences enumerate every semantic or editability loss without requiring the artifact to
be opened. Artifact-specific conformance and fidelity evidence lives in the implementation ledger
and compatibility tests.

Canvas exports static designs. Prototype flows are intentionally ignored by every export target;
the exporter IR carries an empty flow collection and no target emits navigation or transitions.

## Security and failure behavior

Controller scripts, imported scripts, asset paths, filenames, output paths, network access, and
resource use are validated at their owning boundary. Unsupported behavior fails closed. A manifest
declaration is not evidence of a runtime capability; native controller behavior is verified on each
advertised platform.

App publication and destructive lifecycle actions remain separately authorized effects. QA
documents go to recoverable Trash. Internal migrations are verified against stored projections
before publication rather than exposed as a user-facing command.

## Evidence

- `research/implementation-progress.md` — reconciled implementation and gate evidence.
- `research/canvas-architecture-revision-4.md` — complete historical revision-4 design, stages,
  reviews, and rationale.
- `research/code-review-fix-status.md` — revision-4 correction record.
- `research/ui-qa-2026-09-04.md` — live and automated QA record.
- `compatibility/` — executable browser, export, and platform-conformance evidence.
