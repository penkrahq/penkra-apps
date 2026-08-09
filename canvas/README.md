# Canvas

Canvas is Penkra's Account-scoped collaborative editor for cloud-hosted design
documents. Its first supported interchange format is `.pen`.

## Design authority

[`design/canvas.pen`](./design/canvas.pen) is the approved and authoritative source for Canvas UI
hierarchy, language, states, and visual composition. Keep implementation behavior and copy
reconciled with that file; historical design briefs live only in Git history.

Platform architecture and implementation work remain tracked in the client
workspace's authoritative `TODO.md`, not in this App directory.

Format preservation research lives in [`compatibility/`](./compatibility/).
The checked-in differential oracle tests the real OpenPencil parser at a pinned
upstream commit.

Local CRDT validation lives in [`collaboration/`](./collaboration/). It
establishes the lossless Yjs document model and convergence/undo behavior.

## Runtime architecture

- The Penkra backend owns Account authentication, document access, durable Yjs
  updates, snapshots, sharing grants, and realtime subscription authorization.
- The trusted Penkra host mediates the App's declared `account-data` permission;
  Account cookies and install receipts never enter App renderer code.
- The App combines its network provider with official `y-indexeddb` persistence
  so a previously opened document remains editable offline and merges on
  reconnect.
- Unknown `.pen` document fields, node types, and node properties remain in the
  Yjs source model and survive supported edits and export.
- The visible editor uses a narrow OpenPencil scene/layout/CanvasKit/input seam
  pinned to an audited upstream commit. Its normalized graph is disposable view
  state; the lossless Yjs `.pen` model remains canonical.
- Canvas labels preserved unsupported visual behavior instead of silently
  approximating it or claiming full compatibility.

OpenPencil provenance and the reproducible narrow-bundle entrypoint live in
[`vendor/open-pencil/`](./vendor/open-pencil/). Canvas does not depend on the
published 0.13.2 packages or their vulnerable `expr-eval` dependency.

Run `bun run test` for the runtime model/API suite and `bun run build` to create
the package-only `dist/` directory. The build copies the approved
`penkra-app.json` into that package.

See [`RESEARCH.md`](./RESEARCH.md) for the standards and upstream-project audit.
