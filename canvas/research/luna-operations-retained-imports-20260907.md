# Retained imports in Canvas operations

Date: 2026-09-07  
Worktree: `canvas-parallel-20260906/library-loading`  
Branch: `codex/canvas-library-loading-20260907`  
Preserved prior handoff: `4831ab3`

## Commits

- `032233c` — reject retention on legacy imports at the schema boundary
- `5f2e429` — schema regression for legacy live/exact pin records with retention
- `57748e0` — wire `documents.export` and `documents.extract` to `loadRetainedCanvasImports`
- `c3f1f4e` — registered-handler retained import matrix

## Verification

Schema-only command:

```text
node --test src/canvas-schema.test.mjs
```

Exit `0`; 18 tests passed; 0 failed, cancelled, or skipped.

Handler smoke command:

```text
node --test src/operations-retained-imports.test.mjs src/operations.test.mjs
```

Exit `0`; 13 tests passed; 0 failed, cancelled, or skipped.

Strict focused selection:

```text
node --test src/operations.test.mjs src/operations-retained-imports.test.mjs src/canvas-schema.test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-retained-loader.test.mjs src/library-storage.test.mjs src/library-retained-imports.test.mjs
```

Exit `0`; 83 tests passed; 0 failed, cancelled, or skipped. `git diff --check`
passed.

## Matrix coverage

- Both registered handlers use `loadRetainedCanvasImports(api, document,
  {documentId: input.documentId})`; the existing root-plus-imported asset map is
  preserved.
- The valid path creates a real accepted receipt through `createCanvasApi` and
  `createLibraryStorage` over a fake public Account upload/read transport, then
  restores the consumer through its Yjs projection. The source release is not
  available to the operation after acceptance. SVG extraction writes a real
  temporary artifact containing imported `Library card` text, dark-mode
  `#eeeeee` output, and a data PNG from the namespaced retained asset. HTML
  export also writes a real bundle and its raster asset.
- Missing retention fails with `CANVAS_IMPORT_RETENTION_REQUIRED` before the
  requested SVG destination exists. Corrupted receipt bytes fail with
  `CANVAS_IMPORT_INTEGRITY`; denied consumer blob reads fail with
  `ACCESS_DENIED`. These paths publish no destination and make zero source
  requests.
- Empty imports retain extraction behavior and perform no blob-range/library
  read; the existing operation tests remain green.
- Legacy records with retention are rejected structurally, including both
  `pin: "live"` and `pin: "exact"` forms. Follow discovery records without
  retention remain supported by the schema/normalizer contract.

Temporary generated outputs were test-owned and removed by test cleanup. No
operation markdown, manifest, backend, native/device, or live Canvas document
was changed. This is operation-seam and retained-receipt verification; it does
not claim public operation rollout or backend persistence beyond the tested
transport protocol.
