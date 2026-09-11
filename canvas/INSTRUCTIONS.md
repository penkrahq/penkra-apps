# Canvas

Canvas is Penkra's collaborative visual design workspace. Designs are saved to the user's Penkra
Account and remain fully editable: people and agents can continue arranging layers, changing copy,
refining styles, and reviewing the same document together. A finished design can be exported to the
artifact it was designed to become — a presentation, a PDF, a website, or mobile source.

## When to use Canvas

Use Canvas when the result should be a visual design the user can keep editing in Penkra, including:

- presentation slides and pitch decks;
- app screens, website concepts, and interface mockups;
- marketing graphics, social posts, posters, and one-page visual assets;
- diagrams, visual explainers, and structured information graphics;
- reusable design systems, components, and screen families;
- visual exploration where the user wants to compare distinct directions before choosing one.

Canvas is especially useful when composition matters: hierarchy, typography, imagery, color,
spacing, alignment, and the relationship between multiple frames. Use a document, spreadsheet,
codebase, or image-generation workflow when the requested result belongs primarily in that medium.

## What a Canvas document is

Two properties shape everything else: the document's module and the roles on its export frames.

A document has a **module** — `generic`, `deck`, `web`, or `mobile`. Choose `generic` for freeform
work and artifacts extracted directly as PNG, SVG, or PDF. Choose a deliverable module when the
result is a PowerPoint presentation, website, or mobile source. A generic document may use
`SetModule` once while it has no role-bearing frames; a deliverable module does not change later.

Deck, web, and mobile work each has a Skill: `canvas-deck`, `canvas-web`, and `canvas-mobile`.
Read the one matching the deliverable module before designing. Generic work uses
`documents.extract`, whose operation manual describes PNG, SVG, multi-page PDF, physical sizing,
bleed, and the optional PDF/X-4 profile.

Within a document, a frame carrying a **role** is a deliverable export unit: one slide, one route,
or one iOS or Android screen. The valid roles are `slide`, `route`, `ios`, and `android`. Creation
presets stamp the starter role; additional export frames must carry the matching exact value. Most
frames have no role at all. Any node can still be extracted directly; a frame becomes a PDF page by
declaring `physical`, not by carrying a page role.

## What agents can do

Agents can find and open existing designs, create new documents, inspect their structure, make
precise edits, and export the result. A Canvas document can contain:

- role-bearing frames for slides, routes, and mobile screens, plus roleless physical frames for PDF pages;
- nested layouts, groups, text, shapes, paths, icons, and images;
- exact icon discovery across the bundled Lucide, Feather, Material Symbols, and Phosphor catalogs;
- solid colors, gradients, strokes, opacity, blur, and shadows;
- reusable components and instances with per-instance overrides;
- variables and appearance axes that resolve differently per mode;
- review screenshots that show the saved design without editor controls.

Agents can also share an owned document with another Penkra Account, inspect current sharing, and
remove access. Sharing grants editor access, notifies nobody, and is only ever done when the user
asks for it in those terms.

## Designing well

Start from the user's outcome and the document already in front of them. Preserve approved content,
brand decisions, and useful existing structure. When a brief is open-ended, establish a concise
visual direction—mood, palette, typography, imagery, and composition—before committing to a full
design.

Build in meaningful sections so the user can see progress and redirect early. For multiple design
directions, make the alternatives genuinely different in visual personality, not small palette or
spacing variations. Keep each direction coherent enough to judge on its own, and keep them in one
document, side by side, where they can be compared.

Treat Canvas as a professional design surface:

- create a clear hierarchy rather than merely placing all required content;
- use typography, scale, whitespace, imagery, and contrast deliberately;
- avoid repetitive card grids and decorative effects that do not support the concept;
- use images and icons when they materially improve the design, not as placeholders for judgment;
- keep repeated elements aligned and structurally consistent;
- keep text readable and ensure content fits its frame without clipping;
- reuse components when a visual pattern genuinely repeats;
- prefer targeted refinement over deleting and rebuilding sound existing work.

Review each meaningful section visually after creating or changing it. Check spacing, typography,
contrast, alignment, clipping, repetition, and whether the result actually expresses the intended
idea. A technically valid document is not necessarily a good design.

## Working collaboratively

Canvas documents can change while an agent is working. Read the current saved state before making
dependent edits, and re-read when a node is missing or no longer matches what was previously
observed. Preserve newer work rather than recreating or undoing it from stale assumptions.

Document IDs identify designs; node IDs identify layers within a design; tab IDs identify visible
Canvas surfaces. Resolve each from Canvas or Penkra results instead of inferring it from a title or
screen position, and copy an identifier from the result that produced it rather than reconstructing
one from memory.
