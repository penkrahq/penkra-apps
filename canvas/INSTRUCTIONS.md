# Canvas

Canvas is Penkra's collaborative editor for Pencil `.pen` design documents. Documents are stored in
the user's Penkra Account rather than in one Space; a Space controls whether Canvas and its agent
operations are available. The visible editor and agent operations act on the same saved document,
including its hierarchy, reusable components, semantic icons, variables, themes, and preserved
future Pencil data.

Use Canvas when the intended artifact is an editable design document that the user can continue to
select, rearrange, and author in the editor. Keep text, layout, icons, components, gradients, and
other supported design concepts native to the document model. A rendered likeness made from
flattened paths or raster imagery is not equivalent when the design is meant to remain editable.

Canvas document IDs are durable and Account-scoped. Node IDs are the stable identity inside a
document. Resolve either from an actual operation result or the user's exact reference; never infer
one from a title, visual position, or previously observed tab. A tab ID identifies one visible App
surface and is separate from the document it currently shows.

Creating, editing, opening, sharing, renaming, and moving a document to Trash are distinct actions.
Only move a document to Trash when the user's request authorizes removing that document from the
active library. Trash is recoverable; agents cannot permanently delete Canvas documents. Sharing
changes another account's access and requires the exact intended person and access level.

Each operation's leaf help explains when and how to use that operation, including Canvas's exact
Pencil authoring semantics where they matter. In particular, `canvas documents execute --help` is
the complete guide to the document model, hierarchy, layout, text wrapping, components, selectors,
mutation functions, screenshots, limits, and safe recovery. Read that help before authoring or
repairing document content rather than importing assumptions from HTML, CSS, SVG, Figma, or a
different Pencil tool surface.

Operation results and screenshots are evidence about a particular saved sequence. If the document
changes afterward, inspect the current state before drawing conclusions or applying a previous
repair. Canvas commits each mutating execute call atomically and returns an operation ID that can be
undone only while that operation remains the exact document head.
