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

## `.pen` and rendering

- Pencil's live [`.pen` format](https://docs.pencil.dev/for-developers/the-pen-format)
  is the semantic contract. Canvas currently targets schema 2.17, including
  native icon nodes, gradients, frame defaults, variables/themes, refs, and
  effects; the exact boundary is recorded in
  `compatibility/pencil-2.17-support.md`.
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
- [OpenPencil](https://github.com/open-pencil/open-pencil) is MIT licensed and is
  the strongest public `.pen` implementation found. Canvas pins a real commit in
  `compatibility/openpencil-oracle.json` and differentially checks import shape
  and stable source IDs against that implementation.
- OpenPencil's documented architecture uses a normalized scene graph,
  CanvasKit, Yoga, and a WebRTC/Yjs collaboration layer. Its current `.pen`
  adapter imports but does not provide a lossless `.pen` export oracle.
- Canvas adopts a narrow engine seam generated from audited OpenPencil commit
  [`4a5e7d5`](https://github.com/open-pencil/open-pencil/commit/4a5e7d557064d941fbac88bd492586db5257ff5f):
  editor graph, Yoga layout, `.pen` reader, CanvasKit surface/input, and text
  editing. It does not ship the stale published 0.13.2 packages, their tools
  surface, or `expr-eval`.
- The OpenPencil graph is regenerated disposable view state. Canvas writes
  supported editor mutations into the lossless Yjs `.pen` model, which remains
  canonical for collaboration, offline recovery, and export. Unknown data is
  therefore never made dependent on OpenPencil's normalized representation.
- Unsupported visual behavior is reported in the editor and preserved in source;
  Canvas does not hide it with compatibility heuristics.

## Platform boundary

- Account credentials and App install receipts stay in the trusted Penkra main
  process. The App calls only the public `@penkra/sdk` runtime and its declared
  `account-data` permission.
- File import uses the public scoped file-handle API. Canvas never reads a host
  path directly.
- App semantic operations are typed in the public manifest and route document
  opening through Penkra tabs; controller code does not depend on renderer DOM.
