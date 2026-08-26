# Canvas

## What this App is

Canvas creates, edits, reviews, and shares collaborative design documents stored in the user's
Penkra Account. Documents belong to the Account rather than one Space; a Space controls whether
Canvas and its operations are available. The visible Canvas tab and agent operations act on the
same saved document.

## Before you write anything

Resolve the exact document with `documents.list`. For an existing design, begin with a read-only
`documents.execute` call using `Get` to inspect the nodes you intend to change, their parents,
resolved bounds, and reported problems. Never guess document IDs, node IDs, hierarchy, property
names, or current values.

Preserve unknown fields, reusable definitions, references, variables, themes, and instance
overrides unless the requested result requires changing them. Use stable, descriptive node IDs;
selection, references, collaboration, and later edits depend on them.

One execution should express one coherent design intent. It may create or update many nodes when
they belong to the same result. Canvas validates the complete resulting tree before committing and
rejects a stale source sequence, but there is no agent-facing undo. Inspect affected structure with
`Get`, and call `TakeScreenshot` after the mutations it should verify whenever appearance matters.
The screenshot renders document nodes directly and does not require an open or visible Canvas tab.

Moving a document to recoverable Trash is separate authority. Editing, repair, or general cleanup
does not authorize it. Agents cannot permanently delete Canvas documents.

## How to do the common thing

To create and review a mobile screen:

1. Create the document:

   ```text
   canvas documents create --title "Penut Mobile"
   ```

2. Use the returned `documentId` and `starterFrameId` in one `documents.execute` call that replaces
   the starter frame with the complete screen. Do not insert a second frame over it. End the script
   with `TakeScreenshot([screen])`, where `screen` is the ID returned by `Replace`. Use the
   operation's `--help` for the exact DSL, limits, and examples.
3. Review the returned PNG together with the touched-node inspection. Check text, hierarchy,
   clipping, layout, spacing, contrast, and the problems list. Correct verified issues with a new
   focused execution and take another screenshot.
4. Open the document only when the user should view or continue working in the Canvas editor:

   ```text
   canvas documents open --document-id "<document-id>"
   ```

For an existing document, omit creation: list, inspect with a read-only execution, make one
coherent change, then inspect and visually review it with `TakeScreenshot`.

## Reference

`documents.execute` is the sole document-content operation. A script that only uses `Get`, `Print`,
and return values is read-only and does not advance the document sequence. A script that uses
Insert, Copy, Update, Replace, Delete, or Move returns the exact touched node IDs and their current
post-execution inspection. `TakeScreenshot([target, ...])` renders exact nodes together after all
script mutations. `Get` contexts describe the source at the start of an execution, so use a
following read-only execution when you need surrounding post-write structure.

The generated help for each operation is authoritative for its input, output, examples, DSL,
limits, and recovery rules. Root instructions describe workflow rather than duplicating those
contracts. The contributed Canvas design Skill contains the longer design-craft and review
procedure; load it for substantial creation, redesign, responsive, component, typography, or
accessibility work.

Canvas has no agent-facing source export or import operation. People import and download `.pen`
files through the Canvas UI. Agents create blank documents and edit them semantically. Sharing
operations add or remove editor access by Penkra Account email and do not send email.

## When things fail

- `CANVAS_DOCUMENT_CHANGED`: a collaborator changed the source. Read the current state, reconsider
  the edit against it, and issue a new execution. Never blindly replay stale code.
- Invalid node, property, or tree: nothing was committed. Correct the smallest verified cause; do
  not add guessed compatibility fields or replace unrelated source data.
- Timeout, heap, stack, byte, or JSON error: narrow the traversal or split unrelated design intents.
  Do not split a single component into partially valid states merely to fit a call.
- Missing or null bounds: inspect the node's hierarchy and renderer problems. A node may be
  nonvisual, unsupported, detached, or dependent on unresolved layout.
- Renderer warnings: preserve source data and fix only properties you can verify. A warning is not
  permission to flatten or delete unknown content.
- Visual mismatch after a successful write: keep the operation result, inspect affected nodes, then
  make a new focused correction and call `TakeScreenshot` again. Do not claim completion from
  `changed: true`.
- Unreadable owned document: stop editing, retain the exact document ID and operation evidence, and
  report the failure. If the user explicitly authorizes moving it to Trash, `documents.trash` can
  do so through metadata without decoding its content.
