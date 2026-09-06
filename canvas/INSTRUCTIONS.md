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

Two properties shape everything else, and both are decided before any design work begins.

A document has a **module** — `deck`, `print`, `web`, or `mobile` — chosen at creation and **fixed
for the life of the document**. The module decides what the design can become: a presentation, a
PDF, a website, or mobile source. It cannot be changed later and a document cannot hold two, so it
is chosen from the artifact the user wants at the end.

Each module carries its own working knowledge, and there is a Skill for each: `canvas-deck`,
`canvas-print`, `canvas-web`, and `canvas-mobile`. Read the one matching the document's module
before designing. It describes what that target can express, what it cannot, and what will therefore
be flattened to an image on the way out — which is far cheaper to know before the work than after.

Within a document, a frame carrying a **role** is an export unit: one slide, one page, one route,
one screen. Roles arrive stamped from module presets and are never typed by hand. Most frames have
no role at all — layouts, cards, groups, and reusable components are ordinary frames, and anything
sitting outside a role frame is scratch space that no export will ever collect.

## What agents can do

Agents can find and open existing designs, create new documents, inspect their structure, make
precise edits, and export the result. A Canvas document can contain:

- role-bearing frames for slides, pages, routes, and screens;
- nested layouts, groups, text, shapes, paths, icons, and images;
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
