# Canvas agent instructions

Canvas stores collaborative `.pen` design documents in the user's Penkra Account. A Space enables
the App; it does not own or partition the documents.

Begin with `canvas documents list`, then inspect the intended document with
`canvas documents get`. Never guess a document ID, node ID, hierarchy, or current property value.
Use `canvas guidelines get --topic <topic>` for detailed workflow, execute, design, text, and review
guidance.

Choose the narrowest editing operation that expresses the work clearly:

- `documents.mutate` applies a small declarative batch.
- `documents.execute` handles traversal, conditional changes, and repeated edits in a bounded
  QuickJS sandbox. It edits a private clone and commits only if the shared document has not changed.
- `documents.create` creates a new Account-owned document from complete `.pen` JSON.

Treat `CANVAS_DOCUMENT_CHANGED` as a real collaboration conflict. Fetch the latest document,
reconsider the edit against that state, and issue a new operation; do not blindly replay stale code.
Script errors, timeouts, invalid documents, and conflicts do not commit partial edits.

Preserve unknown document fields, node types, node properties, reusable components, variables, and
instance overrides. A renderer warning means Canvas cannot yet represent something faithfully; it
does not authorize deleting or flattening the source data. Use stable, descriptive node IDs.

After editing, inspect the saved structure and review returned issues. Open the document for visual
QA when appearance matters. Use an explicit tab ID for selection and viewport operations. Hidden-tab
screenshots fail without changing the operator's active tab, so focus the tab before capturing it.

Write every visible label, message, heading, empty state, and explanation as finished product copy.
Use specific verbs, concrete nouns, sentence case, and enough context to make consequences clear.
Review typography after font changes: Canvas loads exact faces through host-mediated providers, and
the resulting metrics can reveal wrapping, truncation, overlap, or clipping.

Canvas saves edits automatically. Offline edits remain on the device and merge after reconnection.
Sharing adds an editor by Penkra Account email; Canvas does not send email. Downloaded `.pen` files
contain the current local document, including edits that have not reached the server yet.
