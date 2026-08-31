# Canvas

## What this App is

Canvas is Penkra's collaborative editor for Pencil `.pen` design documents. Documents are stored in
the user's Penkra Account rather than in one Space; a Space controls whether Canvas and its agent
operations are available. The visible editor and agent operations act on the same saved document,
including its hierarchy, reusable components, semantic icons, variables, themes, and preserved
future Pencil data.

## Before you write anything

Use Canvas when the intended artifact is an editable design document that the user can continue to
select, rearrange, and author. Keep text, layout, icons, components, gradients, and other supported
design concepts native to the document model. A rendered likeness made from flattened paths or
raster imagery is not equivalent when the design is meant to remain editable.

Resolve document and node identity from an actual operation result or the user's exact reference.
Document IDs are durable and Account-scoped; node IDs are stable within a document. Never infer
either from a title, visual position, or previously observed tab. A tab ID identifies one visible
App surface and is separate from the document it currently shows.

Creating, editing, opening, sharing, renaming, and moving a document to Trash are distinct actions.
Trash is recoverable and agents cannot permanently delete Canvas documents. Sharing changes another
account's access and requires the exact intended person and access level.

## How to do the common thing

Use the document operation matching the requested lifecycle action. For document content, read
`canvas documents execute --help` before authoring or repairing the design, then use the returned
document sequence and operation ID to ground subsequent work. Canvas commits each mutating execute
call atomically.

## Reference

Each operation's leaf help explains when and how to use that operation. `canvas documents execute
--help` is the complete guide to Canvas's Pencil document model, hierarchy, layout, text wrapping,
components, selectors, mutation functions, screenshots, limits, and safe recovery. Use it instead
of importing assumptions from HTML, CSS, SVG, Figma, or a different Pencil tool surface.

## When things fail

Operation results and screenshots describe one saved sequence. If the document changes afterward,
read the current state before drawing conclusions or applying an earlier repair. An operation can be
undone only while it remains the exact document head; otherwise preserve the newer work and use the
operation's leaf help to choose a safe recovery.
