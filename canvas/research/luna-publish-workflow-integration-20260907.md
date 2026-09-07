# Canvas publish-workflow integration verification — 2026-09-07

## Approved integration

Starting combined HEAD `e6d58b48eab044146721af92110c6a9026883354`, the approved commits were
inspected and cherry-picked in this exact order:

| Worker commit | Combined commit |
| --- | --- |
| `496972494a71ac2a8b6afe2b30a79d493c738081` | `030913d3f2e8807c708947cec0b432de6ff9b12f` |
| `6c0d77e2cc248a5f2001215d9d91abb093ff921f` | `0a8a53738e29df59fd8ac7fdc0ce9d325d4e0338` |
| `f141fb4eb6c251e57726237eaa50c08983c65a31` | `f5be3e2c5358fc7bb2f7cff1ed394081532c8bce` |
| `2f4c971230bdd8b07a796670cdf57ae7ddb8a457` | `25e6930f99a1a29229a7cbf1333e3271d8faafb5` |

Scope was limited to the new `library-publish-workflow.mjs`, its direct and independent tests,
and independent research evidence. No manifest, operation declaration, protected file, native,
live-document, capability, or public-operation change was made. Root workflow `4969724` was
integrated as explicitly approved; no later wiring was inferred.

## Strict test receipt

At integrated test revision `25e6930f99a1a29229a7cbf1333e3271d8faafb5`, the command was:

`node --test $(rg --files canvas/src -g 'library-*.test.mjs' | sort) canvas/src/canvas-api.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/canvas-resolver.test.mjs canvas/src/canvas-schema.test.mjs canvas/src/luna-library-storage-protocol.test.mjs collaboration/pen-yjs-model.test.mjs`

Log: `/tmp/luna-publish-workflow-20260907.log`.

Exit `0`; `180` passed, `0` failed, `0` cancelled, `0` skipped; duration `679.781625 ms`.
The selection covered library publication/retention/storage/head/loader composition, the
publish workflow, API/import/resolver/schema, the real library storage protocol, and Yjs model
tests. No native build or live document write ran.

## Read-only operation/runtime dispatch inventory

- `canvas/penkra-app.json:17-20` declares the tab entrypoint `app.html` and controller
  `operations.js`. Its `operations` array at `:33-640` currently declares 11 keys:
  `documents.list`, `documents.create`, `documents.execute`, `documents.undo`,
  `documents.export`, `documents.extract`, `documents.open`, `documents.trash`,
  `sharing.list`, `sharing.add`, and `sharing.remove`. Each declaration carries a `key`, input
  JSON schema, output JSON schema, optional instruction path/examples, and a matching `handler`;
  no library publish/accept/inspect key is declared.
- `canvas/src/operations.mjs:19-21` is the controller registration seam. It requires
  `globalThis.penkra.operations`, creates `createCanvasApi(runtime)`, and registers handlers by
  calling `runtime.operations.handle(name, async (input, context) => result)`.
  Registrations are at lines 23, 40, 69, 81, 91, 244, 270, 307, 345, 348, and 351. The
  existing inspect shape is internal to `documents.execute({ documentId, code }, context)`:
  `document-inspection.inspectDocument` is dynamically loaded when the script requires
  inspection (lines 99-107); it is not a separate operation.
- `canvas/src/canvas-api.mjs:8-18` is the Account-data facade, returning methods for document
  reads, state/projection reads, asset list/read/upload, update append, snapshot creation,
  undo, sharing, subscriptions, and image generation. The new
  `canvas/src/library-publish-workflow.mjs:12-65` exports
  `publishCanvasLibrary(api, input)` and is directly callable with an API facade; it is not
  imported or registered by `operations.mjs`.
- `canvas/src/library-publication-head.mjs:15-34` provides the existing direct accept/read seam
  `readPublishedCanvasLibrary(api, libraryId)`, returning `{ release, assets, publication }` and
  optional `retentions`; it likewise has no registered operation wrapper. This is the closest
  existing acceptance path, while inspection currently remains the `documents.execute` path.
- `canvas/scripts/build.mjs:45-52` bundles `src/operations.mjs` as the Node-targeted ESM
  `dist/operations.js`; `:77-91` rewrites lazy module specifiers in that generated bundle.
  There is no separate local dispatcher or operation registry beyond the host-provided
  `runtime.operations.handle` calls. `canvas/dist/operations.js` is generated output, not an
  additional source registration seam.
- `canvas/src/operations.test.mjs:42-71` installs a fake host `operations.handle` collector and
  asserts the exact current 11-key registration set. `canvas/src/operations-retained-imports.test.mjs:167-171`
  uses the same collector for retained export/extract behavior; it does not register library
  publish/accept/inspect handlers.

Future publish/accept/inspect wiring would therefore require coordinated manifest schemas and
instruction entries, controller `runtime.operations.handle` registrations, and corresponding
registration/handler tests. Those files were inventoried only; no wiring was implemented here.
