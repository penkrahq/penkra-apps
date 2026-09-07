# Canvas asset upload hardening — 2026-09-07

## Revision and scope

The isolated worktree was created only after checking the requested path was
absent:

```text
/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/asset-upload-hardening
```

It is on branch `codex/canvas-asset-upload-hardening-20260907`, based at the
exact combined HEAD `e8a2962ae635adbb0c5c79c3691b726cc16aa3c5`.

Only `canvas/src/canvas-api.mjs` upload handling was changed. `readAsset`,
storage/schema/materializer code, backend code, native targets, manifests,
and capabilities were not changed.

## Implementation

`uploadAsset` now snapshots the requested path, hash, MIME, and a copied
`Uint8Array` before its first await. The snapshot supplies the start metadata,
all multipart chunks, and the final caller-authoritative path.

Ready and multipart-complete receipts must be non-array objects with exactly
the requested SHA-256 and byte length. Returned MIME is preserved backend
metadata, including when deduplication returns a prior MIME; an omitted
returned MIME remains compatible. Backend path normalization cannot replace
the caller path. Uploading receipts must provide a positive
safe-integer `chunkSize` before any part request. All these receipt failures
use `CANVAS_ASSET_UPLOAD_RECEIPT_INVALID`; no retries or cleanup were added.

## Tests

Final strict focused command:

```text
node --test canvas/src/canvas-api.test.mjs canvas/src/luna-asset-upload-integrity.test.mjs canvas/src/luna-library-storage-protocol.test.mjs canvas/src/library-storage.test.mjs canvas/src/luna-asset-empty-read.test.mjs
```

Exit `0`; **55 passed, 0 failed, 0 cancelled, 0 skipped**; duration
`632.609042 ms`. The count includes the four nested phase checks in the
protocol test.

The new six-case suite covers synchronous caller mutation isolation with exact
multipart chunks, valid ready receipts and backend-path normalization, a
deduplicated ready receipt whose prior MIME differs from the requested MIME
while its byte identity remains unchanged, ready receipt missing/wrong hash
and size plus array failures, equivalent multipart completion failures, and
invalid chunk sizes before the first part.
Existing nonzero range and zero-byte read cases remain in the selection.

Two existing fixtures were updated because the stricter receipt contract made
their prior metadata underspecified:

- `canvas/src/canvas-api.test.mjs` multipart completion now returns truthful
  `size: 3`, and its expected result includes that size;
- `canvas/src/luna-library-storage-protocol.test.mjs` wrong-hash and wrong-size
  expectations now record the earlier API-boundary code
  `CANVAS_ASSET_UPLOAD_RECEIPT_INVALID` (the missing-receipt case already used
  that code). This is the newly earlier failure boundary; no protocol source
  was changed.

The first combined attempt exposed that fixture update and a test-harness gate
bug; only the exact task-owned Node process was stopped. After correcting the
harness, the isolated new suite passed `5/5` before the MIME correction, then
`6/6` after it; the existing API suite passed `20/20`, and the final combined
selection above passed completely.

## MIME correction

The backend deduplicates project blobs by owner and SHA-256 and can return the
prior blob's MIME from `publicBlob(prior)` when a later request uses a different
requested MIME. Therefore receipt MIME is not an integrity invariant. The
follow-up source commit removes only MIME equality enforcement while retaining
the requested MIME snapshot for the upload-start request. Hash, size, object
shape, array rejection, and caller-path normalization remain enforced. No
backend source was changed.

## Commits and limits

- Source: `abee97a` — `fix(canvas): harden asset upload receipts`
- Tests: `1ab9ecc` — `test(canvas): verify asset upload snapshot integrity`
- MIME correction source: `c5460be` — `fix(canvas): allow deduplicated receipt MIME`
- MIME correction test: `02d059d` — `test(canvas): cover deduplicated receipt MIME`
- Evidence: this file, committed separately.

The worktree dependency install used `bun install --frozen-lockfile`; ignored
dependencies are local to this worktree and are not part of the commits. No
native/device/backend action, capability promotion, or combined-worktree
mutation occurred.
