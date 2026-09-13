# Canvas

Canvas is Penkra's Account-scoped collaborative editor for cloud-hosted design documents. It owns
its document model and does not import, export, or preserve Pencil files.

## Design authority

[`design/canvas.pen`](./design/canvas.pen) is the approved and authoritative source for Canvas UI
hierarchy, language, states, and visual composition. Keep implementation behavior and copy
reconciled with that file; historical design briefs live only in Git history.

The implemented model and runtime contract are documented in
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Unfinished Canvas work belongs only in
the ignored local `TODO.md`; tracked research and QA files are evidence, not
parallel plans.

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
- The visible editor uses an audited, locally owned scene/layout/CanvasKit/input
  engine derived from OpenPencil. Its normalized graph is disposable view state and the Canvas Yjs
  model remains canonical.
- Unsupported Canvas behavior fails visibly instead of being silently approximated.

OpenPencil provenance and the reproducible narrow-bundle entrypoint live in
[`vendor/open-pencil/`](./vendor/open-pencil/). Canvas does not depend on the
published 0.13.2 packages or their vulnerable `expr-eval` dependency.

Run `bun run test` for the runtime model/API suite and `bun run build` to create
the package-only `dist/` directory. The build copies the approved
`penkra-app.json` into that package.

See [`RESEARCH.md`](./RESEARCH.md) for the standards and upstream-project audit.
