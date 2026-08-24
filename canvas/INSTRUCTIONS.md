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
rejects a stale source sequence, but there is no agent-facing undo. After a write, inspect the
affected nodes and relevant ancestors with a separate read-only execution. When appearance matters,
open the document and inspect its Canvas tab before declaring the work complete.

Document deletion is separate, permanent authority. Editing, repair, or general cleanup does not
authorize it.

## How to do the common thing

To create and review a mobile screen:

1. Create the document with structured input:

   ```json
   {
     "command": ["canvas", "documents", "create"],
     "input": { "title": "Penut Mobile" }
   }
   ```

2. Use the returned `documentId` in one `documents.execute` call that builds the complete screen.
   Use the operation's `--help` for the exact DSL, limits, and examples.
3. Run a read-only execution over the new screen, its parent, and any clipping ancestor. Confirm
   the intended text, hierarchy, bounds, and an empty or understood problems list.
4. Open the document:

   ```json
   {
     "command": ["canvas", "documents", "open"],
     "input": { "documentId": "<document-id>" }
   }
   ```

5. Pass the returned `tabId` to `penkra tabs snapshot` or `penkra tabs screenshot`. Check the
   composition at the requested size and exercise important visible states. Semantic success alone
   is not visual verification.

For an existing document, omit creation: list, inspect with a read-only execution, make one
coherent change, inspect again, then open and review it visually.

## Reference

`documents.execute` is the sole document-content operation. A script that only uses `Get`, `Print`,
and return values is read-only and does not advance the document sequence. A script that uses
Insert, Copy, Update, Replace, Delete, or Move returns the exact touched node IDs and their current
post-execution inspection. Use a following read-only execution for surrounding structure because
`Get` contexts describe the source at the start of an execution.

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
- Visual mismatch after a successful write: keep the operation result, inspect the visible tab and
  affected nodes, then make a new focused correction. Do not claim completion from `changed: true`.
- Unreadable owned document: stop editing, retain the exact document ID and operation evidence, and
  report the failure. If the user explicitly authorizes deletion, `documents.delete` can remove it
  through metadata without decoding its content.
