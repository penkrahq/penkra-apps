# Canvas standards and upstream audit

Reviewed 2026-08-25. Primary sources are linked so each architectural choice can
be revisited against the implementation that inspired it.

## Collaboration and offline behavior

- [Yjs](https://github.com/yjs/yjs) is the CRDT. Its network-agnostic update and
  state-vector APIs let Penkra retain server-side Account authorization instead
  of exposing a renderer credential.
- [Yjs offline guidance](https://docs.yjs.dev/getting-started/allowing-offline-editing)
  recommends combining a network provider with `y-indexeddb`. Canvas follows
  that pattern and waits for IndexedDB replay before computing the state-vector
  diff that must be sent back to the server.
- [Yjs UndoManager](https://docs.yjs.dev/api/undo-manager) tracks only Canvas's
  local transaction origin. Remote changes therefore remain when a user undoes
  their own edit.
- Awareness is ephemeral and is not stored in the document, matching the
  [Yjs awareness model](https://docs.yjs.dev/api/about-awareness). The initial
  Canvas pass exposes a presence count, not remote cursors.

## Owned engine and rendering

- Canvas has no Pencil file-compatibility contract. Earlier Pencil format research informed the
  initial engine fork, but `.pen` import/export, format fixtures and parser exposure were deleted by
  product decision on 2026-09-04. The canonical Canvas schema is the semantic contract.
- Pencil [Code on Canvas](https://docs.pencil.dev/core-concepts/code-on-canvas)
  defines script nodes as a separate derived runtime: synchronous sandboxed
  JavaScript, schema-declared inputs, deterministic randomness, a two-second
  limit, and at most 1,000 returned nodes. Canvas does not reinterpret ordinary
  document-operation scripts as this node runtime.
- Pencil's official [AI integration](https://docs.pencil.dev/getting-started/ai-integration)
  and [headless CLI](https://docs.pencil.dev/for-developers/pen-cli) both expose
  `TakeScreenshot([nodeId, ...])` alongside document mutation. Canvas follows
  that node-targeted contract: the operation renders the post-mutation document
  directly and returns PNG evidence without requiring the editor tab to be
  visible.
- [OpenPencil](https://github.com/open-pencil/open-pencil) is MIT licensed. Canvas owns a fork of its
  scene graph, layout, renderer and editor integration; it does not retain OpenPencil file IO.
- OpenPencil's documented architecture uses a normalized scene graph,
  CanvasKit, Yoga, and a WebRTC/Yjs collaboration layer. Its current `.pen`
  adapter imports but does not provide a lossless `.pen` export oracle.
- Canvas adopts a narrow engine seam generated from audited OpenPencil commit
  [`4a5e7d5`](https://github.com/open-pencil/open-pencil/commit/4a5e7d557064d941fbac88bd492586db5257ff5f):
  editor graph, Yoga layout, Canvas-object scene adapter, CanvasKit surface/input, and text editing.
  It does not ship a Pencil parser, the stale published 0.13.2 packages, their tools surface, or
  `expr-eval`.
- The OpenPencil-derived graph is regenerated disposable view state. Canvas writes supported editor
  mutations into its Yjs-backed Canvas model, which remains canonical for collaboration, offline
  recovery and export.
- Pencil's [format schema](https://docs.pencil.dev/for-developers/the-pen-format)
  reserves `/` out of source node IDs and uses slash-separated keys in a
  ref's `descendants` map to address nested instance content. Canvas uses that
  authored address directly as the disposable scene node ID for an instance
  descendant (for example, `instance/child/nested-child`). The same stable value
  therefore drives hit testing, selection, Layers, Inspector, clipboard
  references, refresh restoration, and the mechanical Yjs write to
  `descendants[path]`; no name or geometry fallback is involved.
- OpenPencil's own [Layers model](https://github.com/open-pencil/open-pencil/blob/master/packages/vue/src/primitives/LayerTree/model.ts)
  is built from the live scene graph rather than
  the source file's unexpanded tree. Canvas follows that architecture so
  component-instance descendants remain visible and selectable in Layers while
  the Canvas model remains the persistence authority.
- Unsupported visual behavior is reported in the editor and preserved in source;
  Canvas does not hide it with compatibility heuristics.

## Platform boundary

- Account credentials and App install receipts stay in the trusted Penkra main
  process. The App calls only the public `@penkra/sdk` runtime and its declared
  `account-data` permission.
- App semantic operations are typed in the public manifest and route document
  opening through Penkra tabs; controller code does not depend on renderer DOM.
