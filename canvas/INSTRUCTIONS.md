# Canvas

## What this App is

Canvas creates, imports, edits, reviews, and shares collaborative `.pen` design documents stored in the user's Penkra Account. A Space enables Canvas but does not own or partition its documents. Canvas preserves source fields it cannot yet render, saves local edits automatically, and merges offline work after reconnection.

## Before you write anything

A Canvas document is a versioned tree of typed nodes—frames, text, icons, paths, reusable definitions, and references—with variables and themes attached. The schema is not self-evident. Before the first write:

1. Call `["canvas", "documents", "list"]` and identify the exact document.
2. Export it with `["canvas", "documents", "export"]` and `input: { "documentId": "<id>" }`. Read the node types, property names, child shapes, and document version from its `.pen` JSON.
3. Match that version. Do not copy node shapes from another document without verifying that its version and schema agree with the target.

Never guess a document ID, node ID, hierarchy, current value, or property shape. Preserve unknown fields, node types, reusable components, variables, and instance overrides. A renderer warning is not permission to flatten or delete source data.

Canvas has no agent-facing undo. Treat writes to an existing document as irreversible. Prefer small `documents.mutate` batches, export after every structural change, and confirm the saved document still reads. A successful write proves only that operation returned success; it does not prove every later reader or renderer can consume the result. `documents.delete` is permanent and requires the user to confirm deletion plus an exact `confirmTitle`; authorization to edit is not authorization to delete.

`documents.get` caps nodes and rejects serialized responses above 40,000 bytes with the actual size. Lower `nodeLimit` or use `documents.export` for complete source. A response-limit error or truncated read is not evidence that the document is corrupt.

## How to do the common thing

To update a header safely:

1. List documents and choose the target from returned metadata.
2. Export the target and inspect its version, header node ID, parent, layout, text properties, fills, and references.
3. Apply the narrowest change with `["canvas", "documents", "mutate"]`:

   ```json
   {
     "documentId": "<document-id>",
     "mutations": [{
       "kind": "set-property",
       "nodeId": "page-header-title",
       "property": "content",
       "value": "Quarterly product review"
     }]
   }
   ```

4. Export again and verify the exact node, its parent, and the nearest clipping ancestor.
5. Open the document with `documents.open`. Use its returned tab ID with `selection.set` and `viewport.focus`, then inspect the visible result. If a screenshot reports the tab is hidden, focus it and capture again; Canvas does not change the user's active tab merely to satisfy a screenshot.

Use stable, descriptive IDs because references, selection, collaboration, and later edits depend on them. Prefer explicit frame layout, dimensions, padding, gap, alignment, and clipping. Use auto layout for repeated rows, controls, cards, and navigation; use `layout: none` only for intentional free positioning. Keep instances and reusable definitions intact when a property edit is enough.

## Reference

Use `documents.mutate` for a small declarative batch. Use `documents.execute` only when traversal, repeated edits, or conditional logic makes a batch less clear. Execute runs QuickJS against a private clone with no network, file, Account, browser, timer, or Penkra-runtime access. Canvas attempts one commit after the script finishes, validates structurally, and confirms the source sequence has not changed. Do not infer stronger durability than the returned result and a post-write export establish.

Execute globals are `Get`, `Insert`, `Copy`, `Update`, `Replace`, `Delete`, `Move`, and `Print`. Selectors are exact: `#node-id`, `type:frame`, `name:Header`, `*`, a slash-separated ID path, or an unprefixed exact node ID. `Get` returns immutable contexts. Visitor traversal defaults to and is capped at 1,000 matches. Scripts are limited to 100,000 UTF-8 bytes, a 64 MiB heap, a 4 MiB stack, five seconds of CPU time, and bounded JSON input/output. Returned and printed values must be JSON-serializable.

Every visible text node needs intentional content, font family, size, weight, line height, alignment, fill, and a width/height mode appropriate to wrapping. Font loading changes metrics, so recheck wrapping, truncation, overlap, and clipping after typography edits. Write visible labels and messages as finished product copy with specific verbs, concrete nouns, sentence case, and enough context to explain consequences.

The generated operation list and each operation's `--help` output are the authoritative input/output contracts. Sharing adds or removes editors by Penkra Account email but sends no email. Downloaded `.pen` files contain current local state, including edits not yet synchronized.

`documents.delete` finds metadata through the document list rather than decoding the document, so an owner can delete an unreadable document. Only an owner may call it. Read the current title, obtain explicit user confirmation for that document, then pass the title exactly in `confirmTitle`. Never infer deletion permission from a cleanup request that did not name the document or from a failed edit.

## When things fail

- `CANVAS_DOCUMENT_CHANGED`: a collaborator changed the source. Export the latest state, reconsider the edit, and issue a new operation. Never blindly replay stale code.
- Invalid node, property, or schema errors: stop writing. Compare the payload with the target's exported version and reduce the change to the smallest valid mutation.
- Execute timeout, heap, stack, byte, or JSON errors: split work into smaller bounded calls and validate between them.
- Truncated `documents.get`: use `documents.export`; truncation is a response bound, not document damage.
- Renderer warnings: preserve source data, inspect returned issues, and fix only verified properties.
- Hidden-tab screenshot: focus the explicit tab, then capture again.
- Post-write export failure: stop immediately, retain the document ID and exact operation results, and report that the document may be unreadable. Do not continue editing to repair unknown corruption.

Review is incomplete after one successful operation. Inspect changed nodes, their parents, and the nearest clipping ancestor; resolve missing text, fills, layout, variables, components, icons, and renderer approximations; then visually exercise important states at realistic widths.
